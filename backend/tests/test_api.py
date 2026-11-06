from sqlalchemy import select
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

from app.database import Base, engine, SessionLocal
from app.main import app
from app.models import DiscardReason, Document, Role, User, Vacancy
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



    def register_and_login_candidate(self, email="docente@cecar.edu.co", name="Aspirante Docente"):
        headers = self.csrf_headers()
        response = self.client.post(
            "/api/auth/register",
            headers=headers,
            json={
                "name": name,
                "email": email,
                "password": "a-very-safe-password",
                "privacy_consent": True,
            },
        )
        self.assertEqual(response.status_code, 201)
        token = re.search(r"token=([^\s]+)", self.email_messages[-1][2]).group(1)
        verified = self.client.post(
            "/api/auth/verify-email",
            headers=self.csrf_headers(),
            json={"token": token},
        )
        self.assertEqual(verified.status_code, 200)
        return verified.json()

    def create_admin_client(self):
        with SessionLocal() as db:
            admin_user = User(
                name="Administrador TH CECAR",
                email="admin_th@cecar.edu.co",
                password_hash=password_hash.hash("admin-password-1234"),
                role=Role.ADMIN,
                faculty="Gestión del Talento Humano",
                email_verified_at=datetime.now(timezone.utc),
            )
            db.add(admin_user)
            # Add sample discard reasons
            if not db.scalar(select(DiscardReason.id).limit(1)):
                db.add_all([
                    DiscardReason(id="formacion_no_cumple", code="DES-FORM", name="No cumple formación académica mínima", active=True),
                    DiscardReason(id="soportes_no_subsanados", code="DES-SUBS", name="Documentos no subsanados a tiempo", active=True),
                ])
            db.commit()

        client = TestClient(app)
        csrf = client.get("/api/auth/csrf").json()["csrfToken"]
        login = client.post(
            "/api/auth/login",
            headers={"X-CSRF-Token": csrf},
            json={"email": "admin_th@cecar.edu.co", "password": "admin-password-1234"},
        )
        self.assertEqual(login.status_code, 200)
        return client

    def create_sample_vacancy(self, admin_client):
        res = admin_client.post(
            "/api/vacancies",
            headers={"X-CSRF-Token": admin_client.cookies.get("recruitpro_csrf")},
            json={
                "code": "CONV-2026-DOC-01",
                "title": "Aspirante: Nuevo a docente cátedra",
                "type": "Cátedra Universitaria",
                "faculty": "Facultad de Educación y Ciencias Sociales",
                "program": "Licenciatura en Educación Infantil",
                "campus": "Sede Principal Sincelejo",
                "academic_period": "2026-2",
                "vacancies_count": 2,
                "modality": "Presencial",
                "description": "Convocatoria docente de méritos",
                "status": "active",
            },
        )
        self.assertEqual(res.status_code, 201)
        return res.json()["id"]

    def test_catalogos_cecar(self):
        """RF-080, RF-097: Catálogos institucionales CECAR y 26 tipos de ítems de HV"""
        res = self.client.get("/api/catalogos")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("Facultad de Educación y Ciencias Sociales", data["facultades"])
        self.assertIn("Licenciatura en Educación Infantil", data["programas"])
        self.assertIn("Sede Principal Sincelejo", data["sedes"])
        self.assertGreaterEqual(len(data["tipos_items_hv"]), 26)
        self.assertTrue(any(it["id"] == "HV-006" for it in data["tipos_items_hv"]))
        self.assertTrue(any(it["id"] == "HV-025" for it in data["tipos_items_hv"]))

    def test_hoja_de_vida_por_items_soportes_y_constancia(self):
        """RF-014 a RF-042: Cada dato se registra como ítem independiente con su soporte"""
        self.register_and_login_candidate()
        admin = self.create_admin_client()
        vac_id = self.create_sample_vacancy(admin)

        # 1. Iniciar borrador de postulación (RF-014, RF-015, RN-001)
        draft_res = self.client.post(
            "/api/applications/draft",
            headers=self.csrf_headers(),
            json={"vacancy_id": vac_id, "privacy_consent": True},
        )
        self.assertEqual(draft_res.status_code, 201)
        app_id = draft_res.json()["applicationId"]

        # 2. Agregar ítem de formación académica (HV-006)
        item_res = self.client.post(
            f"/api/applications/{app_id}/items",
            headers=self.csrf_headers(),
            json={
                "item_type": "HV-006",
                "section": "formacion",
                "title": "Licenciado en Educación - CECAR",
                "data": {"institucion": "CECAR", "ano": 2020, "titulo": "Licenciado"},
            },
        )
        self.assertEqual(item_res.status_code, 201)
        item_id = item_res.json()["id"]

        # 3. Adjuntar soporte PDF al ítem (RF-032)
        pdf_bytes = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF"
        sup_res = self.client.post(
            f"/api/applications/{app_id}/items/{item_id}/support",
            headers=self.csrf_headers(),
            files={"file": ("acta_grado.pdf", pdf_bytes, "application/pdf")},
        )
        self.assertEqual(sup_res.status_code, 201)
        sup_id = sup_res.json()["id"]

        # 4. Visualizar y descargar soporte con autorización (RF-035)
        view_res = self.client.get(f"/api/items/{item_id}/supports/{sup_id}/view")
        self.assertEqual(view_res.status_code, 200)
        self.assertEqual(view_res.headers["content-type"], "application/pdf")

        # 5. Agregar experiencia laboral (HV-009)
        exp_res = self.client.post(
            f"/api/applications/{app_id}/items",
            headers=self.csrf_headers(),
            json={
                "item_type": "HV-009",
                "section": "experiencia",
                "title": "Docente Titular - Colegio Comfasucre",
                "data": {"empresa": "Comfasucre", "cargo": "Docente", "anos": 3},
            },
        )
        self.assertEqual(exp_res.status_code, 201)
        exp_id = exp_res.json()["id"]
        # Adjuntar certificado
        self.client.post(
            f"/api/applications/{app_id}/items/{exp_id}/support",
            headers=self.csrf_headers(),
            files={"file": ("cert_laboral.pdf", pdf_bytes, "application/pdf")},
        )

        # 6. Consultar expediente / dossier (RF-045)
        dossier = self.client.get(f"/api/applications/{app_id}/dossier").json()
        self.assertEqual(dossier["status"], "borrador")
        self.assertIn("formacion", dossier["itemsBySection"])
        self.assertIn("experiencia", dossier["itemsBySection"])

        # 7. Envío definitivo de la postulación (RF-039)
        submit_res = self.client.post(
            f"/api/applications/{app_id}/submit",
            headers=self.csrf_headers(),
        )
        self.assertEqual(submit_res.status_code, 200)
        self.assertEqual(submit_res.json()["status"], "enviada")

        # 8. Comprobar bloqueo después del envío (RF-041, RN-009)
        blocked_edit = self.client.put(
            f"/api/applications/{app_id}/items/{item_id}",
            headers=self.csrf_headers(),
            json={"title": "Intento de edición unilateral"},
        )
        self.assertEqual(blocked_edit.status_code, 403)

        # 9. Generar y descargar Constancia Formal de Postulación (RF-040)
        constancia_res = self.client.get(f"/api/applications/{app_id}/constancia")
        self.assertEqual(constancia_res.status_code, 200)
        self.assertIn("CONSTANCIA FORMAL DE POSTULACIÓN", constancia_res.text)
        self.assertIn("Aspirante Docente", constancia_res.text)

    def test_revision_documental_subsanacion_y_revisión_estricta(self):
        """RF-043 a RF-053: Revisión por ítem, subsanación y regla RN-011"""
        self.register_and_login_candidate()
        admin = self.create_admin_client()
        vac_id = self.create_sample_vacancy(admin)

        # Crear y enviar postulación
        draft = self.client.post(
            "/api/applications/draft",
            headers=self.csrf_headers(),
            json={"vacancy_id": vac_id, "privacy_consent": True},
        ).json()
        app_id = draft["applicationId"]

        item1 = self.client.post(
            f"/api/applications/{app_id}/items",
            headers=self.csrf_headers(),
            json={"item_type": "HV-006", "section": "formacion", "title": "Pregrado"},
        ).json()["id"]
        pdf_bytes = b"%PDF-1.4\nsample pdf\n%%EOF"
        self.client.post(
            f"/api/applications/{app_id}/items/{item1}/support",
            headers=self.csrf_headers(),
            files={"file": ("pregrado.pdf", pdf_bytes, "application/pdf")},
        )

        item2 = self.client.post(
            f"/api/applications/{app_id}/items",
            headers=self.csrf_headers(),
            json={"item_type": "HV-009", "section": "experiencia", "title": "Experiencia"},
        ).json()["id"]
        self.client.post(
            f"/api/applications/{app_id}/items/{item2}/support",
            headers=self.csrf_headers(),
            files={"file": ("exp.pdf", pdf_bytes, "application/pdf")},
        )

        self.client.post(f"/api/applications/{app_id}/submit", headers=self.csrf_headers())

        # Admin revisa bandeja (RF-043, RF-094)
        board = admin.get("/api/applications/review-board").json()
        self.assertGreaterEqual(board["metrics"]["totalUsers"], 1)

        # Admin aprueba item1 y observa item2 (RF-046, RF-047)
        admin_csrf = {"X-CSRF-Token": admin.cookies.get("recruitpro_csrf")}
        appr = admin.post(
            f"/api/applications/{app_id}/items/{item1}/review",
            headers=admin_csrf,
            json={"result": "aprobado"},
        )
        self.assertEqual(appr.status_code, 200)

        obs = admin.post(
            f"/api/applications/{app_id}/items/{item2}/review",
            headers=admin_csrf,
            json={"result": "observado", "reason": "Certificado laboral ilegible o sin funciones"},
        )
        self.assertEqual(obs.status_code, 200)
        self.assertEqual(obs.json()["documentStatus"], "observado")

        # Admin solicita subsanación con 5 días de plazo (RF-048)
        req_subs = admin.post(
            f"/api/applications/{app_id}/subsanacion/request",
            headers=admin_csrf,
            json={"days": 5, "general_note": "Por favor adjunta certificación con funciones"},
        )
        self.assertEqual(req_subs.status_code, 200)
        self.assertEqual(req_subs.json()["status"], "subsanacion_requerida")

        # Regla RN-011 / RF-049: Candidato intenta editar item1 (aprobado) -> DEBE SER RECHAZADO (403)
        edit_approved = self.client.put(
            f"/api/applications/{app_id}/items/{item1}",
            headers=self.csrf_headers(),
            json={"title": "Intento de cambiar ítem aprobado"},
        )
        self.assertEqual(edit_approved.status_code, 403)

        # Candidato edita item2 (observado) -> PERMITIDO
        edit_obs = self.client.put(
            f"/api/applications/{app_id}/items/{item2}",
            headers=self.csrf_headers(),
            json={"title": "Experiencia Corregida y Certificada"},
        )
        self.assertEqual(edit_obs.status_code, 200)

        # Candidato radica subsanación (RF-050)
        submit_subs = self.client.post(
            f"/api/applications/{app_id}/subsanacion/submit",
            headers=self.csrf_headers(),
        )
        self.assertEqual(submit_subs.status_code, 200)
        self.assertEqual(submit_subs.json()["status"], "en_revision")
        self.assertEqual(submit_subs.json()["version"], 2)

    def test_fase2_salud_contratacion_vinculacion_e_integracion(self):
        """RF-101 a RF-106: Salud ocupacional, formalización de contrato, vinculación e integración institucional"""
        self.register_and_login_candidate()
        admin = self.create_admin_client()
        vac_id = self.create_sample_vacancy(admin)

        draft = self.client.post(
            "/api/applications/draft",
            headers=self.csrf_headers(),
            json={"vacancy_id": vac_id, "privacy_consent": True},
        ).json()
        app_id = draft["applicationId"]

        admin_csrf = {"X-CSRF-Token": admin.cookies.get("recruitpro_csrf")}

        # 1. Registrar examen ocupacional (RF-101, RN-027, RNF-028)
        exam_res = admin.post(
            f"/api/applications/{app_id}/occupational-exam",
            headers=admin_csrf,
            json={"fitness_concept": "apto", "provider": "IPS Ocupacional CECAR"},
        )
        self.assertEqual(exam_res.status_code, 200)
        self.assertEqual(exam_res.json()["concept"], "apto")

        # 2. Gestionar expediente de contratación y checklist (RF-102, RF-103)
        hiring_res = admin.post(
            f"/api/applications/{app_id}/hiring-dossier",
            headers=admin_csrf,
            json={
                "checklist": {"minuta_contrato": True, "cuenta_davivienda": True, "seguridad_social": True},
                "contract_status": "firmado",
            },
        )
        self.assertEqual(hiring_res.status_code, 200)
        self.assertEqual(hiring_res.json()["status"], "firmado")

        # 3. Confirmar vinculación laboral (RF-104, RN-025)
        bind_res = admin.post(
            f"/api/applications/{app_id}/confirm-binding",
            headers=admin_csrf,
            json={"employee_code": "CECAR-DOC-2026-089", "start_date": datetime.now(timezone.utc).isoformat()},
        )
        self.assertEqual(bind_res.status_code, 200)
        self.assertEqual(bind_res.json()["status"], "vinculada")
        self.assertEqual(bind_res.json()["employeeCode"], "CECAR-DOC-2026-089")

        # 4. Transferir a hoja de vida institucional (RF-105, RF-106, RN-026)
        transfer_res = admin.post(
            f"/api/applications/{app_id}/transfer-institutional-hv",
            headers=admin_csrf,
        )
        self.assertEqual(transfer_res.status_code, 200)
        self.assertEqual(transfer_res.json()["status"], "transferido")

    def test_reportes_especializados_y_export_csv(self):
        """RF-096, RF-097, RF-079: 3 reportes especializados y exportación a Excel/CSV"""
        admin = self.create_admin_client()
        admin_csrf = {"X-CSRF-Token": admin.cookies.get("recruitpro_csrf")}

        # Reporte 1: No aprobados
        r1 = admin.get("/api/reports/specialized?report_type=no_aprobados")
        self.assertEqual(r1.status_code, 200)
        self.assertIn("records", r1.json())

        # Reporte 2: En proceso
        r2 = admin.get("/api/reports/specialized?report_type=en_proceso")
        self.assertEqual(r2.status_code, 200)

        # Reporte 3: Seleccionados
        r3 = admin.get("/api/reports/specialized?report_type=seleccionados")
        self.assertEqual(r3.status_code, 200)

        # Exportación CSV con encoding UTF-8 BOM para Excel
        exp = admin.get("/api/reports/export?report_type=seleccionados")
        self.assertEqual(exp.status_code, 200)
        self.assertEqual(exp.headers["content-type"], "text/csv; charset=utf-8")
        self.assertTrue(exp.content.startswith(b"\xef\xbb\xbf"))  # UTF-8 BOM

    def test_mesa_de_ayuda_tickets(self):
        """RF-099: Mesa de ayuda, casos y respuestas de soporte"""
        self.register_and_login_candidate()
        admin = self.create_admin_client()

        # Candidato crea ticket
        ticket_res = self.client.post(
            "/api/tickets",
            headers=self.csrf_headers(),
            json={
                "category": "Postulación y Documentos",
                "subject": "Duda sobre tarjeta profesional",
                "message": "¿Puedo adjuntar certificado de trámite provisional mientras expiden la tarjeta?",
            },
        )
        self.assertEqual(ticket_res.status_code, 201)
        ticket_id = ticket_res.json()["id"]

        # Admin responde ticket
        admin_csrf = {"X-CSRF-Token": admin.cookies.get("recruitpro_csrf")}
        reply_res = admin.post(
            f"/api/tickets/{ticket_id}/reply",
            headers=admin_csrf,
            json={"response": "Sí, es permitido adjuntar constancia de trámite en trámite oficial."},
        )
        self.assertEqual(reply_res.status_code, 200)

        # Candidato consulta sus tickets y ve respuesta
        my_tickets = self.client.get("/api/tickets").json()["tickets"]
        self.assertEqual(len(my_tickets), 1)
        self.assertEqual(my_tickets[0]["status"], "resuelto")
        self.assertIn("constancia de trámite", my_tickets[0]["response"])



if __name__ == "__main__":
    unittest.main()
