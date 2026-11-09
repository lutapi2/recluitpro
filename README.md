# RecruitPro - Sistema Integral de Selección de Talento & ATS con IA (100% PHP)

Plataforma corporativa de reclutamiento y gestión de talento (ATS) diseñada para automatizar el ciclo completo de selección, desde la publicación de convocatorias hasta la evaluación técnica y screening asistido por Inteligencia Artificial.

Arquitectura 100% migrada a **PHP Nativo Modular (Vanilla PHP)** con **PDO SQLite**, sin dependencias externas ni necesidad de Composer o Node.js. Compatible de forma nativa con **XAMPP**, **Apache**, **Laragon** y el servidor integrado de PHP.

---

## Características Principales

1. **Portal Público de Empleos (`empleos.html`):**
   * Catálogo interactivo de convocatorias abiertas en tiempo real (`/api/public/vacancies`).
   * Filtros por palabras clave, modalidad (remoto/híbrido/presencial) y ubicación.
   * Postulación directa sin fricción (`/api/public/apply`) con carga de CV y análisis de compatibilidad instantáneo.

2. **Pipeline Visual Kanban Interactivo (`dashboard.html`):**
   * Tablero ágil con etapas: *Recibida*, *En revisión*, *Entrevista*, *Oferta* y *Rechazada*.
   * Arrastrar y soltar (*drag & drop*) de candidatos con persistencia en tiempo real.
   * Soporte de reversión optimista (*undo*) y registro de auditoría de actividades.
   * Atajos de teclado profesionales estilo Linear (`G`+`H`, `G`+`P`, `G`+`V`, `G`+`C`, `N`, `/`, `?`).

3. **Visor de Expedientes en Pantalla Dividida (*Split-Screen Reviewer*):**
   * Visualización del currículum original en PDF en el panel izquierdo.
   * Panel derecho con scorecard de compatibilidad IA, asignación de reclutador y notas de equipo.
   * **Doble Persistencia de Documentos**: Archivos almacenados en disco y sincronizados en binario (BLOB) en la base de datos `recruitpro.db`, garantizando que ningún CV se pierda tras reinicios o limpiezas de disco.

4. **Motor de Screening Curricular Automatizado (IA ATS Nativo en PHP):**
   * `AiService.php`: Taxonomía institucional de ~100 competencias técnicas y habilidades blandas.
   * Extracción de texto de documentos PDF (streams y literales) y DOCX (vía `ZipArchive`).
   * Evaluación cuantitativa multi-dimensional (Requisitos Técnicos 40%, Cargo y Rol 25%, Seniority 15%, Formación 10%, Ubicación 10%).
   * Generación de dictamen formal, fortalezas comprobadas, brechas de perfil, preguntas estratégicas de entrevista y recomendaciones al candidato.

5. **Seguridad y Privacidad:**
   * Sesiones con cookies seguras `HttpOnly` y protección CSRF mediante token criptográfico `recruitpro_csrf`.
   * Cifrado de contraseñas con algoritmos estándar (`password_hash` / `password_verify`).
   * Control de acceso basado en roles (Administrador, Reclutador y Candidato).
   * Política de retención automatizada de candidatos inactivos (`RetentionService.php`).

---

## Estructura del Proyecto

```text
Proyecto/
├── index.html            # Portal de acceso / Login institucional
├── dashboard.html        # Panel de control de reclutadores y administradores
├── empleos.html          # Portal público de vacantes para candidatos
├── registro.html         # Registro de nuevos candidatos
├── verificar.html        # Verificación de correo electrónico
├── recuperar.html        # Solicitud de recuperación de contraseña
├── restablecer.html      # Restablecimiento de contraseña
├── privacidad.html       # Términos y política de privacidad
├── recruitpro.db         # Base de datos SQLite (usuarios, vacantes, postulaciones, CVs)
├── router.php            # Router del servidor integrado de PHP
├── .htaccess             # Reglas de reescritura para Apache y XAMPP
├── ejecutar_php.bat      # Script de inicio en un clic para Windows
├── css/
│   └── style.css         # Hoja de estilos Soft UI & True Black
├── js/
│   ├── auth.js           # Lógica de login y autenticación
│   ├── dashboard.js      # Pipeline Kanban, Visor Dividido y llamadas ATS
│   ├── ui.js             # Efectos de interfaz y temas
│   └── ...
└── api/                  # Backend 100% PHP Nativo
    ├── Config.php        # Configuración centralizada y utilidades
    ├── Database.php      # Conexión Singleton PDO SQLite con WAL mode
    ├── Response.php      # Respuestas JSON uniformes y descarga de archivos
    ├── Security.php      # Sesiones, CSRF y verificación criptográfica
    ├── Serialization.php # Formateo estándar de modelos a JSON
    ├── AiService.php     # Motor ATS, taxonomía de habilidades y scoring IA
    ├── EmailService.php  # Notificaciones por correo electrónico
    ├── RetentionService.php # Purga de datos conforme a políticas de privacidad
    ├── BootstrapAdmin.php   # Creación de administradores vía CLI
    ├── index.php         # Front Controller de la API REST (/api/*)
    └── Controllers/
        ├── AuthController.php         # Login, registro, perfil, sesiones
        ├── VacanciesController.php    # CRUD de vacantes y portal público
        ├── ApplicationsController.php # Postulaciones, Kanban y notas
        ├── DocumentsController.php    # Carga y descarga de CVs con doble persistencia
        ├── UsersController.php        # Gestión de reclutadores y candidatos
        ├── DashboardController.php    # Métricas y estadísticas de embudo
        └── AiController.php           # Endpoints de dictamen IA
```

---

## Puesta en Marcha en Local

### Opción 1: Ejecución con Servidor Integrado de PHP (Recomendada)

1. Haz doble clic en el archivo **`ejecutar_php.bat`** (o `ejecutar.bat`).
2. El script detectará automáticamente tu instalación de PHP (en el PATH, XAMPP o Laragon) e iniciará el servidor en:
   **`http://127.0.0.1:8000`**
3. Se abrirá automáticamente tu navegador web listo para usar.

O si prefieres la línea de comandos:
```bash
php -S 127.0.0.1:8000 router.php
```

### Opción 2: Ejecución en XAMPP / Apache

1. Copia o mueve la carpeta del proyecto dentro del directorio **`C:\xampp\htdocs\`** (por ejemplo `C:\xampp\htdocs\recruitpro`).
2. Inicia el módulo **Apache** desde el panel de control de XAMPP.
3. Abre tu navegador e ingresa a:
   **`http://localhost/recruitpro/`**
4. El archivo `.htaccess` incluido se encargará de enrutar automáticamente todas las peticiones a la API y las vistas HTML sin requerir ninguna configuración adicional.

---

## Credenciales de Acceso Iniciales

| Rol | Correo Electrónico | Contraseña |
| :--- | :--- | :--- |
| **Administrador** | `luctapi89@gmail.com` | Tu contraseña configurada |
| **Candidato** | Registro libre desde `registro.html` o portal de empleos |

---

## Compatibilidad de la API REST (/api/*)

Todos los 31 endpoints de la API se mantienen 100% idénticos y compatibles con la interfaz web:
* **Autenticación**: `/api/auth/csrf`, `/api/auth/register`, `/api/auth/login`, `/api/auth/me`, `/api/auth/logout`, etc.
* **Vacantes**: `/api/vacancies`, `/api/public/vacancies`
* **Postulaciones**: `/api/applications`, `/api/applications/mine`, `/api/vacancies/{id}/applications`, `/api/public/apply`
* **Documentos**: `/api/documents`, `/api/documents/{id}`
* **Inteligencia Artificial ATS**: `/api/ai/analyze-application/{id}`, `/api/ai/analyze-vacancy-fit/{id}`
* **Dashboard y Usuarios**: `/api/dashboard/summary`, `/api/users`
