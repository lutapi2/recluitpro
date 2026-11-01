import os
import re
import unicodedata
import zipfile
from io import BytesIO
from pathlib import Path
from datetime import datetime

try:
    from pypdf import PdfReader
except ImportError:
    PdfReader = None


# ==========================================================================
# TAXONOMÍA INSTITUCIONAL DE COMPETENCIAS Y TECNOLOGÍAS MULTI-DOMINIO
# ==========================================================================

TAXONOMY_SKILLS = {
    # Lenguajes de Programación
    "python": "Python",
    "javascript": "JavaScript",
    "typescript": "TypeScript",
    "java": "Java",
    "c#": "C#",
    "c++": "C++",
    "golang": "Go / Golang",
    "go": "Go",
    "php": "PHP",
    "ruby": "Ruby",
    "rust": "Rust",
    "kotlin": "Kotlin",
    "swift": "Swift",
    "r": "R",
    "sql": "SQL",
    "html": "HTML",
    "css": "CSS",
    "sass": "Sass/SCSS",
    "bash": "Bash / Shell",
    "powershell": "PowerShell",

    # Frameworks Web y Móvil
    "fastapi": "FastAPI",
    "django": "Django",
    "flask": "Flask",
    "react": "React",
    "react native": "React Native",
    "next.js": "Next.js",
    "nextjs": "Next.js",
    "vue": "Vue.js",
    "vue.js": "Vue.js",
    "angular": "Angular",
    "svelte": "Svelte",
    "nodejs": "Node.js",
    "node.js": "Node.js",
    "node": "Node.js",
    "express": "Express.js",
    "nestjs": "NestJS",
    "spring": "Spring Boot",
    "spring boot": "Spring Boot",
    ".net": ".NET",
    "asp.net": "ASP.NET",
    "laravel": "Laravel",
    "tailwind": "Tailwind CSS",
    "bootstrap": "Bootstrap",
    "flutter": "Flutter",

    # Bases de Datos y Almacenamiento
    "postgresql": "PostgreSQL",
    "postgres": "PostgreSQL",
    "mysql": "MySQL",
    "sqlite": "SQLite",
    "mongodb": "MongoDB",
    "redis": "Redis",
    "oracle": "Oracle DB",
    "sql server": "SQL Server",
    "mariadb": "MariaDB",
    "elasticsearch": "Elasticsearch",
    "cassandra": "Cassandra",
    "dynamodb": "DynamoDB",
    "sqlalchemy": "SQLAlchemy",

    # DevOps, Cloud e Infraestructura
    "docker": "Docker",
    "kubernetes": "Kubernetes",
    "k8s": "Kubernetes",
    "aws": "AWS Cloud",
    "azure": "Microsoft Azure",
    "gcp": "Google Cloud (GCP)",
    "git": "Git",
    "github": "GitHub",
    "gitlab": "GitLab",
    "ci/cd": "CI/CD Pipelines",
    "linux": "Linux",
    "ubuntu": "Ubuntu",
    "terraform": "Terraform",
    "ansible": "Ansible",
    "nginx": "Nginx",
    "microservicios": "Arquitectura de Microservicios",
    "microservices": "Microservicios",
    "api rest": "APIs RESTful",
    "rest": "REST APIs",
    "restful": "RESTful",
    "graphql": "GraphQL",
    "kafka": "Apache Kafka",
    "rabbitmq": "RabbitMQ",

    # Ciencia de Datos, IA y Analítica
    "machine learning": "Machine Learning",
    "deep learning": "Deep Learning",
    "ciencia de datos": "Ciencia de Datos",
    "data science": "Data Science",
    "inteligencia artificial": "Inteligencia Artificial",
    "ia": "Inteligencia Artificial",
    "nlp": "Procesamiento de Lenguaje Natural (NLP)",
    "pytorch": "PyTorch",
    "tensorflow": "TensorFlow",
    "scikit-learn": "Scikit-Learn",
    "pandas": "Pandas",
    "numpy": "NumPy",
    "power bi": "Power BI",
    "powerbi": "Power BI",
    "tableau": "Tableau",
    "excel": "Excel Avanzado",
    "big data": "Big Data",
    "spark": "Apache Spark",
    "etl": "Procesos ETL",

    # Diseño, UI/UX y Creatividad
    "ui/ux": "Diseño UI/UX",
    "ux": "Experiencia de Usuario (UX)",
    "ui": "Interfaz de Usuario (UI)",
    "figma": "Figma",
    "adobe xd": "Adobe XD",
    "sketch": "Sketch",
    "photoshop": "Adobe Photoshop",
    "illustrator": "Adobe Illustrator",
    "wireframes": "Wireframing",
    "prototipado": "Prototipado",
    "design system": "Sistemas de Diseño",
    "diseno grafico": "Diseño Gráfico",
    "diseño gráfico": "Diseño Gráfico",

    # Gestión de Proyectos, Producto y Metodologías
    "scrum": "Metodología Scrum",
    "agile": "Metodologías Ágiles",
    "kanban": "Kanban",
    "jira": "Jira Software",
    "confluence": "Confluence",
    "trello": "Trello",
    "gestion de proyectos": "Gestión de Proyectos",
    "gestión de proyectos": "Gestión de Proyectos",
    "project management": "Project Management",
    "product management": "Product Management",
    "scrum master": "Scrum Master",
    "product owner": "Product Owner",
    "roadmap": "Planificación de Roadmaps",
    "kpis": "Indicadores Clave (KPIs)",
    "okrs": "Gestión por OKRs",

    # Calidad y Pruebas (QA)
    "qa": "Control de Calidad (QA)",
    "testing": "Pruebas de Software",
    "pruebas unitarias": "Pruebas Unitarias",
    "cypress": "Cypress",
    "selenium": "Selenium",
    "jest": "Jest",
    "pytest": "PyTest",
    "postman": "Postman",
    "automatizacion": "Automatización de Pruebas",
    "automatización": "Automatización de Pruebas",

    # Negocios, Ventas y Operaciones
    "ventas": "Ventas y Negociación",
    "sales": "Ventas B2B / B2C",
    "b2b": "Modelos B2B",
    "b2c": "Modelos B2C",
    "crm": "Gestión CRM",
    "marketing digital": "Marketing Digital",
    "seo": "Optimización SEO",
    "sem": "Campañas SEM",
    "servicio al cliente": "Servicio al Cliente",
    "atencion al cliente": "Atención al Cliente",
    "atención al cliente": "Atención al Cliente",
    "finanzas": "Finanzas Corporativas",
    "contabilidad": "Contabilidad",
    "recursos humanos": "Recursos Humanos (RRHH)",
    "talento humano": "Gestión de Talento Humano",
    "reclutamiento": "Reclutamiento y Selección",

    # Habilidades Blandas Nucleares
    "liderazgo": "Liderazgo de Equipos",
    "trabajo en equipo": "Trabajo en Equipo",
    "comunicacion asertiva": "Comunicación Asertiva",
    "comunicacion": "Comunicación Efectiva",
    "resolucion de problemas": "Resolución de Problemas",
    "pensamiento critico": "Pensamiento Crítico",
    "adaptabilidad": "Adaptabilidad y Aprendizaje Ágil",
    "proactividad": "Proactividad e Iniciativa",
    "negociacion": "Habilidades de Negociación",
}


def normalize_text(text: str) -> str:
    """Normaliza texto removiendo tildes y caracteres diacríticos para comparación semántica."""
    if not text:
        return ""
    text = text.lower()
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    return text


def skill_in_text(skill: str, normalized_text: str) -> bool:
    """
    Verifica si una competencia está presente en el texto normalizado,
    respetando límites de palabra para evitar falsos positivos y reconociendo
    puntuaciones adyacentes (puntos, comas, saltos de línea).
    """
    norm_skill = normalize_text(skill).strip()
    if not norm_skill:
        return False

    # Para términos de 1 caracter (e.g. 'c' o 'r') requerimos contexto explícito
    if len(norm_skill) == 1:
        pat_single = rf"(?<![a-z0-9])(?:lenguaje\s+{re.escape(norm_skill)}|c\s*/\s*c\+\+)(?![a-z0-9])"
        return bool(re.search(pat_single, normalized_text))

    escaped = re.escape(norm_skill)
    # Límite con lookbehind y lookahead que no corta con puntuaciones como '.' o ','
    pattern = rf"(?<![a-z0-9]){escaped}(?![a-z0-9#+])"
    return bool(re.search(pattern, normalized_text))


# ==========================================================================
# EXTRACCIÓN ROBUSTA DE TEXTO (PDF, DOCX, TXT) CON DETECCIÓN MAGIC BYTES
# ==========================================================================

def extract_text_from_file(file_path: Path, original_filename: str = "") -> str:
    """
    Extrae texto de archivos PDF, DOCX o texto plano.
    Inspecciona magic bytes (encabezado del archivo) para identificar el formato real
    incluso si el archivo está almacenado con nombre UUID sin extensión.
    """
    if not file_path.exists():
        return ""

    try:
        data = file_path.read_bytes()
    except Exception:
        return ""

    if not data:
        return ""

    header = data[:2048]
    orig_lower = (original_filename or "").lower()

    # 1. Detección de formato PDF (Magic bytes b"%PDF-")
    is_pdf = (
        header.startswith(b"%PDF-")
        or b"%PDF-" in header[:1024]
        or orig_lower.endswith(".pdf")
    )

    if is_pdf and PdfReader is not None:
        try:
            reader = PdfReader(BytesIO(data))
            pages_text = []
            for page in reader.pages:
                txt = page.extract_text()
                if txt:
                    # Limpiar guiones de salto de línea (e.g. desa- \nrrollo -> desarrollo)
                    txt = re.sub(r"(\w+)-\s*\n\s*(\w+)", r"\1\2", txt)
                    pages_text.append(txt)
            extracted = "\n".join(pages_text).strip()
            if len(extracted) >= 15:
                return extracted
        except Exception:
            pass

        # Fallback para PDFs con texto plano sin comprimir o streams directos
        try:
            stream_matches = re.findall(rb"\(([^)]+)\)\s*(?:Tj|'|\")", data)
            if stream_matches:
                decoded = [m.decode("latin1", errors="ignore") for m in stream_matches]
                joined = " ".join(decoded).strip()
                if len(joined) >= 30:
                    return joined
        except Exception:
            pass

    # 2. Detección de formato DOCX (Magic bytes ZIP b"PK\x03\x04")
    is_zip = (
        header.startswith(b"PK\x03\x04")
        or orig_lower.endswith((".docx", ".odt"))
    )

    if is_zip:
        try:
            with zipfile.ZipFile(BytesIO(data)) as archive:
                if "word/document.xml" in archive.namelist():
                    xml_content = archive.read("word/document.xml").decode("utf-8", errors="ignore")
                    text_nodes = re.findall(r"<w:t[^>]*>(.*?)</w:t>", xml_content)
                    if text_nodes:
                        return " ".join(text_nodes).strip()
                    clean_text = re.sub(r"<[^>]+>", " ", xml_content)
                    return re.sub(r"\s+", " ", clean_text).strip()
        except Exception:
            pass

    # 3. Fallback de texto plano UTF-8 / Latin-1
    try:
        text = data.decode("utf-8", errors="ignore").strip()
        # Verificar si no es binario inútil
        printable = sum(1 for c in text[:500] if c.isprintable() or c in "\n\r\t")
        if len(text[:500]) > 0 and (printable / len(text[:500])) > 0.75:
            return text
    except Exception:
        pass

    try:
        return data.decode("latin-1", errors="ignore").strip()
    except Exception:
        return ""


# ==========================================================================
# EXTRACCIÓN DINÁMICA DE REQUISITOS Y SENIORITY
# ==========================================================================

def extract_years_of_experience(text: str) -> int:
    """Extrae los años de experiencia laboral mencionados en el CV o vacante."""
    norm = normalize_text(text)
    years = []

    # Patrón 1: 'X años de experiencia'
    pat1 = r"\b(\d{1,2})\+?\s*(?:anos|anios|years|ano|anio|yr|yrs)\b(?:\s*(?:de\s+)?(?:experiencia|trayectoria|laboral))?"
    for m in re.finditer(pat1, norm):
        try:
            val = int(m.group(1))
            if 1 <= val <= 40:
                years.append(val)
        except Exception:
            pass

    # Patrón 2: 'mas de X anos'
    pat2 = r"(?:mas de|over)\s*(\d{1,2})\s*(?:anos|anios|years)"
    for m in re.finditer(pat2, norm):
        try:
            val = int(m.group(1))
            if 1 <= val <= 40:
                years.append(val)
        except Exception:
            pass

    # Patrón 3: Rangos de fechas como '2019 a 2024' o '2018 - actualidad'
    current_year = datetime.now().year
    pat_range = r"\b(19\d\d|20\d\d)\s*(?:a|al|-|–|to|hasta)\s*(19\d\d|20\d\d|presente|actualidad|present)\b"
    total_range_years = 0
    for m in re.finditer(pat_range, norm):
        try:
            start_yr = int(m.group(1))
            end_val = m.group(2)
            end_yr = current_year if not end_val.isdigit() else int(end_val)
            diff = end_yr - start_yr
            if 0 <= diff <= 30 and start_yr <= end_yr:
                total_range_years += diff
        except Exception:
            pass

    if total_range_years > 0:
        years.append(min(35, total_range_years))

    return max(years) if years else 0


def detect_seniority(text: str) -> tuple[str, int]:
    """
    Determina el nivel de seniority y los años estimados:
    Retorna (Etiqueta, RangoAñosEstimados)
    """
    norm = normalize_text(text)
    years = extract_years_of_experience(text)

    is_lead_arch = bool(re.search(r"\b(arquitecto|architect|lead|tech lead|lider tecnico|principal|staff|director|gerente)\b", norm))
    is_senior = bool(re.search(r"\b(senior|sr|especialista|avanzado)\b", norm))
    is_mid = bool(re.search(r"\b(semi[- ]?senior|ssr|mid|intermedio)\b", norm))
    is_junior = bool(re.search(r"\b(junior|jr|trainee|practicante|entry|sin experiencia|recien graduado)\b", norm))

    if is_lead_arch or years >= 8:
        return "Lead / Arquitecto", max(years, 8)
    if is_senior or years >= 5:
        return "Senior", max(years, 5)
    if is_mid or years >= 2:
        return "Semi-Senior", max(years, 2)
    if is_junior:
        return "Junior / Inicial", years

    if years >= 4:
        return "Semi-Senior Avanzado", years
    if years >= 1:
        return "Junior / Formación", years

    return "Junior / Nivel Inicial", 0


def extract_vacancy_requirements(vacancy_title: str, vacancy_description: str) -> list[str]:
    """
    Extrae dinámicamente las competencias y requerimientos clave de la vacante,
    combinando la taxonomía general con términos específicos detectados.
    """
    combined = f"{vacancy_title} {vacancy_description}"
    norm = normalize_text(combined)

    detected = []
    # 1. Comparar con el diccionario taxonómico
    for key, display_name in TAXONOMY_SKILLS.items():
        if skill_in_text(key, norm):
            if display_name not in detected:
                detected.append(display_name)

    # 2. Extraer términos con mayúsculas/acrónimos técnicos explícitos (e.g. ERP, CRM, SAP, SLA, KPI)
    acronyms = set(re.findall(r"\b[A-Z]{2,6}\b", combined))
    ignored_words = {"EL", "LA", "LOS", "LAS", "POR", "CON", "DEL", "QUE", "UNA", "MAS", "PARA", "SIN", "SUS", "SUR", "NOR"}
    for acr in sorted(acronyms):
        if acr not in ignored_words:
            # Evitar duplicar si ya existe en detected (e.g. AWS vs AWS Cloud)
            norm_acr = acr.lower()
            already_covered = any(norm_acr in d.lower() for d in detected)
            if not already_covered:
                detected.append(acr)

    # Si la vacante es muy escueta y no especificó tecnologías concretas
    if not detected:
        detected = ["Resolución de problemas", "Trabajo en equipo", "Comunicación efectiva", "Alineación al puesto"]

    return detected


# ==========================================================================
# MOTOR PRINCIPAL DE ANÁLISIS DE COMPATIBILIDAD (ATS SCREENING)
# ==========================================================================

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
    Evalúa 5 dimensiones cuantitativas:
    1. Competencias Nucleares y Requisitos Técnicos (40%)
    2. Afinidad de Cargo, Título y Rol (25%)
    3. Nivel de Experiencia y Seniority (15%)
    4. Formación Académica y Credenciales (10%)
    5. Ubicación y Modalidad de Trabajo (10%)
    """
    clean_resume = (resume_text or "").strip()
    norm_resume = normalize_text(clean_resume)
    norm_candidate_meta = normalize_text(f"{candidate_name} {candidate_location} {candidate_email}")
    full_candidate_corpus = f"{norm_candidate_meta} {norm_resume}"

    norm_vacancy_title = normalize_text(vacancy_title)
    norm_vacancy_desc = normalize_text(vacancy_description)
    norm_vacancy_type = normalize_text(vacancy_type)
    full_vacancy_corpus = f"{norm_vacancy_title} {norm_vacancy_desc} {norm_vacancy_type}"

    # Si no hay texto de CV legible o el archivo estaba vacío
    is_cv_empty = len(clean_resume) < 30

    # ----------------------------------------------------------------------
    # 1. EVALUACIÓN DE COMPETENCIAS REQUERIDAS (40% de ponderación)
    # ----------------------------------------------------------------------
    required_skills = extract_vacancy_requirements(vacancy_title, vacancy_description)
    matched_skills = []
    missing_skills = []

    if not is_cv_empty:
        for skill in required_skills:
            if skill_in_text(skill, full_candidate_corpus):
                matched_skills.append(skill)
            else:
                missing_skills.append(skill)
    else:
        missing_skills = list(required_skills)

    # Detectar competencias adicionales que el candidato posee y enriquecen su perfil
    additional_skills = []
    if not is_cv_empty:
        for key, display_name in TAXONOMY_SKILLS.items():
            if display_name not in matched_skills and display_name not in missing_skills:
                if skill_in_text(key, norm_resume):
                    if display_name not in additional_skills:
                        additional_skills.append(display_name)

    skills_match_ratio = (len(matched_skills) / max(1, len(required_skills))) if required_skills else 0.5
    skills_score = skills_match_ratio * 100.0

    # ----------------------------------------------------------------------
    # 2. AFINIDAD DE CARGO Y ROL (25% de ponderación)
    # ----------------------------------------------------------------------
    # Extraer palabras clave del título del puesto (filtrando palabras vacías)
    stopwords = {"de", "en", "para", "y", "e", "o", "u", "un", "una", "el", "la", "los", "las", "del", "al", "con", "por", "a"}
    title_tokens = [w for w in re.findall(r"\b[a-z0-9+#.-]{3,}\b", norm_vacancy_title) if w not in stopwords]

    role_matches = 0
    if title_tokens and not is_cv_empty:
        # Ponderar con mayor relevancia los primeros 600 caracteres del CV (encabezado profesional)
        header_text = norm_resume[:600]
        for token in title_tokens:
            if token in header_text:
                role_matches += 1.5
            elif token in norm_resume:
                role_matches += 1.0

        role_match_ratio = min(1.0, role_matches / max(1, len(title_tokens)))
    else:
        role_match_ratio = 0.3 if not is_cv_empty else 0.0

    role_score = role_match_ratio * 100.0

    # ----------------------------------------------------------------------
    # 3. EXPERIENCIA Y SENIORITY (15% de ponderación)
    # ----------------------------------------------------------------------
    cand_seniority, cand_years = detect_seniority(clean_resume)
    vac_seniority, vac_years_req = detect_seniority(f"{vacancy_title} {vacancy_description}")

    if is_cv_empty:
        seniority_score = 15.0
    elif vac_seniority in ["Lead / Arquitecto"]:
        if cand_seniority in ["Lead / Arquitecto"]:
            seniority_score = 100.0
        elif cand_seniority in ["Senior"]:
            seniority_score = 75.0
        elif cand_seniority in ["Semi-Senior", "Semi-Senior Avanzado"]:
            seniority_score = 45.0
        else:
            seniority_score = 25.0
    elif vac_seniority in ["Senior"]:
        if cand_seniority in ["Senior", "Lead / Arquitecto"]:
            seniority_score = 100.0
        elif cand_seniority in ["Semi-Senior Avanzado", "Semi-Senior"]:
            seniority_score = 70.0
        else:
            seniority_score = 30.0
    elif vac_seniority in ["Semi-Senior", "Semi-Senior Avanzado"]:
        if cand_seniority in ["Semi-Senior", "Semi-Senior Avanzado", "Senior", "Lead / Arquitecto"]:
            seniority_score = 100.0
        else:
            seniority_score = 55.0
    elif vac_seniority in ["Junior / Inicial"]:
        # Para junior, candidatos de todos los niveles califican
        seniority_score = 100.0
    else:
        # Vacante sin seniority explícito: evaluar por años acumulados
        if cand_years >= 4:
            seniority_score = 100.0
        elif cand_years >= 2:
            seniority_score = 80.0
        elif cand_years >= 1:
            seniority_score = 65.0
        else:
            seniority_score = 50.0

    # ----------------------------------------------------------------------
    # 4. FORMACIÓN ACADÉMICA Y CREDENCIALES (10% de ponderación)
    # ----------------------------------------------------------------------
    degree_keywords = [
        "ingenier", "licenciad", "profesional", "tecnolog", "tecnic",
        "master", "magister", "especializ", "diplomad", "universitari",
        "grado", "doctor", "phd", "certificad", "certificacion", "certified"
    ]
    has_degree = any(dk in norm_resume for dk in degree_keywords) if not is_cv_empty else False
    has_certs = any(ck in norm_resume for ck in ["certificacion", "certificado", "certified", "scrum master", "aws certified"]) if not is_cv_empty else False

    if has_degree and has_certs:
        education_score = 100.0
    elif has_degree or has_certs:
        education_score = 85.0
    elif not is_cv_empty:
        education_score = 50.0
    else:
        education_score = 15.0

    # ----------------------------------------------------------------------
    # 5. UBICACIÓN Y MODALIDAD DE TRABAJO (10% de ponderación)
    # ----------------------------------------------------------------------
    is_remote = any(rw in full_vacancy_corpus for rw in ["remoto", "remote", "teletrabajo", "home office"]) or ("remot" in norm_vacancy_type)
    norm_loc = normalize_text(candidate_location)

    if is_remote:
        location_score = 100.0
        location_status = "Modalidad remota compatible"
    elif norm_loc and (norm_loc in full_vacancy_corpus):
        location_score = 100.0
        location_status = f"Ubicación coincidente ({candidate_location})"
    elif not candidate_location:
        location_score = 65.0
        location_status = "Ubicación pendiente de confirmar"
    else:
        location_score = 40.0
        location_status = f"Ubicación declarada: {candidate_location}"

    # ----------------------------------------------------------------------
    # CÁLCULO PONDERADO FINAL DEL SCORE
    # ----------------------------------------------------------------------
    raw_composite = (
        (skills_score * 0.40) +
        (role_score * 0.25) +
        (seniority_score * 0.15) +
        (education_score * 0.10) +
        (location_score * 0.10)
    )

    # Bonificación por competencias adicionales relevantes (+1 punto por cada una, máx +5)
    bonus = min(5, len(additional_skills))
    final_score_num = raw_composite + bonus

    # Calibración de relevancia técnica: si no posee ninguna competencia requerida
    if len(matched_skills) == 0:
        final_score_num = min(final_score_num * 0.55, 34.0)
    elif skills_match_ratio < 0.25:
        final_score_num = min(final_score_num * 0.75, 48.0)

    # Si el CV estaba completamente vacío o ilegible
    if is_cv_empty:
        match_score = 15
    else:
        # Rango dinámico y natural: de 18% a 98%
        match_score = min(98, max(18, int(round(final_score_num))))

    # ----------------------------------------------------------------------
    # DICTAMEN, ESTRELLAS Y ESTADO SUGERIDO
    # ----------------------------------------------------------------------
    if match_score >= 85:
        stars = 5
        verdict = "Recomendación Favorable (Nivel Sobresaliente)"
        suggested_stage = "entrevista"
        pill_color = "#047857"
    elif match_score >= 70:
        stars = 4
        verdict = "Perfil Altamente Competitivo (Apto para Entrevista)"
        suggested_stage = "entrevista"
        pill_color = "#1d4ed8"
    elif match_score >= 50:
        stars = 3
        verdict = "Cumplimiento Parcial de Requisitos (Revisión Técnica)"
        suggested_stage = "en_revision"
        pill_color = "#b45309"
    else:
        stars = 2
        verdict = "Alineación Insuficiente con los Requisitos"
        suggested_stage = "rechazada"
        pill_color = "#b91c1c"

    # ----------------------------------------------------------------------
    # RESUMEN EJECUTIVO PERSONALIZADO
    # ----------------------------------------------------------------------
    matched_str = ", ".join(matched_skills[:4]) if matched_skills else "competencias en proceso de homologación"
    exp_desc = f"{cand_years} años de trayectoria ({cand_seniority})" if cand_years > 0 else cand_seniority

    if is_cv_empty:
        summary = (
            f"El expediente de {candidate_name} para la vacante de {vacancy_title} no contiene texto curricular legible. "
            f"Se obtuvo una calificación base del {match_score}%. Se requiere solicitar al candidato que adjunte su CV en formato PDF estándar."
        )
    else:
        summary = (
            f"{candidate_name} presenta un índice de compatibilidad técnica del {match_score}% para la posición de {vacancy_title}. "
            f"Acredita {exp_desc} con sólida evidencia en {matched_str}. "
            f"Estado sugerido para el flujo de selección: {suggested_stage.replace('_', ' ').capitalize()}."
        )

    # ----------------------------------------------------------------------
    # FORTALEZAS COMPROBADAS
    # ----------------------------------------------------------------------
    strengths = []
    if matched_skills:
        strengths.append(f"Acreditación técnica comprobable en herramientas clave: {', '.join(matched_skills[:4])}.")
    if role_match_ratio >= 0.6:
        strengths.append(f"Afinidad directa de rol con el perfil de {vacancy_title}.")
    if cand_years > 0:
        strengths.append(f"Experiencia laboral cuantificable estimada en {cand_years} años ({cand_seniority}).")
    if has_degree or has_certs:
        strengths.append("Formación académica profesional y/o certificaciones acreditadas en su expediente.")
    if is_remote or location_score >= 90:
        strengths.append(f"Compatibilidad óptima con el esquema de trabajo: {location_status}.")
    if additional_skills:
        strengths.append(f"Aporta valor agregado con competencias complementarias: {', '.join(additional_skills[:3])}.")

    if not strengths:
        strengths.append("Interés registrado en la posición y datos de contacto verificados.")

    # ----------------------------------------------------------------------
    # BRECHAS Y PUNTOS DE CONTROL
    # ----------------------------------------------------------------------
    gaps = []
    if missing_skills:
        gaps.append(f"Sin mención documental explícita en el CV sobre: {', '.join(missing_skills[:3])}.")
    if role_match_ratio < 0.4 and not is_cv_empty:
        gaps.append("El título y enfoque principal de su CV no coinciden plenamente con el cargo convocado.")
    if seniority_score < 60 and not is_cv_empty:
        gaps.append(f"Nivel de experiencia detectado ({cand_seniority}) inferior al perfil esperado para {vac_seniority}.")
    if not is_remote and location_score < 70:
        gaps.append(f"Modalidad no remota: validar disponibilidad de traslado o asistencia en {vacancy_description[:40]}.")
    if is_cv_empty:
        gaps.append("Documento curricular ilegible o sin texto extraíble mediante OCR/parser.")

    if not gaps:
        gaps.append("Validar pretensión salarial y fecha estimada de incorporación.")
        gaps.append("Profundizar en casos de éxito y resolución de problemas bajo presión.")

    # ----------------------------------------------------------------------
    # PREGUNTAS TÉCNICAS ESTRUCTURADAS PARA EL PANEL
    # ----------------------------------------------------------------------
    primary_skill = matched_skills[0] if matched_skills else "su principal herramienta de trabajo"
    missing_skill = missing_skills[0] if missing_skills else "arquitectura escalable y resiliencia técnica"

    if cand_seniority in ["Senior", "Lead / Arquitecto"]:
        q1 = f"Describa una decisión de arquitectura crítica donde haya empleado {primary_skill} para optimizar rendimiento o escalabilidad."
        q2 = f"Dado que la vacante involucra {missing_skill}, ¿cuál ha sido su curva de aprendizaje o experiencia resolviendo retos relacionados?"
        q3 = "¿Cómo aborda el liderazgo técnico, mentoría de desarrolladores y garantía de calidad (pruebas, CI/CD) en su equipo?"
    else:
        q1 = f"Detalle un proyecto práctico donde haya implementado {primary_skill} y cuál fue el resultado funcional obtenido."
        q2 = f"La posición requiere conocimientos en {missing_skill}. ¿Cómo se prepararía para dominar esta competencia en sus primeros 30 días?"
        q3 = "¿Qué metodología de trabajo ágil prefiere y cómo prioriza sus entregables ante plazos exigentes?"

    interview_questions = [q1, q2, q3]

    # ----------------------------------------------------------------------
    # ORIENTACIÓN PERSONALIZADA PARA EL CANDIDATO
    # ----------------------------------------------------------------------
    if is_cv_empty:
        candidate_advice = "Te recomendamos volver a cargar tu hoja de vida en formato PDF legible para que el sistema evalúe tus competencias."
    elif match_score >= 80:
        candidate_advice = (
            f"Tu perfil cuenta con un sobresaliente {match_score}% de afinidad con la vacante de {vacancy_title}. "
            f"En tu entrevista técnica, destaca tus proyectos con {primary_skill} y tu experiencia en liderazgo y arquitectura."
        )
    elif match_score >= 60:
        candidate_advice = (
            f"Tu compatibilidad técnica es del {match_score}%. Presentas fortalezas comprobables en {primary_skill}. "
            f"Te recomendamos reforzar y ejemplificar tus conocimientos prácticos en {missing_skill} durante las fases de evaluación."
        )
    else:
        candidate_advice = (
            f"Tu compatibilidad actual con esta vacante es del {match_score}%. "
            f"Para mejorar tu posicionamiento, enfócate en desarrollar proyectos demostrables en {missing_skill} y alinear tu CV al puesto de {vacancy_title}."
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
        "additionalSkills": additional_skills[:5],
        "candidateLevel": cand_seniority,
        "candidateYears": cand_years,
        "strengths": strengths,
        "gaps": gaps,
        "interviewQuestions": interview_questions,
        "candidateAdvice": candidate_advice,
    }
