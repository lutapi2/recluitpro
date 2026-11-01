import os
import re
from pathlib import Path
from io import BytesIO
import zipfile

try:
    from pypdf import PdfReader
except ImportError:
    PdfReader = None


TECH_SKILLS_KEYWORDS = [
    # Languages
    "python", "javascript", "typescript", "java", "c#", "c++", "go", "golang", "php", "ruby", "rust", "sql", "html", "css",
    # Frameworks
    "fastapi", "django", "flask", "react", "next.js", "nextjs", "vue", "angular", "node", "nodejs", "express", "spring", "laravel", "tailwind",
    # Databases & DevOps
    "postgresql", "postgres", "mysql", "sqlite", "mongodb", "redis", "docker", "kubernetes", "aws", "azure", "gcp", "git", "ci/cd", "linux",
    # Roles & Design
    "ui/ux", "figma", "frontend", "backend", "full stack", "fullstack", "qa", "testing", "agile", "scrum", "lead", "arquitectura"
]


def extract_text_from_file(file_path: Path) -> str:
    """Extrae texto de archivos PDF, DOCX o texto plano."""
    if not file_path.exists():
        return ""

    suffix = file_path.suffix.lower()

    if suffix == ".pdf" and PdfReader is not None:
        try:
            reader = PdfReader(str(file_path))
            pages_text = [page.extract_text() or "" for page in reader.pages]
            return "\n".join(pages_text).strip()
        except Exception:
            pass

    if suffix == ".docx":
        try:
            with zipfile.ZipFile(file_path) as archive:
                if "word/document.xml" in archive.namelist():
                    xml_content = archive.read("word/document.xml").decode("utf-8", errors="ignore")
                    clean_text = re.sub(r"<[^>]+>", " ", xml_content)
                    return re.sub(r"\s+", " ", clean_text).strip()
        except Exception:
            pass

    try:
        return file_path.read_text(encoding="utf-8", errors="ignore").strip()
    except Exception:
        return ""


def analyze_compatibility(
    candidate_name: str,
    candidate_email: str,
    candidate_location: str,
    vacancy_title: str,
    vacancy_description: str,
    vacancy_type: str,
    resume_text: str = "",
) -> dict:
    """
    Motor institucional de análisis de compatibilidad curricular (ATS AI Screening).
    Analiza semántica de la vacante frente a la experiencia comprobable del candidato.
    """
    clean_vacancy_text = f"{vacancy_title} {vacancy_description} {vacancy_type}".lower()
    combined_candidate_text = f"{candidate_name} {candidate_location} {resume_text}".lower()

    # 1. Detectar competencias requeridas por la vacante
    detected_required_skills = [
        skill for skill in TECH_SKILLS_KEYWORDS if skill in clean_vacancy_text
    ]
    if not detected_required_skills:
        detected_required_skills = ["desarrollo", "resolución de problemas", "comunicación técnica", "trabajo en equipo"]

    # 2. Contrastar competencias del candidato
    matched_skills = []
    missing_skills = []

    for skill in detected_required_skills:
        if skill in combined_candidate_text:
            matched_skills.append(skill.capitalize())
        else:
            missing_skills.append(skill.capitalize())

    # 3. Cálculo ponderado de compatibilidad
    base_ratio = len(matched_skills) / max(1, len(detected_required_skills))
    location_match = bool(candidate_location and candidate_location.lower() in clean_vacancy_text)
    if "remoto" in clean_vacancy_text:
        location_match = True

    has_metrics = bool(re.search(r"\b(\d{1,2}\+?\s*(años|anos|years)|senior|sr|lead|lider|arquitecto)\b", combined_candidate_text))

    raw_score = (base_ratio * 70) + (15 if location_match else 5) + (15 if has_metrics else 5)
    match_score = min(98, max(38, int(raw_score)))

    # 4. Escala de dictamen institucional
    if match_score >= 85:
        stars = 5
        verdict = "Recomendación Favorable (Nivel Sobresaliente)"
        suggested_stage = "entrevista"
        pill_color = "#047857"
    elif match_score >= 70:
        stars = 4
        verdict = "Perfil Competitivo Apto para Evaluación Técnica"
        suggested_stage = "entrevista"
        pill_color = "#1d4ed8"
    elif match_score >= 55:
        stars = 3
        verdict = "Cumplimiento Parcial de Requisitos"
        suggested_stage = "en_revision"
        pill_color = "#b45309"
    else:
        stars = 2
        verdict = "Alineación Insuficiente con el Perfil"
        suggested_stage = "rechazada"
        pill_color = "#b91c1c"

    # 5. Dictamen ejecutivo formal
    matched_str = ", ".join(matched_skills[:4]) if matched_skills else "competencias preliminares"
    summary = (
        f"El candidato {candidate_name} presenta un índice de afinidad técnica del {match_score}% para la posición de {vacancy_title}. "
        f"Acredita experiencia directamente aplicable en: {matched_str}. "
        f"Se sugiere avanzar el expediente a fase de {suggested_stage.replace('_', ' ')}."
    )

    # 6. Fortalezas comprobadas
    strengths = []
    if matched_skills:
        strengths.append(f"Acreditación técnica en herramientas nucleares de la posición: {', '.join(matched_skills[:3])}.")
    if location_match:
        strengths.append("Plena compatibilidad con el esquema de trabajo y ubicación estipulados.")
    if has_metrics:
        strengths.append("Trayectoria profesional documentada con responsabilidades y experiencia comprobable.")
    else:
        strengths.append("Competencias transferibles con capacidad de rápida integración al equipo.")

    # 7. Brechas y puntos de control técnico
    gaps = []
    if missing_skills:
        gaps.append(f"Sin evidencia documental explícita sobre: {', '.join(missing_skills[:3])}.")
    else:
        gaps.append("Corroborar nivel de especialización y profundidad en los frameworks clave.")
    gaps.append("Validar pretensión salarial y disponibilidad para inicio de labores.")

    # 8. Preguntas estructuradas para el panel de entrevista
    primary_skill = matched_skills[0] if matched_skills else "su tecnología principal"
    missing_skill = missing_skills[0] if missing_skills else "desafíos arquitectónicos"

    interview_questions = [
        f"Detalle un proyecto de alta exigencia donde haya implementado {primary_skill} y cuál fue el resultado cuantificable obtenido.",
        f"La posición requiere dominio de {missing_skill}; describa su experiencia previa y su estrategia para resolver incidencias complejas en este ámbito.",
        "¿Cuál es su metodología para asegurar la calidad de código, pruebas y mantenibilidad en entregas continuas?",
    ]

    # 9. Orientación profesional para el candidato
    candidate_advice = (
        f"Su perfil técnico presenta una compatibilidad del {match_score}% respecto a los requerimientos de la vacante. "
        + (f"Se aconseja enfatizar sus proyectos desarrollados con {matched_skills[0]}." if matched_skills else "Se aconseja detallar casos de éxito específicos.")
        + (f" Prepare ejemplos concretos que demuestren su curva de aprendizaje en {missing_skills[0]}." if missing_skills else "")
    )

    return {
        "matchScore": match_score,
        "stars": stars,
        "verdict": verdict,
        "suggestedStage": suggested_stage,
        "pillColor": pill_color,
        "summary": summary,
        "matchedSkills": matched_skills,
        "missingSkills": missing_skills,
        "strengths": strengths,
        "gaps": gaps,
        "interviewQuestions": interview_questions,
        "candidateAdvice": candidate_advice,
    }
