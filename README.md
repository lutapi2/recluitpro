# RecruitPro - Sistema Integral de Selección de Talento & ATS con IA

Plataforma corporativa de reclutamiento y gestión de talento (ATS) diseñada para automatizar el ciclo completo de selección, desde la publicación de vacantes hasta la evaluación técnica asistida por Inteligencia Artificial.

---

## Características Principales

1. **Portal Público de Empleos (`empleos.html`):**
   * Catálogo interactivo de convocatorias abiertas en tiempo real.
   * Filtros por palabras clave, modalidad (remoto/presencial) y ubicación.
   * Formulario de postulación directa con carga segura de hojas de vida (PDF/DOCX).

2. **Pipeline Visual Interactivo Kanban (`dashboard.html`):**
   * Tablero con etapas del proceso: *Recibida*, *En revisión*, *Entrevista*, *Oferta* y *Rechazada*.
   * Arrastrar y soltar (*drag & drop*) de tarjetas de candidatos entre etapas con sincronización en base de datos.
   * Insignias de compatibilidad técnica calculadas por IA visibles directamente en cada tarjeta.

3. **Visor de Expedientes en Pantalla Dividida (*Split-Screen Reviewer*):**
   * Visualización nativa del currículum en PDF en el panel izquierdo.
   * Panel de evaluación técnica, asignación de reclutador y notas en el panel derecho.

4. **Motor de Dictamen Curricular Automatizado (IA ATS):**
   * Extracción de texto y análisis predictivo de compatibilidad entre el perfil y los requisitos de la vacante.
   * Validación automática de competencias nucleares y detección de brechas.
   * Generación de cuestionario técnico estratégico para el panel de entrevista.
   * Asignación automatizada de calificación (*Scorecard* de 1 a 5 estrellas) y redacción del dictamen formal.

5. **Seguridad y Cumplimiento:**
   * Autenticación basada en sesiones HTTP-only seguras con protección CSRF.
   * Roles diferenciados: Administrador, Reclutador y Candidato.
   * Almacenamiento aislado de archivos fuera del alcance público web.

---

## Estructura del Repositorio

```text
├── index.html            # Portal de acceso / Login institucional
├── dashboard.html        # Panel de control de reclutadores y administradores
├── empleos.html          # Portal público de vacantes para candidatos
├── registro.html         # Registro de nuevos candidatos
├── privacidad.html       # Términos y política de tratamiento de datos
├── css/
│   └── style.css         # Hoja de estilos con arquitectura responsive
├── js/
│   ├── dashboard.js      # Lógica del Kanban, Visor Dividido y llamadas a IA
│   └── auth.js           # Gestión de autenticación y sesiones
├── backend/
│   ├── app/
│   │   ├── main.py       # API REST con FastAPI y endpoints de IA
│   │   ├── ai_service.py # Motor semántico de correlación y análisis curricular
│   │   ├── models.py     # Modelos de datos SQLAlchemy
│   │   └── database.py   # Configuración de base de datos
│   └── requirements.txt  # Dependencias de producción
├── compose.yaml          # Orquestación de servicios en contenedores Docker
└── .gitignore            # Exclusión de entornos virtuales y archivos locales
```

---

## Puesta en Marcha en Local

### 1. Clonar el repositorio
```bash
git clone https://github.com/TU_USUARIO/recruitpro.git
cd recruitpro
```

### 2. Instalar dependencias
```bash
python -m venv .venv
# En Windows:
.venv\Scripts\activate
# En Linux/Mac:
source .venv/bin/activate

pip install -r backend/requirements.txt
```

### 3. Iniciar la aplicación
```bash
python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload
```

Ingresa desde tu navegador a: **http://127.0.0.1:8000**
