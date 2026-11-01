import os
import shutil
import tempfile
import unittest
from pathlib import Path
import sys
import re
from unittest.mock import patch
from datetime import datetime, timezone


TEST_ROOT = Path(tempfile.mkdtemp(prefix="recruitpro-tests-"))
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_ROOT / 'test.db'}"
os.environ["DATA_DIR"] = str(TEST_ROOT / "private")
os.environ["COOKIE_SECURE"] = "false"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient

from app.database import Base, engine
from app.main import app
from app.models import Document, Role, User
from app.retention import purge_inactive_candidates
from app.security import password_hash


class RecruitProApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)
        cls.client = TestClient(app)
        cls.client.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.client.__exit__(None, None, None)
        Base.metadata.drop_all(bind=engine)
        engine.dispose()
        shutil.rmtree(TEST_ROOT)

    def setUp(self):
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        self.email_messages = []
        self.email_patcher = patch(
            "app.main.send_email",
            side_effect=lambda *message: self.email_messages.append(message),
        )
        self.email_patcher.start()
        private_dir = TEST_ROOT / "private" / "private_uploads"
        if private_dir.exists():
            for entry in private_dir.iterdir():
                entry.unlink()
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        self.email_patcher.stop()

    def csrf_headers(self):
        token = self.client.get("/api/auth/csrf").json()["csrfToken"]
        return {"X-CSRF-Token": token}

    def register_candidate(self, email="candidate@example.com"):
        headers = self.csrf_headers()
        response = self.client.post(
            "/api/auth/register",
            headers=headers,
            json={
                "name": "Test Candidate",
                "email": email,
                "password": "a-very-safe-password",
                "role": "administrador",
                "privacy_consent": True,
            },
        )
        if response.status_code != 201:
            return response
        token = re.search(
            r"token=([^\s]+)",
            self.email_messages[-1][2],
        ).group(1)
        verified = self.client.post(
            "/api/auth/verify-email",
            headers=self.csrf_headers(),
            json={"token": token},
        )
        self.assertEqual(verified.status_code, 200)
        return verified

    def test_registration_forces_candidate_and_session_cookie_is_http_only(self):
        response = self.client.post(
            "/api/auth/register",
            headers=self.csrf_headers(),
            json={
                "name": "Test Candidate",
                "email": "candidate@example.com",
                "password": "a-very-safe-password",
                "role": "administrador",
                "privacy_consent": True,
            },
        )
        self.assertEqual(response.status_code, 201)
        self.assertNotIn("recruitpro_session", self.client.cookies)
        self.assertIn("emailSent", response.json())
        self.assertEqual(self.client.get("/api/auth/me").status_code, 401)
        token = re.search(r"token=([^\s]+)", self.email_messages[-1][2]).group(1)
        response = self.client.post(
            "/api/auth/verify-email",
            headers=self.csrf_headers(),
            json={"token": token},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["role"], "candidato")
        self.assertIn("httponly", response.headers["set-cookie"].lower())
        self.assertIn("samesite=strict", response.headers["set-cookie"].lower())
        self.assertEqual(self.client.get("/api/auth/me").json()["email"], "candidate@example.com")
        self.assertIsNotNone(response.json()["privacyConsentAt"])

    def test_verification_and_password_recovery_tokens_are_single_use(self):
        registration = self.client.post(
            "/api/auth/register",
            headers=self.csrf_headers(),
            json={
                "name": "Pending Candidate",
                "email": "pending@example.com",
                "password": "a-very-safe-password",
                "privacy_consent": True,
            },
        )
        self.assertEqual(registration.status_code, 201)
        self.assertEqual(
            self.client.post(
                "/api/auth/login",
                headers=self.csrf_headers(),
                json={"email": "pending@example.com", "password": "a-very-safe-password"},
            ).status_code,
            403,
        )

        self.client.post(
            "/api/auth/verification/resend",
            headers=self.csrf_headers(),
            json={"email": "pending@example.com"},
        )
        verification_token = re.search(
            r"token=([^\s]+)", self.email_messages[-1][2]
        ).group(1)
        verified = self.client.post(
            "/api/auth/verify-email",
            headers=self.csrf_headers(),
            json={"token": verification_token},
        )
        self.assertEqual(verified.status_code, 200)
        reused = self.client.post(
            "/api/auth/verify-email",
            headers=self.csrf_headers(),
            json={"token": verification_token},
        )
        self.assertEqual(reused.status_code, 400)

        reset_request = self.client.post(
            "/api/auth/password-reset",
            headers=self.csrf_headers(),
            json={"email": "pending@example.com"},
        )
        self.assertEqual(reset_request.status_code, 202)
        reset_token = re.search(r"token=([^\s]+)", self.email_messages[-1][2]).group(1)
        reset = self.client.post(
            "/api/auth/password-reset/confirm",
            headers=self.csrf_headers(),
            json={"token": reset_token, "new_password": "a-new-safe-password"},
        )
        self.assertEqual(reset.status_code, 200)
        reused_reset = self.client.post(
            "/api/auth/password-reset/confirm",
            headers=self.csrf_headers(),
            json={"token": reset_token, "new_password": "another-new-password"},
        )
        self.assertEqual(reused_reset.status_code, 400)
        self.assertEqual(
            self.client.post(
                "/api/auth/login",
                headers=self.csrf_headers(),
                json={"email": "pending@example.com", "password": "a-new-safe-password"},
            ).status_code,
            200,
        )

    def test_application_tracking_assignment_and_candidate_data_deletion(self):
        self.register_candidate()

        from app.database import SessionLocal

        with SessionLocal() as db:
            admin_user = User(
                name="Admin",
                email="admin@example.com",
                password_hash=password_hash.hash("admin-safe-password-123"),
                role=Role.ADMIN,
                email_verified_at=datetime.now(timezone.utc),
            )
            recruiter = User(
                name="Recruiter",
                email="recruiter@example.com",
                password_hash=password_hash.hash("recruiter-safe-password"),
                role=Role.RECRUITER,
                email_verified_at=datetime.now(timezone.utc),
            )
            db.add_all([admin_user, recruiter])
            db.commit()
            recruiter_id = recruiter.id

        admin = TestClient(app)
        admin.post(
            "/api/auth/login",
            headers={"X-CSRF-Token": admin.get("/api/auth/csrf").json()["csrfToken"]},
            json={"email": "admin@example.com", "password": "admin-safe-password-123"},
        )
        vacancy_response = admin.post(
            "/api/vacancies",
            headers={"X-CSRF-Token": admin.cookies.get("recruitpro_csrf")},
            json={
                "title": "Product Designer",
                "type": "Full-time",
                "location": "Remote",
                "description": "Design product experiences",
                "recruiter_id": recruiter_id,
            },
        )
        self.assertEqual(vacancy_response.status_code, 201)
        vacancy_id = vacancy_response.json()["id"]

        application_response = self.client.post(
            f"/api/vacancies/{vacancy_id}/applications",
            headers=self.csrf_headers(),
            data={
                "name": "Test Candidate",
                "phone": "+1 555 0100",
                "location": "Remote",
                "privacy_consent": "true",
            },
            files={"resume": ("candidate.pdf", b"%PDF-1.7\nsafe test resume", "application/pdf")},
        )
        self.assertEqual(application_response.status_code, 201)
        application_id = application_response.json()["applicationId"]

        update = admin.patch(
            f"/api/applications/{application_id}",
            headers={"X-CSRF-Token": admin.cookies.get("recruitpro_csrf")},
            json={
                "status": "entrevista",
                "assigned_recruiter_id": recruiter_id,
                "note": "Coordinar entrevista técnica",
            },
        )
        self.assertEqual(update.status_code, 200)
        self.assertTrue(update.json()["emailSent"])
        candidate_view = self.client.get("/api/applications/mine").json()["items"][0]
        self.assertEqual(candidate_view["status"], "entrevista")
        self.assertNotIn("activities", candidate_view)
        self.assertNotIn("note", candidate_view)

        recruiter_client = TestClient(app)
        recruiter_client.post(
            "/api/auth/login",
            headers={"X-CSRF-Token": recruiter_client.get("/api/auth/csrf").json()["csrfToken"]},
            json={"email": "recruiter@example.com", "password": "recruiter-safe-password"},
        )
        recruiter_vacancies = recruiter_client.get("/api/vacancies").json()["items"]
        self.assertEqual(len(recruiter_vacancies), 1)
        self.assertEqual(len(recruiter_vacancies[0]["applications"]), 1)
        self.assertEqual(recruiter_vacancies[0]["applications"][0]["id"], application_id)
        filtered_candidates = recruiter_client.get(
            "/api/users?role=candidato&status_filter=entrevista&location=Remote"
        ).json()
        self.assertEqual(filtered_candidates["total"], 1)
        self.assertEqual(filtered_candidates["items"][0]["email"], "candidate@example.com")
        vacancy_search = recruiter_client.get(
            "/api/vacancies?q=Product&location=Remote&page=1&page_size=1"
        ).json()
        self.assertEqual(vacancy_search["total"], 1)
        self.assertEqual(vacancy_search["items"][0]["id"], vacancy_id)

        stored_files = list((TEST_ROOT / "private" / "private_uploads").iterdir())
        self.assertEqual(len(stored_files), 1)
        deleted = self.client.request(
            "DELETE",
            "/api/auth/account",
            headers=self.csrf_headers(),
            json={"current_password": "a-very-safe-password"},
        )
        self.assertEqual(deleted.status_code, 204)
        self.assertEqual(self.client.get("/api/auth/me").status_code, 401)
        self.assertEqual(list((TEST_ROOT / "private" / "private_uploads").iterdir()), [])
        recruiter_client.close()
        admin.close()

    def test_retention_purges_inactive_candidate_and_private_file(self):
        from app.database import SessionLocal
        from app.main import UPLOAD_DIR
        from uuid import uuid4

        with SessionLocal() as db:
            candidate = User(
                name="Inactive Candidate",
                email="inactive@example.com",
                password_hash=password_hash.hash("a-very-safe-password"),
                role=Role.CANDIDATE,
                last_activity_at=datetime(2020, 1, 1, tzinfo=timezone.utc),
            )
            db.add(candidate)
            db.flush()
            storage_name = str(uuid4())
            db.add(
                Document(
                    owner_id=candidate.id,
                    original_name="old-cv.pdf",
                    media_type="application/pdf",
                    storage_name=storage_name,
                    size=8,
                )
            )
            db.commit()
            candidate_id = candidate.id

        stored_file = UPLOAD_DIR / storage_name
        stored_file.write_bytes(b"%PDF-1.7")
        self.assertEqual(purge_inactive_candidates(), 1)
        with SessionLocal() as db:
            self.assertIsNone(db.get(User, candidate_id))
        self.assertFalse(stored_file.exists())

    def test_state_changes_require_csrf_and_candidates_cannot_create_vacancies(self):
        response = self.register_candidate()
        self.assertEqual(response.status_code, 200)
        denied_csrf = self.client.post(
            "/api/vacancies",
            json={"title": "Engineer", "type": "Full-time", "description": "Role"},
        )
        self.assertEqual(denied_csrf.status_code, 403)
        denied_role = self.client.post(
            "/api/vacancies",
            headers=self.csrf_headers(),
            json={"title": "Engineer", "type": "Full-time", "description": "Role"},
        )
        self.assertEqual(denied_role.status_code, 403)

    def test_api_requires_authentication_and_rejects_cross_origin_writes(self):
        self.assertEqual(self.client.get("/api/vacancies").status_code, 401)
        csrf = self.csrf_headers()
        response = self.client.post(
            "/api/auth/register",
            headers={**csrf, "Origin": "https://untrusted.example"},
            json={
                "name": "Test Candidate",
                "email": "candidate@example.com",
                "password": "a-very-safe-password",
                "privacy_consent": True,
            },
        )
        self.assertEqual(response.status_code, 403)

    def test_frontend_is_served_without_exposing_backend_sources(self):
        self.assertIn("RecruitPro", self.client.get("/").text)
        self.assertEqual(self.client.get("/registro.html").status_code, 200)
        self.assertEqual(self.client.get("/dashboard.html").status_code, 200)
        self.assertEqual(self.client.get("/recuperar.html").status_code, 200)
        self.assertEqual(self.client.get("/restablecer.html").status_code, 200)
        self.assertEqual(self.client.get("/verificar.html").status_code, 200)
        self.assertEqual(self.client.get("/privacidad.html").status_code, 200)
        self.assertEqual(self.client.get("/js/dashboard.js").status_code, 200)
        self.assertEqual(self.client.get("/js/recovery.js").status_code, 200)
        self.assertEqual(self.client.get("/backend/app/main.py").status_code, 404)

    def test_documents_are_private_validated_and_candidate_owned(self):
        self.assertEqual(self.register_candidate().status_code, 200)
        invalid = self.client.post(
            "/api/documents",
            headers=self.csrf_headers(),
            files={"file": ("fake.pdf", b"not a PDF", "application/pdf")},
        )
        self.assertEqual(invalid.status_code, 415)

        uploaded = self.client.post(
            "/api/documents",
            headers=self.csrf_headers(),
            files={"file": ("cv.pdf", b"%PDF-1.7\nsafe test file", "application/pdf")},
        )
        self.assertEqual(uploaded.status_code, 201)
        document = uploaded.json()
        stored_files = list((TEST_ROOT / "private" / "private_uploads").iterdir())
        self.assertEqual(len(stored_files), 1)
        self.assertNotEqual(stored_files[0].name, "cv.pdf")
        self.assertEqual(self.client.get(f"/api/documents/{document['id']}").status_code, 200)

        second_client = TestClient(app)
        second_token = second_client.get("/api/auth/csrf").json()["csrfToken"]
        second_registration = second_client.post(
            "/api/auth/register",
            headers={"X-CSRF-Token": second_token},
            json={
                "name": "Other Candidate",
                "email": "other@example.com",
                "password": "another-safe-password",
                "privacy_consent": True,
            },
        )
        self.assertEqual(second_registration.status_code, 201)
        verification_token = re.search(
            r"token=([^\s]+)", self.email_messages[-1][2]
        ).group(1)
        second_client.post(
            "/api/auth/verify-email",
            headers={"X-CSRF-Token": second_token},
            json={"token": verification_token},
        )
        self.assertEqual(
            second_client.get(f"/api/documents/{document['id']}").status_code,
            404,
        )
        second_client.close()

    def test_only_admin_can_promote_a_candidate(self):
        self.register_candidate()
        denied = self.client.post(
            "/api/users/not-a-user/promote-recruiter",
            headers=self.csrf_headers(),
        )
        self.assertEqual(denied.status_code, 403)

        from app.database import SessionLocal

        with SessionLocal() as db:
            db.add(
                User(
                    name="Admin",
                    email="admin@example.com",
                    password_hash=password_hash.hash("another-safe-password"),
                    role=Role.ADMIN,
                    email_verified_at=datetime.now(timezone.utc),
                )
            )
            db.commit()

        admin = TestClient(app)
        csrf = admin.get("/api/auth/csrf").json()["csrfToken"]
        login = admin.post(
            "/api/auth/login",
            headers={"X-CSRF-Token": csrf},
            json={"email": "admin@example.com", "password": "another-safe-password"},
        )
        self.assertEqual(login.status_code, 200)
        candidate = admin.get("/api/users?role=candidato").json()["items"][0]
        result = admin.post(
            f"/api/users/{candidate['id']}/promote-recruiter",
            headers={"X-CSRF-Token": admin.cookies.get("recruitpro_csrf")},
        )
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["role"], "reclutador")
        admin.close()

    def test_recruiters_can_only_view_cv_for_their_assigned_vacancies(self):
        self.assertEqual(self.register_candidate().status_code, 200)

        from app.database import SessionLocal

        with SessionLocal() as db:
            admin_account = User(
                name="Admin",
                email="admin@example.com",
                password_hash=password_hash.hash("admin-safe-password-123"),
                role=Role.ADMIN,
                email_verified_at=datetime.now(timezone.utc),
            )
            recruiter = User(
                name="Recruiter One",
                email="recruiter@example.com",
                password_hash=password_hash.hash("recruiter-safe-password"),
                role=Role.RECRUITER,
                email_verified_at=datetime.now(timezone.utc),
            )
            other_recruiter = User(
                name="Recruiter Two",
                email="other-recruiter@example.com",
                password_hash=password_hash.hash("another-safe-password"),
                role=Role.RECRUITER,
                email_verified_at=datetime.now(timezone.utc),
            )
            db.add_all([admin_account, recruiter, other_recruiter])
            db.commit()
            recruiter_id = recruiter.id

        admin = TestClient(app)
        csrf = admin.get("/api/auth/csrf").json()["csrfToken"]
        login = admin.post(
            "/api/auth/login",
            headers={"X-CSRF-Token": csrf},
            json={"email": "admin@example.com", "password": "admin-safe-password-123"},
        )
        self.assertEqual(login.status_code, 200)
        vacancy_response = admin.post(
            "/api/vacancies",
            headers={"X-CSRF-Token": admin.cookies.get("recruitpro_csrf")},
            json={
                "title": "Engineer",
                "type": "Full-time",
                "description": "A test role",
                "recruiter_id": recruiter_id,
            },
        )
        self.assertEqual(vacancy_response.status_code, 201)
        vacancy_id = vacancy_response.json()["id"]

        application = self.client.post(
            f"/api/vacancies/{vacancy_id}/applications",
            headers=self.csrf_headers(),
            data={
                "name": "Test Candidate",
                "phone": "+1 555 0100",
                "location": "Remote",
                "privacy_consent": "true",
            },
            files={"resume": ("candidate.pdf", b"%PDF-1.7\nsafe test resume", "application/pdf")},
        )
        self.assertEqual(application.status_code, 201)

        recruiter_client = TestClient(app)
        recruiter_csrf = recruiter_client.get("/api/auth/csrf").json()["csrfToken"]
        recruiter_login = recruiter_client.post(
            "/api/auth/login",
            headers={"X-CSRF-Token": recruiter_csrf},
            json={"email": "recruiter@example.com", "password": "recruiter-safe-password"},
        )
        self.assertEqual(recruiter_login.status_code, 200)
        vacancy = recruiter_client.get("/api/vacancies").json()["items"][0]
        resume_id = vacancy["applications"][0]["resumeId"]
        self.assertEqual(recruiter_client.get(f"/api/documents/{resume_id}").status_code, 200)

        other_client = TestClient(app)
        other_csrf = other_client.get("/api/auth/csrf").json()["csrfToken"]
        other_login = other_client.post(
            "/api/auth/login",
            headers={"X-CSRF-Token": other_csrf},
            json={
                "email": "other-recruiter@example.com",
                "password": "another-safe-password",
            },
        )
        self.assertEqual(other_login.status_code, 200)
        self.assertEqual(other_client.get(f"/api/documents/{resume_id}").status_code, 404)
        self.assertEqual(other_client.get("/api/vacancies").json()["items"], [])
        recruiter_client.close()
        other_client.close()
        admin.close()


if __name__ == "__main__":
    unittest.main()
