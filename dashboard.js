const app = document.getElementById("app");
const nav = document.getElementById("nav");
let user;
let usersCache = [];

/* ==========================================================================
   ATOMIC UI HELPERS (BREADCRUMBS, DYNAMIC AVATARS, SKELETONS, EMPTY STATES)
   ========================================================================== */

const AVATAR_PALETTES = [
  { bg: "#EFF6FF", color: "#1D4ED8", border: "#BFDBFE" },
  { bg: "#F0FDF4", color: "#15803D", border: "#BBF7D0" },
  { bg: "#FAF5FF", color: "#7E22CE", border: "#E9D5FF" },
  { bg: "#FFF7ED", color: "#C2410C", border: "#FED7AA" },
  { bg: "#FDF2F8", color: "#BE185D", border: "#FBCFE8" },
  { bg: "#ECFEFF", color: "#0E7490", border: "#A5F3FC" },
  { bg: "#FEFCE8", color: "#A16207", border: "#FEF08A" },
  { bg: "#F0FDFA", color: "#0F766E", border: "#99F6E4" },
];

function getDynamicAvatar(name, size = 34) {
  const cleanName = (name || "Usuario").trim();
  const parts = cleanName.split(/\s+/).filter(Boolean);
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : (parts[0] ? parts[0].slice(0, 2).toUpperCase() : "U");

  let hash = 0;
  for (let i = 0; i < cleanName.length; i++) {
    hash = cleanName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const palette = AVATAR_PALETTES[Math.abs(hash) % AVATAR_PALETTES.length];

  return `
    <div class="dynamic-avatar" style="width:${size}px; height:${size}px; min-width:${size}px; background:${palette.bg}; color:${palette.color}; border: 1px solid ${palette.border}; font-size: ${Math.round(size * 0.38)}px;" title="${escapeHtml(cleanName)}">
      ${escapeHtml(initials)}
    </div>
  `;
}

function renderBreadcrumbs(crumbs = []) {
  return `
    <nav class="breadcrumbs" aria-label="Ruta de navegación">
      <a href="javascript:void(0)" onclick="view('home')" class="crumb-link">
        <svg style="width: 14px; height: 14px; vertical-align: -2px; margin-right: 4px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
        </svg>
        Inicio
      </a>
      ${crumbs.map((c, i) => {
        const isLast = i === crumbs.length - 1;
        return `
          <span class="crumb-sep">/</span>
          ${isLast
            ? `<span class="crumb-current">${escapeHtml(c.label)}</span>`
            : `<a href="javascript:void(0)" onclick="${c.onClick || `view('${c.page}')`}" class="crumb-link">${escapeHtml(c.label)}</a>`
          }
        `;
      }).join("")}
    </nav>
  `;
}

function renderEmptyColumnState(stageKey) {
  const icon = typeof window.ui !== "undefined" && window.ui.icon
    ? window.ui.icon("inbox", "rp-icon")
    : '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-6l-2 3h-4l-2-3H2v7a2 2 0 002 2h16a2 2 0 002-2v-7z"/><path d="M5.45 5.11L2 12v0h20v0l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg>';
  return `
    <div class="kanban-empty-compact">
      ${icon}
      <span>Sin candidatos aquí</span>
    </div>
  `;
}

function renderSkeletonDashboard() {
  return `
    <div class="view-container">
      <div class="skeleton-loader" style="height: 14px; width: 120px; margin-bottom: 16px;"></div>
      <div class="head">
        <div class="skeleton-loader" style="height: 16px; width: 140px; margin-bottom: 10px;"></div>
        <div class="skeleton-loader" style="height: 34px; width: 280px; margin-bottom: 8px;"></div>
        <div class="skeleton-loader" style="height: 16px; width: 400px;"></div>
      </div>
      <div class="stats" style="margin: 28px 0;">
        ${[1, 2, 3, 4].map(() => `
          <div class="skeleton-loader" style="height: 110px; border-radius: 16px;"></div>
        `).join("")}
      </div>
      <div class="skeleton-loader" style="height: 150px; border-radius: 16px;"></div>
    </div>
  `;
}

function renderSkeletonKanban() {
  const cols = ["Recibidas", "En revisión", "Entrevista", "Oferta", "Rechazada"];
  return `
    <div class="view-container">
      <div class="skeleton-loader" style="height: 14px; width: 140px; margin-bottom: 16px;"></div>
      <div class="head">
        <div class="skeleton-loader" style="height: 16px; width: 160px; margin-bottom: 10px;"></div>
        <div class="skeleton-loader" style="height: 34px; width: 320px; margin-bottom: 8px;"></div>
        <div class="skeleton-loader" style="height: 16px; width: 440px;"></div>
      </div>
      <div class="kanban-wrapper" style="margin-top: 24px;">
        <div class="kanban-controls" style="margin-bottom: 20px; display: flex; gap: 14px;">
          <div class="skeleton-loader" style="height: 42px; width: 260px;"></div>
          <div class="skeleton-loader" style="height: 42px; width: 340px;"></div>
        </div>
        <div class="kanban-board">
          ${cols.map(() => `
            <div class="kanban-column" style="min-height: 480px;">
              <div class="skeleton-loader" style="height: 24px; width: 60%; margin-bottom: 18px;"></div>
              <div class="skeleton-loader" style="height: 120px; width: 100%; margin-bottom: 12px; border-radius: 14px;"></div>
              <div class="skeleton-loader" style="height: 120px; width: 100%; margin-bottom: 12px; border-radius: 14px;"></div>
              <div class="skeleton-loader" style="height: 100px; width: 100%; border-radius: 14px;"></div>
            </div>
          `).join("")}
        </div>
      </div>
    </div>
  `;
}

let vacanciesCache = [];
let vacancyPageState = { q: "", location: "", vacancy_type: "", status_filter: "", sort: "created_at", order: "desc", page: 1 };
let candidatePageState = { q: "", location: "", status_filter: "", sort: "created_at", order: "desc", page: 1 };
let currentPipelineVacancyId = "";
let pipelineApplicationsCache = [];
let pipelineSearchQuery = "";
let draggedAppId = null;
let sortableInstances = [];
let keyboardGrabbedCardId = null;
let mobileActiveStageKey = "recibida";

function label(role) {
  return {
    candidato: "Candidato",
    reclutador: "Reclutador",
    administrador: "Administrador",
  }[role];
}

function statusLabel(status) {
  return {
    recibida: "Recibida",
    en_revision: "En revisión",
    entrevista: "Entrevista",
    oferta: "Oferta",
    rechazada: "Rechazada",
  }[status] || status;
}


/* ==========================================================================
   FASE 6: FILTROS, VACANTES, CANDIDATOS, RECLUTADORES & PERFILES MODERNOS
   ========================================================================== */

function renderPager(result, pageName) {
  const pages = Math.max(1, Math.ceil(result.total / result.page_size));
  return `
    <div class="pagination" style="display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; background: var(--rp-surface); border: 1px solid var(--rp-border); border-radius: var(--rp-radius-lg); margin-top: 16px; box-shadow: var(--rp-shadow-sm);">
      <span style="font-size: 13px; color: var(--rp-text-muted); font-weight: 500;">
        ${result.total} resultado${result.total === 1 ? "" : "s"} · Página ${result.page} de ${pages}
      </span>
      <div style="display: flex; gap: 8px;">
        <button class="rp-btn rp-btn--secondary rp-btn--sm" type="button" ${result.page <= 1 ? "disabled" : ""} onclick="changePage('${pageName}', ${result.page - 1})">
          Anterior
        </button>
        <button class="rp-btn rp-btn--secondary rp-btn--sm" type="button" ${result.page >= pages ? "disabled" : ""} onclick="changePage('${pageName}', ${result.page + 1})">
          Siguiente
        </button>
      </div>
    </div>
  `;
}

function renderVacancyFilters() {
  const isCandidate = user.role === "candidato";
  const searchIcon = typeof window.ui !== "undefined" && window.ui.icon ? window.ui.icon("search", "rp-icon-sm") : "";
  const mapPinIcon = typeof window.ui !== "undefined" && window.ui.icon ? window.ui.icon("map-pin", "rp-icon-sm") : "";
  const filterIcon = typeof window.ui !== "undefined" && window.ui.icon ? window.ui.icon("sliders-horizontal", "rp-icon-sm") : "";

  return `
    <form class="filter-panel-v2" onsubmit="applyVacancyFilters(event)">
      <div class="filter-panel-header">
        <h2 class="filter-panel-title">
          ${filterIcon}
          <span>Filtrar y buscar vacantes</span>
        </h2>
        ${
          (vacancyPageState.q || vacancyPageState.location || vacancyPageState.vacancy_type || vacancyPageState.status_filter)
            ? `
              <button type="button" class="rp-btn rp-btn--ghost rp-btn--sm" onclick="clearVacancyFilters()">
                Limpiar filtros
              </button>
            `
            : ""
        }
      </div>

      <div class="filter-grid-v2">
        <div class="filter-field">
          <label class="filter-field-label">Palabras clave</label>
          <div class="filter-input-wrap">
            ${searchIcon}
            <input
              class="filter-input"
              name="q"
              value="${escapeHtml(vacancyPageState.q)}"
              placeholder="Cargo, palabra clave o tecnología..."
            />
          </div>
        </div>

        <div class="filter-field">
          <label class="filter-field-label">Ubicación</label>
          <div class="filter-input-wrap">
            ${mapPinIcon}
            <input
              class="filter-input"
              name="location"
              value="${escapeHtml(vacancyPageState.location)}"
              placeholder="Ciudad o 'Remoto'..."
            />
          </div>
        </div>

        <div class="filter-field">
          <label class="filter-field-label">Tipo de puesto</label>
          <input
            class="filter-input"
            name="vacancy_type"
            value="${escapeHtml(vacancyPageState.vacancy_type)}"
            placeholder="Tiempo completo, prácticas..."
          />
        </div>

        ${
          !isCandidate
            ? `
              <div class="filter-field">
                <label class="filter-field-label">Estado</label>
                <select class="filter-input" name="status_filter">
                  <option value="">Todos los estados</option>
                  <option value="active" ${vacancyPageState.status_filter === "active" ? "selected" : ""}>Activas (Abiertas)</option>
                  <option value="closed" ${vacancyPageState.status_filter === "closed" ? "selected" : ""}>Cerradas (Finalizadas)</option>
                </select>
              </div>
            `
            : ""
        }

        <div class="filter-field">
          <label class="filter-field-label">Ordenar por</label>
          <select class="filter-input" name="sort">
            <option value="created_at" ${vacancyPageState.sort === "created_at" ? "selected" : ""}>Fecha de publicación</option>
            <option value="title" ${vacancyPageState.sort === "title" ? "selected" : ""}>Título</option>
            <option value="location" ${vacancyPageState.sort === "location" ? "selected" : ""}>Ubicación</option>
            <option value="type" ${vacancyPageState.sort === "type" ? "selected" : ""}>Tipo</option>
          </select>
        </div>

        <div class="filter-field">
          <label class="filter-field-label">Orden</label>
          <select class="filter-input" name="order">
            <option value="desc" ${vacancyPageState.order === "desc" ? "selected" : ""}>Más reciente primero (Descendente)</option>
            <option value="asc" ${vacancyPageState.order === "asc" ? "selected" : ""}>Más antiguo primero (Ascendente)</option>
          </select>
        </div>
      </div>

      <div class="filter-actions-row">
        <button class="rp-btn rp-btn--primary" type="submit">
          Aplicar filtros
        </button>
      </div>
    </form>
  `;
}

function clearVacancyFilters() {
  vacancyPageState = { ...vacancyPageState, q: "", location: "", vacancy_type: "", status_filter: "", page: 1 };
  view("jobs");
}

function renderCandidateFilters() {
  const searchIcon = typeof window.ui !== "undefined" && window.ui.icon ? window.ui.icon("search", "rp-icon-sm") : "";
  const mapPinIcon = typeof window.ui !== "undefined" && window.ui.icon ? window.ui.icon("map-pin", "rp-icon-sm") : "";
  const filterIcon = typeof window.ui !== "undefined" && window.ui.icon ? window.ui.icon("sliders-horizontal", "rp-icon-sm") : "";

  return `
    <form class="filter-panel-v2" onsubmit="applyCandidateFilters(event)">
      <div class="filter-panel-header">
        <h2 class="filter-panel-title">
          ${filterIcon}
          <span>Filtrar y buscar candidatos</span>
        </h2>
        ${
          (candidatePageState.q || candidatePageState.location || candidatePageState.status_filter)
            ? `
              <button type="button" class="rp-btn rp-btn--ghost rp-btn--sm" onclick="clearCandidateFilters()">
                Limpiar filtros
              </button>
            `
            : ""
        }
      </div>

      <div class="filter-grid-v2">
        <div class="filter-field">
          <label class="filter-field-label">Nombre o correo</label>
          <div class="filter-input-wrap">
            ${searchIcon}
            <input
              class="filter-input"
              name="q"
              value="${escapeHtml(candidatePageState.q)}"
              placeholder="Buscar por nombre o correo..."
            />
          </div>
        </div>

        <div class="filter-field">
          <label class="filter-field-label">Ubicación</label>
          <div class="filter-input-wrap">
            ${mapPinIcon}
            <input
              class="filter-input"
              name="location"
              value="${escapeHtml(candidatePageState.location)}"
              placeholder="Ciudad o ubicación..."
            />
          </div>
        </div>

        <div class="filter-field">
          <label class="filter-field-label">Etapa en el proceso</label>
          <select class="filter-input" name="status_filter">
            <option value="">Todas las etapas</option>
            ${["recibida", "en_revision", "entrevista", "oferta", "rechazada"]
              .map((stage) => `<option value="${stage}" ${candidatePageState.status_filter === stage ? "selected" : ""}>${statusLabel(stage)}</option>`)
              .join("")}
          </select>
        </div>

        <div class="filter-field">
          <label class="filter-field-label">Ordenar por</label>
          <select class="filter-input" name="sort">
            <option value="created_at" ${candidatePageState.sort === "created_at" ? "selected" : ""}>Fecha de registro</option>
            <option value="name" ${candidatePageState.sort === "name" ? "selected" : ""}>Nombre</option>
          </select>
        </div>

        <div class="filter-field">
          <label class="filter-field-label">Orden</label>
          <select class="filter-input" name="order">
            <option value="desc" ${candidatePageState.order === "desc" ? "selected" : ""}>Descendente</option>
            <option value="asc" ${candidatePageState.order === "asc" ? "selected" : ""}>Ascendente</option>
          </select>
        </div>
      </div>

      <div class="filter-actions-row">
        <button class="rp-btn rp-btn--primary" type="submit">
          Aplicar filtros
        </button>
      </div>
    </form>
  `;
}

function clearCandidateFilters() {
  candidatePageState = { ...candidatePageState, q: "", location: "", status_filter: "", page: 1 };
  view("candidates");
}


async function csrfToken() {
  const response = await fetch("/api/auth/csrf", { credentials: "same-origin" });
  if (!response.ok) throw new Error("No se pudo iniciar una solicitud segura.");
  return (await response.json()).csrfToken;
}

async function apiRequest(url, options = {}) {
  const request = {
    ...options,
    credentials: "same-origin",
    headers: { ...(options.headers || {}) },
  };
  if (request.body && !(request.body instanceof FormData)) {
    request.headers["Content-Type"] = "application/json";
    request.body = JSON.stringify(request.body);
  }
  if (request.method && request.method !== "GET") {
    request.headers["X-CSRF-Token"] = await csrfToken();
  }

  const response = await fetch(url, request);
  if (response.status === 401) {
    location.href = "index.html";
    throw new Error("Tu sesión expiró. Inicia sesión de nuevo.");
  }
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    const detail = Array.isArray(result.detail)
      ? result.detail.map((item) => item.msg).join(" ")
      : result.detail;
    throw new Error(detail || "No se pudo completar la solicitud.");
  }
  if (response.status === 204) return null;
  return response;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function getDocuments(candidate) {
  return Array.isArray(candidate.documents) ? candidate.documents : [];
}

function documentName(document) {
  return typeof document === "string" ? document : document.name;
}


/* ==========================================================================
   FASE 5: DASHBOARD HOME (Saludo dinámico, Métricas animadas, Embudo, Quick Actions)
   ========================================================================== */

function getDayGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Buenos días";
  if (hour >= 12 && hour < 20) return "Buenas tardes";
  return "Buenas noches";
}

function renderSparklineSvg(color = "#2563EB", isUp = true) {
  const d = isUp
    ? "M0 20 Q 25 22, 50 12 T 100 4"
    : "M0 6 Q 25 4, 50 14 T 100 20";
  return `
    <svg viewBox="0 0 100 24" preserveAspectRatio="none">
      <path d="${d}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
    </svg>
  `;
}

function renderAdminOrRecruiterHome(summary, applications, vacancies) {
  const greeting = getDayGreeting();
  const firstName = (user.name || "Usuario").trim().split(" ")[0];
  const isAdmin = user.role === "administrador";

  const totalApps = applications.length;
  const inInterviewCount = applications.filter((a) => a.status === "entrevista").length;
  const inOfferCount = applications.filter((a) => a.status === "oferta").length;
  const inReviewCount = applications.filter((a) => a.status === "en_revision").length;
  const receivedCount = applications.filter((a) => a.status === "recibida").length;
  const rejectedCount = applications.filter((a) => a.status === "rechazada").length;

  const activeVacanciesCount = (vacancies || []).filter((v) => v.status !== "closed").length || summary.vacancies || 0;

  // Icons
  const briefcaseIcon = typeof window.ui !== "undefined" && window.ui.icon ? window.ui.icon("briefcase") : "";
  const usersIcon = typeof window.ui !== "undefined" && window.ui.icon ? window.ui.icon("users") : "";
  const calendarIcon = typeof window.ui !== "undefined" && window.ui.icon ? window.ui.icon("calendar") : "";
  const awardIcon = typeof window.ui !== "undefined" && window.ui.icon ? window.ui.icon("award") : "";
  const plusIcon = typeof window.ui !== "undefined" && window.ui.icon ? window.ui.icon("plus-circle") : "";
  const kanbanIcon = typeof window.ui !== "undefined" && window.ui.icon ? window.ui.icon("columns-3") : "";
  const userCheckIcon = typeof window.ui !== "undefined" && window.ui.icon ? window.ui.icon("user-check") : "";
  const shieldIcon = typeof window.ui !== "undefined" && window.ui.icon ? window.ui.icon("shield-check") : "";
  const externalIcon = typeof window.ui !== "undefined" && window.ui.icon ? window.ui.icon("external-link", "rp-icon-sm") : "";
  const trendUpIcon = typeof window.ui !== "undefined" && window.ui.icon ? window.ui.icon("trending-up", "rp-icon-sm") : "";

  // Funnel calculation
  const funnelStages = [
    { key: "recibida", label: "Recibidas (Nuevas)", count: receivedCount, color: "#3b82f6" },
    { key: "en_revision", label: "En revisión", count: inReviewCount, color: "#0ea5e9" },
    { key: "entrevista", label: "En entrevista", count: inInterviewCount, color: "#8b5cf6" },
    { key: "oferta", label: "Con oferta", count: inOfferCount, color: "#10b981" },
    { key: "rechazada", label: "Rechazadas", count: rejectedCount, color: "#ef4444" },
  ];

  const funnelTotal = Math.max(1, totalApps);

  // Recent applicants
  const recentApplicants = applications.slice(0, 5);

  return `
    <!-- BANNER DE BIENVENIDA Y MÓDULOS DEL PDF (Screen 2: Sistema de Selección) -->
    <div class="pdf-welcome-banner">
      <div class="pdf-welcome-left">
        <h1 class="pdf-welcome-title">¡Bienvenido al Sistema de Gestión!</h1>
        <p class="pdf-welcome-subtitle">Accede a todos los módulos desde el menú lateral. Tu sesión está activa y segura.</p>
        <div class="pdf-banner-pills-row">
          <div class="pdf-banner-pill"><i data-lucide="building"></i><span>Empresas</span></div>
          <div class="pdf-banner-pill active" onclick="view('procesos')" style="cursor: pointer;"><i data-lucide="check-circle-2"></i><span>Selección</span></div>
          <div class="pdf-banner-pill"><i data-lucide="users"></i><span>RRHH</span></div>
        </div>
      </div>
      <div class="pdf-banner-user-circle">
        <i data-lucide="user"></i>
      </div>
    </div>

    <!-- 4 MÓDULOS PRINCIPALES (Screen 2) -->
    <div class="pdf-modules-grid">
      <div class="pdf-module-card" onclick="view('candidates')">
        <div class="pdf-module-icon-wrap">
          <i data-lucide="users"></i>
        </div>
        <div class="pdf-module-texts">
          <h3>Usuarios</h3>
          <span>Gestión completa</span>
        </div>
      </div>
      <div class="pdf-module-card" onclick="view('jobs')">
        <div class="pdf-module-icon-wrap">
          <i data-lucide="briefcase"></i>
        </div>
        <div class="pdf-module-texts">
          <h3>Activos</h3>
          <span>Control total</span>
        </div>
      </div>
      <div class="pdf-module-card" onclick="view('procesos')">
        <div class="pdf-module-icon-wrap" style="color: #d97706; background: #fef3c7;">
          <i data-lucide="clock"></i>
        </div>
        <div class="pdf-module-texts">
          <h3>Tareas Pendientes</h3>
          <span>En revisión (${inReviewCount})</span>
        </div>
      </div>
      <div class="pdf-module-card" onclick="openReportModal()">
        <div class="pdf-module-icon-wrap" style="color: #2563eb; background: #eff6ff;">
          <i data-lucide="bar-chart-2"></i>
        </div>
        <div class="pdf-module-texts">
          <h3>Reportes</h3>
          <span>Análisis</span>
        </div>
      </div>
    </div>

    <!-- ACCIONES RÁPIDAS (Screen 2) -->
    <div class="pdf-quick-actions-wrap" style="margin-bottom: 24px;">
      <div class="pdf-quick-actions-title">Acciones Rápidas</div>
      <div class="pdf-quick-actions-row">
        <button type="button" class="pdf-quick-btn" onclick="openMesaDeAyudas()">
          <i data-lucide="headphones" style="color: #15803d;"></i>
          <span>Nuevo Ticket</span>
        </button>
        <button type="button" class="pdf-quick-btn" onclick="view('jobs')">
          <i data-lucide="plus-circle" style="color: #15803d;"></i>
          <span>Registrar Activo</span>
        </button>
        <button type="button" class="pdf-quick-btn" onclick="openReportModal()">
          <i data-lucide="file-text" style="color: #15803d;"></i>
          <span>Generar Reporte</span>
        </button>
      </div>
    </div>

    <div class="dash-header-wrap">
      <div class="dash-header-main">
        <span class="dash-tag">
          ${isAdmin ? "Panel de Administración" : "Panel de Reclutamiento"}
        </span>
        <h1 class="dash-greeting-title">
          ${greeting}, ${escapeHtml(firstName)} <span class="rp-user-badge"><span class="rp-pulse-dot is-online"></span> Activo</span>
        </h1>
        <p class="dash-greeting-sub">
          ${
            isAdmin
              ? "Monitorea el talento global, vacantes activas y el ritmo de contratación de tu equipo."
              : "Gestiona tus vacantes asignadas y avanza a tus candidatos en el proceso de selección."
          }
        </p>
      </div>

      <div class="dash-header-actions">
        <button
          type="button"
          class="rp-btn rp-btn--primary"
          onclick="view('jobs')"
        >
          ${plusIcon}
          <span>Publicar vacante</span>
        </button>
        <button
          type="button"
          class="rp-btn rp-btn--secondary"
          onclick="view('pipeline')"
        >
          ${kanbanIcon}
          <span>Ver pipeline</span>
        </button>
      </div>
    </div>

    <!-- Metricas con CountUp -->
    <div class="dash-metrics-grid rp-stagger">
      <div class="dash-metric-card" onclick="view('jobs')" style="cursor: pointer;" title="Ver todas las vacantes">
        <div class="metric-top">
          <div class="metric-icon-wrap bg-blue">${briefcaseIcon}</div>
          <span class="metric-trend-pill is-positive">${trendUpIcon} En convocatoria</span>
        </div>
        <div class="metric-body">
          <div class="metric-value" data-count="${activeVacanciesCount}">0</div>
          <div class="metric-label">Vacantes Activas</div>
        </div>
        <div class="metric-sparkline">${renderSparklineSvg("#2563EB", true)}</div>
      </div>

      <div class="dash-metric-card" onclick="view('pipeline')" style="cursor: pointer;" title="Ir al pipeline de candidatos">
        <div class="metric-top">
          <div class="metric-icon-wrap bg-purple">${usersIcon}</div>
          <span class="metric-trend-pill">${trendUpIcon} En pipeline</span>
        </div>
        <div class="metric-body">
          <div class="metric-value" data-count="${totalApps}">0</div>
          <div class="metric-label">Total Postulaciones</div>
        </div>
        <div class="metric-sparkline">${renderSparklineSvg("#7C3AED", true)}</div>
      </div>

      <div class="dash-metric-card" onclick="view('pipeline')" style="cursor: pointer;" title="Candidatos en entrevista">
        <div class="metric-top">
          <div class="metric-icon-wrap bg-amber">${calendarIcon}</div>
          <span class="metric-trend-pill is-positive">${trendUpIcon} Evaluación técnica</span>
        </div>
        <div class="metric-body">
          <div class="metric-value" data-count="${inInterviewCount}">0</div>
          <div class="metric-label">En Entrevista</div>
        </div>
        <div class="metric-sparkline">${renderSparklineSvg("#D97706", true)}</div>
      </div>

      <div class="dash-metric-card" onclick="view('pipeline')" style="cursor: pointer;" title="Candidatos con oferta">
        <div class="metric-top">
          <div class="metric-icon-wrap bg-emerald">${awardIcon}</div>
          <span class="metric-trend-pill is-positive">${trendUpIcon} Finalistas</span>
        </div>
        <div class="metric-body">
          <div class="metric-value" data-count="${inOfferCount}">0</div>
          <div class="metric-label">Ofertas Extendidas</div>
        </div>
        <div class="metric-sparkline">${renderSparklineSvg("#059669", true)}</div>
      </div>
    </div>

    <!-- Acciones Rápidas -->
    <div class="dash-section-header">
      <h2 class="dash-section-title">Acciones Rápidas</h2>
    </div>

    <div class="dash-actions-grid rp-stagger">
      <div class="dash-action-card" onclick="view('jobs')">
        <div class="dash-action-icon">${plusIcon}</div>
        <div class="dash-action-text">
          <span class="dash-action-title">Nueva Vacante</span>
          <span class="dash-action-desc">Crear y publicar convocatoria</span>
        </div>
      </div>

      <div class="dash-action-card" onclick="view('pipeline')">
        <div class="dash-action-icon">${kanbanIcon}</div>
        <div class="dash-action-text">
          <span class="dash-action-title">Proceso de Selección</span>
          <span class="dash-action-desc">Avanzar candidatos en Kanban</span>
        </div>
      </div>

      <div class="dash-action-card" onclick="view('candidates')">
        <div class="dash-action-icon">${userCheckIcon}</div>
        <div class="dash-action-text">
          <span class="dash-action-title">Directorio de Talento</span>
          <span class="dash-action-desc">Buscar y filtrar perfiles</span>
        </div>
      </div>

      ${
        isAdmin
          ? `
            <div class="dash-action-card" onclick="view('recruiters')">
              <div class="dash-action-icon">${shieldIcon}</div>
              <div class="dash-action-text">
                <span class="dash-action-title">Equipo Reclutadores</span>
                <span class="dash-action-desc">Administrar accesos y carga</span>
              </div>
            </div>
          `
          : `
            <div class="dash-action-card" onclick="window.open('empleos.html', '_blank')">
              <div class="dash-action-icon">${externalIcon}</div>
              <div class="dash-action-text">
                <span class="dash-action-title">Portal de Empleos</span>
                <span class="dash-action-desc">Ver vista pública para candidatos</span>
              </div>
            </div>
          `
      }
    </div>

    <!-- Analíticas: Embudo de Selección y Postulaciones Recientes -->
    <div class="dash-two-col">
      <div class="dash-panel">
        <div class="dash-section-header" style="margin-bottom: 8px;">
          <h2 class="dash-section-title">Embudo de Contratación (Funnel)</h2>
          <button type="button" class="rp-btn rp-btn--ghost rp-btn--sm" onclick="view('pipeline')">
            <span>Ver tablero</span>
          </button>
        </div>
        <p style="margin: 0 0 16px 0; font-size: 12.5px; color: var(--rp-text-muted);">
          Distribución porcentual de los ${totalApps} candidatos en el pipeline activo.
        </p>

        <div class="funnel-steps-list">
          ${funnelStages
            .map((stage) => {
              const pct = totalApps > 0 ? Math.round((stage.count / totalApps) * 100) : 0;
              return `
                <div class="funnel-step-row" onclick="view('pipeline')" title="Ver candidatos en ${escapeHtml(stage.label)}">
                  <div class="funnel-step-header">
                    <div class="funnel-step-name-wrap">
                      <span class="funnel-stage-dot" style="background: ${stage.color};"></span>
                      <span>${escapeHtml(stage.label)}</span>
                    </div>
                    <div>
                      <span style="font-weight: 700; color: var(--rp-text);">${stage.count}</span>
                      <small style="color: var(--rp-text-muted); margin-left: 4px;">(${pct}%)</small>
                    </div>
                  </div>
                  <div class="funnel-step-track">
                    <div class="funnel-step-fill" style="width: ${pct}%; background: ${stage.color};"></div>
                  </div>
                </div>
              `;
            })
            .join("")}
        </div>
      </div>

      <div class="dash-panel">
        <div class="dash-section-header" style="margin-bottom: 8px;">
          <h2 class="dash-section-title">Postulaciones Recientes</h2>
          <button type="button" class="rp-btn rp-btn--ghost rp-btn--sm" onclick="view('candidates')">
            <span>Ver todas</span>
          </button>
        </div>
        <p style="margin: 0 0 12px 0; font-size: 12.5px; color: var(--rp-text-muted);">
          Últimos candidatos inscritos en vacantes abiertas.
        </p>

        <div class="dash-recent-list">
          ${
            recentApplicants.length
              ? recentApplicants
                  .map((app) => {
                    const avatar = typeof window.ui !== "undefined" && window.ui.avatar
                      ? window.ui.avatar(app.name, 32)
                      : getDynamicAvatar(app.name, 32);

                    const tone = app.status === "oferta"
                      ? "success"
                      : app.status === "entrevista"
                      ? "primary"
                      : app.status === "rechazada"
                      ? "danger"
                      : "";

                    const badgeHtml = typeof window.ui !== "undefined" && window.ui.badge
                      ? window.ui.badge(statusLabel(app.status), tone)
                      : `<span class="rp-badge">${escapeHtml(statusLabel(app.status))}</span>`;

                    return `
                      <div class="dash-applicant-item" onclick="openApplicationDetailDialog('${escapeHtml(app.id)}')" style="cursor: pointer;" title="Ver seguimiento de ${escapeHtml(app.name)}">
                        <div class="dash-applicant-left">
                          ${avatar}
                          <div style="min-width: 0;">
                            <h4 class="dash-applicant-name">${escapeHtml(app.name)}</h4>
                            <p class="dash-applicant-sub">${escapeHtml(app.vacancyTitle)}</p>
                          </div>
                        </div>
                        <div class="dash-applicant-right">
                          ${badgeHtml}
                        </div>
                      </div>
                    `;
                  })
                  .join("")
              : `
                <div class="rp-empty rp-empty--compact" style="margin-top: 20px;">
                  <p class="rp-empty__text">No hay postulaciones registradas todavía.</p>
                </div>
              `
          }
        </div>
      </div>
    </div>
  `;
}

function renderCandidateHome(summary, applications, vacancies) {
  const greeting = getDayGreeting();
  const firstName = (user.name || "Candidato").trim().split(" ")[0];

  const totalMyApps = applications.length;
  const inInterviewCount = applications.filter((a) => a.status === "entrevista").length;
  const inOfferCount = applications.filter((a) => a.status === "oferta").length;
  const inReviewCount = applications.filter((a) => a.status === "en_revision").length;

  const hasOffer = inOfferCount > 0;
  const hasInterview = inInterviewCount > 0;

  const briefcaseIcon = typeof window.ui !== "undefined" && window.ui.icon ? window.ui.icon("briefcase") : "";
  const fileCheckIcon = typeof window.ui !== "undefined" && window.ui.icon ? window.ui.icon("file-check-2") : "";
  const calendarIcon = typeof window.ui !== "undefined" && window.ui.icon ? window.ui.icon("calendar") : "";
  const awardIcon = typeof window.ui !== "undefined" && window.ui.icon ? window.ui.icon("award") : "";
  const searchIcon = typeof window.ui !== "undefined" && window.ui.icon ? window.ui.icon("search") : "";
  const fileTextIcon = typeof window.ui !== "undefined" && window.ui.icon ? window.ui.icon("file-text") : "";
  const userIcon = typeof window.ui !== "undefined" && window.ui.icon ? window.ui.icon("user") : "";
  const trendUpIcon = typeof window.ui !== "undefined" && window.ui.icon ? window.ui.icon("trending-up", "rp-icon-sm") : "";

  return `
    <!-- BANNER DE BIENVENIDA Y MÓDULOS DEL PDF (Screen 2: Sistema de Selección) -->
    <div class="pdf-welcome-banner">
      <div class="pdf-welcome-left">
        <h1 class="pdf-welcome-title">¡Bienvenido al Sistema de Gestión!</h1>
        <p class="pdf-welcome-subtitle">Accede a todos los módulos desde el menú lateral. Tu sesión está activa y segura.</p>
        <div class="pdf-banner-pills-row">
          <div class="pdf-banner-pill"><i data-lucide="building"></i><span>Empresas</span></div>
          <div class="pdf-banner-pill active" onclick="view('procesos')" style="cursor: pointer;"><i data-lucide="check-circle-2"></i><span>Selección</span></div>
          <div class="pdf-banner-pill"><i data-lucide="users"></i><span>RRHH</span></div>
        </div>
      </div>
      <div class="pdf-banner-user-circle">
        <i data-lucide="user"></i>
      </div>
    </div>

    <!-- 4 MÓDULOS PRINCIPALES (Screen 2) -->
    <div class="pdf-modules-grid">
      <div class="pdf-module-card" onclick="view('candidates')">
        <div class="pdf-module-icon-wrap">
          <i data-lucide="users"></i>
        </div>
        <div class="pdf-module-texts">
          <h3>Usuarios</h3>
          <span>Gestión completa</span>
        </div>
      </div>
      <div class="pdf-module-card" onclick="view('jobs')">
        <div class="pdf-module-icon-wrap">
          <i data-lucide="briefcase"></i>
        </div>
        <div class="pdf-module-texts">
          <h3>Activos</h3>
          <span>Control total</span>
        </div>
      </div>
      <div class="pdf-module-card" onclick="view('procesos')">
        <div class="pdf-module-icon-wrap" style="color: #d97706; background: #fef3c7;">
          <i data-lucide="clock"></i>
        </div>
        <div class="pdf-module-texts">
          <h3>Tareas Pendientes</h3>
          <span>En revisión (${inReviewCount})</span>
        </div>
      </div>
      <div class="pdf-module-card" onclick="openReportModal()">
        <div class="pdf-module-icon-wrap" style="color: #2563eb; background: #eff6ff;">
          <i data-lucide="bar-chart-2"></i>
        </div>
        <div class="pdf-module-texts">
          <h3>Reportes</h3>
          <span>Análisis</span>
        </div>
      </div>
    </div>

    <!-- ACCIONES RÁPIDAS (Screen 2) -->
    <div class="pdf-quick-actions-wrap" style="margin-bottom: 24px;">
      <div class="pdf-quick-actions-title">Acciones Rápidas</div>
      <div class="pdf-quick-actions-row">
        <button type="button" class="pdf-quick-btn" onclick="openMesaDeAyudas()">
          <i data-lucide="headphones" style="color: #15803d;"></i>
          <span>Nuevo Ticket</span>
        </button>
        <button type="button" class="pdf-quick-btn" onclick="view('jobs')">
          <i data-lucide="plus-circle" style="color: #15803d;"></i>
          <span>Registrar Activo</span>
        </button>
        <button type="button" class="pdf-quick-btn" onclick="openReportModal()">
          <i data-lucide="file-text" style="color: #15803d;"></i>
          <span>Generar Reporte</span>
        </button>
      </div>
    </div>

    <div class="dash-header-wrap">
      <div class="dash-header-main">
        <span class="dash-tag">Portal del Candidato</span>
        <h1 class="dash-greeting-title">
          ${greeting}, ${escapeHtml(firstName)} <span class="rp-user-badge"><span class="rp-pulse-dot is-online"></span> Activo</span>
        </h1>
        <p class="dash-greeting-sub">
          Consulta el estado de tus procesos de selección y encuentra oportunidades profesionales afines a tu perfil.
        </p>
      </div>

      <div class="dash-header-actions">
        <button
          type="button"
          class="rp-btn rp-btn--primary"
          onclick="view('jobs')"
        >
          ${searchIcon}
          <span>Explorar vacantes</span>
        </button>
      </div>
    </div>

    ${
      hasOffer
        ? `
          <div class="candidate-hero-banner has-offer">
            <div class="candidate-hero-content">
              <span class="rp-badge rp-badge--success" style="width: fit-content;"><i data-lucide="award" class="rp-icon rp-icon-sm"></i> Oferta formal recibida</span>
              <h2 class="candidate-hero-title">Tienes una propuesta de contratación</h2>
              <p class="candidate-hero-text">
                El equipo de reclutamiento ha aprobado tu perfil y te ha extendido una oferta formal. Revisa los detalles de tu postulación en la sección de postulaciones.
              </p>
            </div>
            <button type="button" class="rp-btn rp-btn--primary" onclick="view('applications')">
              Ver mis postulaciones
            </button>
          </div>
        `
        : hasInterview
        ? `
          <div class="candidate-hero-banner" style="border-color: rgba(139, 92, 246, 0.3); background: linear-gradient(135deg, rgba(139, 92, 246, 0.08), rgba(59, 130, 246, 0.06));">
            <div class="candidate-hero-content">
              <span class="rp-badge rp-badge--primary" style="width: fit-content;"><i data-lucide="calendar" class="rp-icon rp-icon-sm"></i> Entrevista en curso</span>
              <h2 class="candidate-hero-title">Avanzaste a la etapa de entrevista</h2>
              <p class="candidate-hero-text">
                Uno de tus procesos está en fase de entrevista técnica o panel. Nuestro equipo se pondrá en contacto contigo para coordinar fechas y horarios.
              </p>
            </div>
            <button type="button" class="rp-btn rp-btn--secondary" onclick="view('applications')">
              Consultar estado
            </button>
          </div>
        `
        : `
          <div class="candidate-hero-banner">
            <div class="candidate-hero-content">
              <h2 class="candidate-hero-title">Impulsa tu carrera con RecruitPro</h2>
              <p class="candidate-hero-text">
                Revisa las convocatorias vigentes, sube tu currículum actualizado en formato PDF y mantén tu perfil al día para conectar con las mejores empresas.
              </p>
            </div>
            <button type="button" class="rp-btn rp-btn--primary" onclick="view('jobs')">
              Ver convocatorias
            </button>
          </div>
        `
    }

    <!-- Métricas del candidato -->
    <div class="dash-metrics-grid rp-stagger">
      <div class="dash-metric-card" onclick="view('jobs')" style="cursor: pointer;" title="Explorar vacantes activas">
        <div class="metric-top">
          <div class="metric-icon-wrap bg-blue">${briefcaseIcon}</div>
          <span class="metric-trend-pill is-positive">${trendUpIcon} Oportunidades</span>
        </div>
        <div class="metric-body">
          <div class="metric-value" data-count="${summary.vacancies || 0}">0</div>
          <div class="metric-label">Vacantes Disponibles</div>
        </div>
        <div class="metric-sparkline">${renderSparklineSvg("#2563EB", true)}</div>
      </div>

      <div class="dash-metric-card" onclick="view('applications')" style="cursor: pointer;" title="Ver mis postulaciones">
        <div class="metric-top">
          <div class="metric-icon-wrap bg-purple">${fileCheckIcon}</div>
          <span class="metric-trend-pill">${trendUpIcon} Enviadas</span>
        </div>
        <div class="metric-body">
          <div class="metric-value" data-count="${totalMyApps}">0</div>
          <div class="metric-label">Mis Postulaciones</div>
        </div>
        <div class="metric-sparkline">${renderSparklineSvg("#7C3AED", true)}</div>
      </div>

      <div class="dash-metric-card" onclick="view('applications')" style="cursor: pointer;" title="En proceso de entrevista">
        <div class="metric-top">
          <div class="metric-icon-wrap bg-amber">${calendarIcon}</div>
          <span class="metric-trend-pill is-positive">${trendUpIcon} Entrevista</span>
        </div>
        <div class="metric-body">
          <div class="metric-value" data-count="${inInterviewCount}">0</div>
          <div class="metric-label">En Entrevista</div>
        </div>
        <div class="metric-sparkline">${renderSparklineSvg("#D97706", true)}</div>
      </div>

      <div class="dash-metric-card" onclick="view('applications')" style="cursor: pointer;" title="Ofertas recibidas">
        <div class="metric-top">
          <div class="metric-icon-wrap bg-emerald">${awardIcon}</div>
          <span class="metric-trend-pill is-positive">${trendUpIcon} Propuestas</span>
        </div>
        <div class="metric-body">
          <div class="metric-value" data-count="${inOfferCount}">0</div>
          <div class="metric-label">Ofertas Recibidas</div>
        </div>
        <div class="metric-sparkline">${renderSparklineSvg("#059669", true)}</div>
      </div>
    </div>

    <!-- Acciones Rápidas Candidato -->
    <div class="dash-section-header">
      <h2 class="dash-section-title">Accesos Rápidos</h2>
    </div>

    <div class="dash-actions-grid rp-stagger">
      <div class="dash-action-card" onclick="view('jobs')">
        <div class="dash-action-icon">${searchIcon}</div>
        <div class="dash-action-text">
          <span class="dash-action-title">Explorar Vacantes</span>
          <span class="dash-action-desc">Encontrar puestos por cargo y ciudad</span>
        </div>
      </div>

      <div class="dash-action-card" onclick="view('applications')">
        <div class="dash-action-icon">${fileCheckIcon}</div>
        <div class="dash-action-text">
          <span class="dash-action-title">Mis Postulaciones</span>
          <span class="dash-action-desc">Revisar avances y respuestas</span>
        </div>
      </div>

      <div class="dash-action-card" onclick="view('docs')">
        <div class="dash-action-icon">${fileTextIcon}</div>
        <div class="dash-action-text">
          <span class="dash-action-title">Documentos y CV</span>
          <span class="dash-action-desc">Gestionar currículum adjunto</span>
        </div>
      </div>

      <div class="dash-action-card" onclick="view('profile')">
        <div class="dash-action-icon">${userIcon}</div>
        <div class="dash-action-text">
          <span class="dash-action-title">Editar Perfil</span>
          <span class="dash-action-desc">Actualizar teléfono y datos</span>
        </div>
      </div>
    </div>

    <!-- Lista de Mis Postulaciones Recientes -->
    <div class="dash-panel" style="margin-bottom: 24px;">
      <div class="dash-section-header" style="margin-bottom: 8px;">
        <h2 class="dash-section-title">Mis Procesos Activos</h2>
        <button type="button" class="rp-btn rp-btn--ghost rp-btn--sm" onclick="view('applications')">
          <span>Ver todas</span>
        </button>
      </div>

      <div class="dash-recent-list">
        ${
          applications.length
            ? applications
                .slice(0, 4)
                .map((item) => {
                  const isOffer = item.status === "oferta";
                  const isInterview = item.status === "entrevista";
                  const tone = isOffer ? "success" : isInterview ? "primary" : "";

                  const badgeHtml = typeof window.ui !== "undefined" && window.ui.badge
                    ? window.ui.badge(statusLabel(item.status), tone)
                    : `<span class="rp-badge">${escapeHtml(statusLabel(item.status))}</span>`;

                  return `
                    <div class="dash-applicant-item" onclick="view('applications')" style="cursor: pointer;">
                      <div class="dash-applicant-left">
                        <div class="metric-icon-wrap ${isOffer ? "bg-emerald" : isInterview ? "bg-purple" : "bg-blue"}" style="width: 32px; height: 32px; border-radius: 8px;">
                          ${briefcaseIcon}
                        </div>
                        <div style="min-width: 0;">
                          <h4 class="dash-applicant-name">${escapeHtml(item.vacancyTitle)}</h4>
                          <p class="dash-applicant-sub">Postulado el ${new Date(item.createdAt).toLocaleDateString("es")}</p>
                        </div>
                      </div>
                      <div class="dash-applicant-right">
                        ${badgeHtml}
                      </div>
                    </div>
                  `;
                })
                .join("")
            : `
              <div class="rp-empty rp-empty--compact" style="margin-top: 20px;">
                <p class="rp-empty__text">Todavía no te has postulado a ninguna vacante.</p>
                <button type="button" class="rp-btn rp-btn--primary rp-btn--sm" style="margin-top: 10px;" onclick="view('jobs')">
                  Ver vacantes disponibles
                </button>
              </div>
            `
        }
      </div>
    </div>
  `;
}


async function view(page, vacancyId = "") {
  if (!user) return;
  nav.querySelectorAll("button").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.page === (page === "apply" ? "jobs" : page),
    );
  });
  updateNavPill();
  closeMobileMenu();
  document.querySelectorAll(".pdf-sidebar-link").forEach((button) => {
    button.classList.toggle("active", button.dataset.nav === page);
  });

  try {
    if (page === "home") {
      const summaryRes = await apiRequest("/api/dashboard/summary");
      const summary = await summaryRes.json();

      let applications = [];
      let vacancies = [];

      if (user.role !== "candidato") {
        try {
          const [appsRes, vacsRes] = await Promise.all([
            apiRequest("/api/applications"),
            apiRequest("/api/vacancies?page=1&page_size=10"),
          ]);
          applications = (await appsRes.json()).items || [];
          vacancies = (await vacsRes.json()).items || [];
          pipelineApplicationsCache = applications;
          vacanciesCache = vacancies;
        } catch (err) {
          console.warn("Could not load dashboard data:", err);
        }
        app.innerHTML = renderAdminOrRecruiterHome(summary, applications, vacancies);
      } else {
        try {
          const [myAppsRes, vacsRes] = await Promise.all([
            apiRequest("/api/applications/mine"),
            apiRequest("/api/vacancies?page=1&page_size=10"),
          ]);
          applications = (await myAppsRes.json()).items || [];
          vacancies = (await vacsRes.json()).items || [];
          vacanciesCache = vacancies;
        } catch (err) {
          console.warn("Could not load candidate dashboard data:", err);
        }
        app.innerHTML = renderCandidateHome(summary, applications, vacancies);
      }

      setTimeout(() => {
        document.querySelectorAll(".metric-value[data-count]").forEach((el) => {
          const target = parseInt(el.getAttribute("data-count"), 10) || 0;
          if (typeof window.ui !== "undefined" && window.ui.countUp) {
            window.ui.countUp(el, target);
          } else {
            el.textContent = target;
          }
        });
        if (typeof window.ui !== "undefined" && window.ui.refreshIcons) {
          window.ui.refreshIcons();
        }
      }, 10);
    } else if (page === "profile") {
      app.innerHTML = `
        <div class="head">
          <small>PERFIL Y SEGURIDAD</small>
          <h1>Configuración de Cuenta</h1>
          <p>Actualiza tus datos de contacto y protege el acceso a tu cuenta.</p>
        </div>

        <div class="profile-section-card">
          <h2 class="profile-section-title">Datos Personales</h2>
          <p class="profile-section-sub">Información visible para los procesos de selección y contacto.</p>

          <form id="profile-form" onsubmit="saveOwnProfile(event)">
            <div class="profile-form-grid">
              <div>
                <label class="filter-field-label" for="profile-name">Nombre completo</label>
                <input class="filter-input" id="profile-name" name="name" required maxlength="100" value="${escapeHtml(user.name)}" />
              </div>
              <div>
                <label class="filter-field-label" for="profile-email">Correo electrónico</label>
                <input class="filter-input" id="profile-email" type="email" readonly value="${escapeHtml(user.email)}" style="opacity: 0.75;" />
              </div>
              <div>
                <label class="filter-field-label" for="profile-phone">Teléfono de contacto</label>
                <input class="filter-input" id="profile-phone" name="phone" maxlength="30" value="${escapeHtml(user.phone || "")}" placeholder="Ej. +52 55 1234 5678" />
              </div>
              <div>
                <label class="filter-field-label" for="profile-location">Ciudad o ubicación</label>
                <input class="filter-input" id="profile-location" name="location" maxlength="100" value="${escapeHtml(user.location || "")}" placeholder="Ej. Ciudad de México" />
              </div>
            </div>

            <div id="profile-message" class="notice-box" role="status"></div>

            <div style="display: flex; justify-content: flex-end;">
              <button class="rp-btn rp-btn--primary" type="submit">Guardar cambios</button>
            </div>
          </form>
        </div>

        <div class="profile-section-card">
          <h2 class="profile-section-title">Seguridad y Contraseña</h2>
          <p class="profile-section-sub">Actualiza periódicamente tu contraseña para proteger tu cuenta.</p>

          <form id="password-form" onsubmit="changeOwnPassword(event)">
            <div class="profile-form-grid">
              <div>
                <label class="filter-field-label" for="current-password">Contraseña actual</label>
                <input class="filter-input" id="current-password" name="current_password" type="password" autocomplete="current-password" required />
              </div>
              <div>
                <label class="filter-field-label" for="new-password">Nueva contraseña (mínimo 12 caracteres)</label>
                <input class="filter-input" id="new-password" name="new_password" type="password" minlength="12" maxlength="128" autocomplete="new-password" required />
              </div>
            </div>

            <div id="password-message" class="notice-box" role="status"></div>

            <div style="display: flex; justify-content: flex-end;">
              <button class="rp-btn rp-btn--primary" type="submit">Actualizar contraseña</button>
            </div>
          </form>
        </div>

        <div class="profile-section-card" style="border-color: rgba(239, 68, 68, 0.3);">
          <h2 class="profile-section-title" style="color: var(--rp-danger);">Privacidad y Eliminación Permanente</h2>
          <p class="profile-section-sub">
            Consentimiento registrado: ${user.privacyConsentAt ? new Date(user.privacyConsentAt).toLocaleDateString("es") : "Sin registro previo"}.
            Versión del aviso: ${escapeHtml(user.privacyConsentVersion || "1.0")}.
          </p>
          <p style="font-size: 13px; color: var(--rp-text-muted); margin-bottom: 14px;">
            Para eliminar tu cuenta, postulaciones y archivos definitivamente de RecruitPro, confirma tu contraseña actual. Esta acción no se puede deshacer.
          </p>

          <div style="max-width: 360px; margin-bottom: 14px;">
            <label class="filter-field-label" for="delete-account-password">Contraseña actual para confirmar</label>
            <input class="filter-input" id="delete-account-password" type="password" autocomplete="current-password" required />
          </div>

          <div id="delete-account-message" class="notice-box" role="status"></div>

          <button class="rp-btn rp-btn--danger" type="button" onclick="deleteOwnAccount()">
            Eliminar mi cuenta definitivamente
          </button>
        </div>
      `;
    } else if (page === "applications" && user.role === "candidato") {
      const result = await (await apiRequest("/api/applications/mine")).json();
      const items = result.items.length
        ? `<div class="vacancies-list-v2 rp-stagger">${result.items
            .map((item) => {
              const isOffer = item.status === "oferta";
              const isInterview = item.status === "entrevista";
              const tone = isOffer ? "success" : isInterview ? "primary" : "";

              const badgeHtml = typeof window.ui !== "undefined" && window.ui.badge
                ? window.ui.badge(statusLabel(item.status), tone)
                : `<span class="rp-badge">${escapeHtml(statusLabel(item.status))}</span>`;

              return `
                <article class="vacancy-card-v2" style="${isOffer ? "border: 2px solid #10b981; background: var(--rp-surface);" : isInterview ? "border: 2px solid #8b5cf6; background: var(--rp-surface);" : ""}">
                  <div class="vacancy-card-header-v2">
                    <div class="vacancy-title-area">
                      <div class="vacancy-badges-row">
                        ${badgeHtml}
                      </div>
                      <h2 class="vacancy-card-title">${escapeHtml(item.vacancyTitle)}</h2>
                    </div>
                  </div>

                  ${
                    isOffer
                      ? `
                        <div style="display: flex; align-items: center; gap: 8px; padding: 12px 14px; background: rgba(16, 185, 129, 0.1); border-radius: var(--rp-radius-md); border: 1px solid rgba(16, 185, 129, 0.25); color: #047857; margin: 4px 0;">
                          <i data-lucide="award" class="rp-icon" style="color: #059669; width: 22px; height: 22px;"></i>
                          <span style="font-size: 13.5px; font-weight: 600;">
                            ¡Felicitaciones! Has recibido una Oferta formal de empleo. Nuestro equipo se pondrá en contacto para coordinar los siguientes pasos.
                          </span>
                        </div>
                      `
                      : ""
                  }

                  ${
                    isInterview
                      ? `
                        <div style="display: flex; align-items: center; gap: 8px; padding: 12px 14px; background: rgba(139, 92, 246, 0.1); border-radius: var(--rp-radius-md); border: 1px solid rgba(139, 92, 246, 0.25); color: #5b21b6; margin: 4px 0;">
                          <i data-lucide="calendar" class="rp-icon" style="color: #7c3aed; width: 22px; height: 22px;"></i>
                          <span style="font-size: 13.5px; font-weight: 600;">
                            Has avanzado a la etapa de Entrevista. Te contactaremos pronto con los detalles de agenda y panel.
                          </span>
                        </div>
                      `
                      : ""
                  }

                  <div class="vacancy-card-footer-v2">
                    <span style="font-size: 12px; color: var(--rp-text-muted);">
                      Postulación enviada el ${new Date(item.createdAt).toLocaleDateString("es")}
                    </span>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                      ${item.status === 'borrador' ? `<button type="button" class="rp-btn rp-btn--primary rp-btn--sm" onclick="view('apply', '${escapeHtml(item.vacancyId)}')">Continuar Diligenciando HV</button>` : ''}
                      ${item.status === 'subsanacion_requerida' ? `<button type="button" class="rp-btn rp-btn--sm" style="background: #d97706; color: #fff;" onclick="view('apply', '${escapeHtml(item.vacancyId)}')">⚠️ Subsanar Documentos</button>` : ''}
                      ${item.status !== 'borrador' && item.status !== 'subsanacion_requerida' ? `<button type="button" class="rp-btn rp-btn--secondary rp-btn--sm" onclick="view('apply', '${escapeHtml(item.vacancyId)}')">Ver Expediente y Soportes</button>` : ''}
                      ${item.status !== 'borrador' ? `<a class="rp-btn rp-btn--sm" style="background: #15803d; color: #fff; text-decoration: none;" href="/api/applications/${encodeURIComponent(item.id)}/constancia" target="_blank">Constancia Postulación</a>` : ''}
                    </div>
                  </div>
                </article>
              `;
            })
            .join("")}</div>`
        : (typeof window.ui !== "undefined" && window.ui.emptyState
            ? window.ui.emptyState({ iconName: "clipboard-list", title: "Sin postulaciones", text: "Todavía no te has postulado a ninguna vacante." })
            : '<p class="empty-state">Todavía no tienes postulaciones.</p>');

      app.innerHTML = `
        <div class="head">
          <small>CANDIDATO</small>
          <h1>Mis Postulaciones</h1>
          <p>Consulta el avance y estado de tus procesos de selección en tiempo real.</p>
        </div>
        ${items}
      `;
    } else if (page === "docs" && user.role === "candidato") {
      const uploadIcon = typeof window.ui !== "undefined" && window.ui.icon ? window.ui.icon("upload-cloud") : "";

      app.innerHTML = `
        <div class="head">
          <small>CANDIDATO</small>
          <h1>Mis Documentos y Currículum</h1>
          <p>Sube tu CV para que los reclutadores puedan consultarlo al revisar tus postulaciones.</p>
        </div>

        <div class="profile-section-card">
          <h2 class="profile-section-title">Adjuntar Documento</h2>
          <p class="profile-section-sub">Formatos permitidos: PDF, DOC o DOCX (tamaño máximo: 10 MB).</p>

          <div class="doc-dropzone" onclick="document.getElementById('file').click()">
            ${uploadIcon}
            <p style="margin: 0; font-weight: 700; color: var(--rp-text);">Haz clic o arrastra tu archivo aquí</p>
            <small style="color: var(--rp-text-muted);">PDF, DOC o DOCX hasta 10 MB</small>
            <input type="file" id="file" accept=".pdf,.doc,.docx" required style="display: none;" onchange="if (this.files[0]) document.getElementById('selected-file-label').textContent = 'Archivo seleccionado: ' + this.files[0].name;" />
          </div>
          <div id="selected-file-label" style="margin-top: 8px; font-size: 13px; font-weight: 600; color: var(--rp-primary); text-align: center;"></div>

          <div id="page-message" class="notice-box" role="status" style="margin-top: 14px;"></div>

          <div style="display: flex; justify-content: flex-end; margin-top: 16px;">
            <button class="rp-btn rp-btn--primary" onclick="addDoc()">
              Subir documento
            </button>
          </div>
        </div>

        <div class="dash-section-header">
          <h2 class="dash-section-title">Documentos Guardados</h2>
        </div>

        <div class="profile-section-card">
          ${renderDocumentList(getDocuments(user))}
        </div>
      `;
    } else if (page === "procesos" && user.role !== "candidato") {
      let applications = [];
      let vacancies = [];
      try {
        const [appsRes, vacsRes] = await Promise.all([
          apiRequest("/api/applications"),
          apiRequest("/api/vacancies?page=1&page_size=50"),
        ]);
        applications = (await appsRes.json()).items || [];
        vacancies = (await vacsRes.json()).items || [];
        pipelineApplicationsCache = applications;
        vacanciesCache = vacancies;
      } catch (err) {
        console.warn("Could not load procesos data:", err);
      }
      app.innerHTML = renderProcesosDeSeleccion(applications, vacancies);
    } else if (page === "pipeline" && user.role !== "candidato") {
      const vacanciesRes = await (await apiRequest("/api/vacancies?page=1&page_size=100")).json();
      vacanciesCache = vacanciesRes.items;
      usersCache = user.role === "administrador"
        ? (await (await apiRequest("/api/users?role=reclutador")).json()).items
        : [user];
      const appsRes = await (await apiRequest("/api/applications" + (currentPipelineVacancyId ? `?vacancy_id=${encodeURIComponent(currentPipelineVacancyId)}` : ""))).json();
      pipelineApplicationsCache = appsRes.items;
      app.innerHTML = renderPipelineView();
    } else if (page === "candidates" && user.role !== "candidato") {
      const params = new URLSearchParams({ ...candidatePageState, role: "candidato", page: String(candidatePageState.page), page_size: "20" });
      const result = await (await apiRequest(`/api/users?${params}`)).json();
      usersCache = result.items;
      app.innerHTML = `
        <div class="head">
          <small>TALENTO</small>
          <h1>Directorio de Candidatos</h1>
          <p>Filtra y revisa los candidatos inscritos en las convocatorias de la plataforma.</p>
        </div>
        ${renderCandidateFilters()}
        ${renderCandidates(result.items)}
        ${renderPager(result, "candidates")}
      `;
    } else if (page === "recruiters" && user.role === "administrador") {
      usersCache = await (await apiRequest("/api/users?role=reclutador")).json();
      usersCache = usersCache.items;
      app.innerHTML = `
        <div class="head">
          <small>ADMINISTRACIÓN</small>
          <h1>Gestión de Reclutadores</h1>
          <p>Administra los permisos y accesos de los miembros del equipo de selección.</p>
        </div>
        ${renderRecruiters(usersCache)}
      `;
    } else if (page === "jobs") {
      const params = new URLSearchParams({ ...vacancyPageState, page: String(vacancyPageState.page), page_size: "20" });
      const result = await (await apiRequest(`/api/vacancies?${params}`)).json();
      vacanciesCache = result.items;
      usersCache = user.role === "administrador"
        ? (await (await apiRequest("/api/users?role=reclutador")).json()).items || []
        : user.role === "reclutador" ? [user] : [];
      app.innerHTML = `${renderVacancies(result.items)}${renderPager(result, "jobs")}`;
    } else if (page === "apply" && user.role === "candidato") {
      vacanciesCache = (await (await apiRequest("/api/vacancies")).json()).items || [];
      const vacancy = vacanciesCache.find((entry) => entry.id === vacancyId) || {
        id: vacancyId,
        title: "Convocatoria Docente CECAR",
        type: "Cátedra Universitaria",
        faculty: "Facultad de Educación y Ciencias Sociales",
        program: "Licenciatura en Educación Infantil",
        campus: "Sede Principal Sincelejo",
        academic_period: "2026-2",
        code: "CONV-2026-DOC-01",
      };
      await ensureCatalogos();
      try {
        const draftRes = await apiRequest("/api/applications/draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vacancy_id: vacancy.id, privacy_consent: true }),
        });
        const draftData = await draftRes.json();
        currentCandidateAppId = draftData.applicationId;
        const dossierRes = await apiRequest(`/api/applications/${encodeURIComponent(currentCandidateAppId)}/dossier`);
        currentCandidateDossier = await dossierRes.json();
        app.innerHTML = renderCecarHvBuilder(currentCandidateDossier, vacancy);
      } catch (err) {
        console.error("Error al cargar expediente de postulación:", err);
        app.innerHTML = `<div class="box notice-box is-error" role="alert">${escapeHtml(err.message)}</div>`;
      }
    }
    setTimeout(() => {
      if (typeof window.ui !== "undefined" && window.ui.refreshIcons) {
        window.ui.refreshIcons();
      }
    }, 15);
  } catch (error) {
    console.error("No se pudo cargar la pantalla:", error);
    app.innerHTML = `<div class="box notice-box is-error" role="alert">${escapeHtml(error.message)}</div>`;
  }
}

function renderApplicationForm(vacancy) {
  const candidate = user;
  const fileIcon = typeof window.ui !== "undefined" && window.ui.icon ? window.ui.icon("file-text", "rp-icon-sm") : "";

  return `
    <div class="head">
      <small>POSTULACIÓN</small>
      <h1>Completar Postulación</h1>
      <p>Confirma tus datos y adjunta tu currículum para participar en este proceso.</p>
    </div>

    <div class="profile-section-card" style="max-width: 760px; margin: 0 auto 24px;">
      <div style="padding-bottom: 16px; margin-bottom: 18px; border-bottom: 1px solid var(--rp-border);">
        <span class="rp-badge rp-badge--primary" style="margin-bottom: 6px;">${escapeHtml(vacancy.type)}</span>
        <h2 style="margin: 0 0 4px 0; font-size: 20px; font-weight: 700; color: var(--rp-text);">${escapeHtml(vacancy.title)}</h2>
        <span style="font-size: 13px; color: var(--rp-text-muted);">${escapeHtml(vacancy.location || "Ubicación por definir")}</span>
      </div>

      <form id="application-form" onsubmit="submitApplication(event)">
        <div class="profile-form-grid">
          <div>
            <label class="filter-field-label" for="application-name">Nombre completo</label>
            <input class="filter-input" id="application-name" name="name" required maxlength="100" autocomplete="name" value="${escapeHtml(candidate.name)}" />
          </div>
          <div>
            <label class="filter-field-label" for="application-email">Correo electrónico</label>
            <input class="filter-input" id="application-email" type="email" name="email" required readonly value="${escapeHtml(candidate.email)}" style="opacity: 0.75;" />
          </div>
          <div>
            <label class="filter-field-label" for="application-phone">Teléfono de contacto</label>
            <input class="filter-input" id="application-phone" type="tel" name="phone" required maxlength="30" autocomplete="tel" placeholder="Ej. +52 55 1234 5678" value="${escapeHtml(candidate.phone || "")}" />
          </div>
          <div>
            <label class="filter-field-label" for="application-location">Ciudad o ubicación</label>
            <input class="filter-input" id="application-location" name="location" required maxlength="100" autocomplete="address-level2" placeholder="Ej. Ciudad de México" value="${escapeHtml(candidate.location || "")}" />
          </div>
        </div>

        <div style="margin-bottom: 18px;">
          <label class="filter-field-label" for="application-resume">Hoja de vida o CV (PDF, DOC o DOCX)</label>
          <div class="doc-dropzone" onclick="document.getElementById('application-resume').click()" style="padding: 20px;">
            ${fileIcon}
            <span style="font-size: 13px; font-weight: 600; color: var(--rp-text);">Selecciona tu archivo de currículum</span>
            <small style="color: var(--rp-text-muted);">Formatos PDF, DOC o DOCX · Máximo 10 MB</small>
            <input id="application-resume" name="resume" type="file" required accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" style="display: none;" onchange="if (this.files[0]) document.getElementById('apply-cv-label').textContent = 'Archivo seleccionado: ' + this.files[0].name;" />
          </div>
          <div id="apply-cv-label" style="margin-top: 6px; font-size: 12.5px; font-weight: 600; color: var(--rp-primary); text-align: center;"></div>
        </div>

        <label class="consent-label" style="display: flex; gap: 10px; align-items: flex-start; margin-bottom: 18px; font-size: 12.5px; color: var(--rp-text-2);">
          <input id="application-consent" name="privacy_consent" type="checkbox" required style="margin-top: 3px;" />
          <span>Acepto que mi perfil y CV se compartan con el equipo de selección responsable para evaluar esta candidatura según el <a href="privacidad.html" target="_blank" rel="noopener" style="color: var(--rp-primary); font-weight: 600;">aviso de privacidad</a>.</span>
        </label>

        <div id="page-message" class="notice-box" role="status"></div>

        <div style="display: flex; justify-content: flex-end; gap: 10px; padding-top: 14px; border-top: 1px solid var(--rp-border);">
          <button type="button" class="rp-btn rp-btn--secondary" onclick="sessionStorage.removeItem('recruitpro_pending_application'); view('jobs')">
            Cancelar
          </button>
          <button class="rp-btn rp-btn--primary" type="submit">
            Enviar postulación
          </button>
        </div>
      </form>
    </div>
  `;
}



function renderCandidates(candidates) {
  if (!candidates.length) {
    return typeof window.ui !== "undefined" && window.ui.emptyState
      ? window.ui.emptyState({ iconName: "users", title: "Sin candidatos encontrados", text: "No hay postulantes que coincidan con los filtros de búsqueda actuales." })
      : '<p class="empty-state">No hay candidatos registrados.</p>';
  }

  const isAdmin = user.role === "administrador";

  return `
    <div class="rp-table-container">
      <table class="rp-table">
        <thead>
          <tr>
            <th>Candidato</th>
            <th>Ubicación</th>
            <th>Documentos</th>
            ${isAdmin ? "<th>Acciones</th>" : ""}
          </tr>
        </thead>
        <tbody>
          ${candidates
            .map((candidate) => {
              const avatar = typeof window.ui !== "undefined" && window.ui.avatar
                ? window.ui.avatar(candidate.name, 36)
                : getDynamicAvatar(candidate.name, 36);

              const documents = getDocuments(candidate);
              const docCount = documents.length;
              const docBadge = docCount
                ? `<span class="rp-badge rp-badge--primary">${docCount} archivo${docCount === 1 ? "" : "s"}</span>`
                : `<span class="rp-badge" style="opacity: 0.6;">Sin archivos</span>`;

              return `
                <tr>
                  <td>
                    <div class="table-user-cell">
                      ${avatar}
                      <div class="table-user-info">
                        <span class="table-user-name">${escapeHtml(candidate.name)}</span>
                        <span class="table-user-email">${escapeHtml(candidate.email)}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span style="font-size: 13px; color: var(--rp-text-2);">${escapeHtml(candidate.location || "No especificada")}</span>
                  </td>
                  <td>
                    <details class="candidate-documents">
                      <summary style="cursor: pointer; font-size: 13px; font-weight: 600; color: var(--rp-primary);">
                        ${docBadge}
                      </summary>
                      <div style="margin-top: 8px;">
                        ${docCount ? renderDocumentList(documents) : '<p class="empty-state" style="margin: 4px 0;">Sin documentos adjuntos</p>'}
                      </div>
                    </details>
                  </td>
                  ${
                    isAdmin
                      ? `
                        <td>
                          <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
                            <button
                              type="button"
                              class="rp-btn rp-btn--secondary rp-btn--sm"
                              onclick="openEditUserDialog('${encodeURIComponent(candidate.id)}')"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              class="rp-btn rp-btn--secondary rp-btn--sm"
                              onclick="promoteRecruiter('${encodeURIComponent(candidate.id)}')"
                            >
                              Habilitar reclutador
                            </button>
                            <button
                              type="button"
                              class="rp-btn rp-btn--danger rp-btn--sm"
                              onclick="deleteUserDirect('${encodeURIComponent(candidate.id)}', '${escapeHtml(candidate.name)}')"
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      `
                      : ""
                  }
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderRecruiters(recruiters) {
  if (!recruiters.length) {
    return typeof window.ui !== "undefined" && window.ui.emptyState
      ? window.ui.emptyState({ iconName: "shield-check", title: "Sin reclutadores", text: "No hay reclutadores dados de alta en el sistema." })
      : '<p class="empty-state">No hay reclutadores registrados.</p>';
  }

  return `
    <div class="rp-table-container">
      <table class="rp-table">
        <thead>
          <tr>
            <th>Reclutador</th>
            <th>Rol</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${recruiters
            .map((recruiter) => {
              const avatar = typeof window.ui !== "undefined" && window.ui.avatar
                ? window.ui.avatar(recruiter.name, 36)
                : getDynamicAvatar(recruiter.name, 36);

              return `
                <tr>
                  <td>
                    <div class="table-user-cell">
                      ${avatar}
                      <div class="table-user-info">
                        <span class="table-user-name">${escapeHtml(recruiter.name)}</span>
                        <span class="table-user-email">${escapeHtml(recruiter.email)}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span class="rp-badge rp-badge--primary">Reclutador</span>
                  </td>
                  <td>
                    <div style="display: flex; gap: 8px; align-items: center;">
                      <button
                        type="button"
                        class="rp-btn rp-btn--secondary rp-btn--sm"
                        onclick="openEditUserDialog('${encodeURIComponent(recruiter.id)}')"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        class="rp-btn rp-btn--danger rp-btn--sm"
                        onclick="deleteUserDirect('${encodeURIComponent(recruiter.id)}', '${escapeHtml(recruiter.name)}')"
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderVacancies(vacancies) {
  const canPublish = user.role === "reclutador" || user.role === "administrador";
  const canApply = user.role === "candidato";
  const recruiters = Array.isArray(usersCache) ? usersCache.filter((entry) => entry.role === "reclutador") : [];

  const vacancyList = vacancies.length
    ? `<div class="vacancies-list-v2 rp-stagger">${vacancies.map(renderVacancy).join("")}</div>`
    : (typeof window.ui !== "undefined" && window.ui.emptyState
        ? window.ui.emptyState({ iconName: "briefcase", title: "No hay vacantes publicadas", text: "Ajusta los filtros de búsqueda o publica una nueva vacante." })
        : '<div class="box empty-state">Todavía no hay vacantes publicadas.</div>');

  const plusIcon = typeof window.ui !== "undefined" && window.ui.icon ? window.ui.icon("plus-circle", "rp-icon-sm") : "";

  return `
    <div class="head">
      <small>CONVOCATORIAS</small>
      <h1>Vacantes Disponibles</h1>
      <p>
        ${
          user.role === "administrador"
            ? "Crea, asigna y gestiona las vacantes de contratación de la organización."
            : user.role === "reclutador"
            ? "Publica convocatorias y revisa las postulaciones recibidas."
            : "Explora las oportunidades laborales abiertas y postula con tu perfil."
        }
      </p>
    </div>

    ${renderVacancyFilters()}

    ${
      canPublish
        ? `
          <div class="profile-section-card" style="margin-bottom: 24px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
              <div>
                <h2 class="profile-section-title" style="display: flex; align-items: center; gap: 8px;">
                  ${plusIcon}
                  <span>Publicar nueva vacante</span>
                </h2>
                <p class="profile-section-sub">Añade los detalles para abrir una nueva convocatoria en la plataforma.</p>
              </div>
            </div>

            <form id="vacancy-form" onsubmit="publishVacancy(event)">
              <div class="profile-form-grid">
                <div>
                  <label class="filter-field-label" for="vacancy-title">Título del puesto</label>
                  <input class="filter-input" id="vacancy-title" name="title" required maxlength="100" placeholder="Ej. Senior Frontend Architect" />
                </div>
                <div>
                  <label class="filter-field-label" for="vacancy-type">Modalidad / Tipo</label>
                  <input class="filter-input" id="vacancy-type" name="type" required maxlength="60" placeholder="Ej. Tiempo Completo, Remoto" />
                </div>
                <div>
                  <label class="filter-field-label" for="vacancy-location">Ubicación</label>
                  <input class="filter-input" id="vacancy-location" name="location" maxlength="100" placeholder="Ej. Ciudad de México o Remoto" />
                </div>
                ${
                  user.role === "administrador"
                    ? `
                      <div>
                        <label class="filter-field-label" for="vacancy-recruiter">Reclutador responsable</label>
                        <select class="filter-input" id="vacancy-recruiter" name="recruiterEmail" required>
                          <option value="">Selecciona un reclutador</option>
                          ${recruiters.map((r) => `<option value="${escapeHtml(r.email)}">${escapeHtml(r.name)} (${escapeHtml(r.email)})</option>`).join("")}
                        </select>
                      </div>
                    `
                    : ""
                }
              </div>

              <div style="margin-bottom: 16px;">
                <label class="filter-field-label" for="vacancy-description">Descripción del rol y requisitos</label>
                <textarea class="filter-input" id="vacancy-description" name="description" required rows="4" maxlength="3000" placeholder="Describe responsabilidades clave, habilidades técnicas, stack y beneficios..."></textarea>
              </div>

              <div id="page-message" class="notice-box" role="status"></div>

              <div style="display: flex; justify-content: flex-end;">
                <button class="rp-btn rp-btn--primary" type="submit">
                  <span>Publicar vacante</span>
                </button>
              </div>
            </form>
          </div>
        `
        : ""
    }

    <div class="dash-section-header" style="margin-top: 10px;">
      <h2 class="dash-section-title">Oportunidades Publicadas</h2>
    </div>

    ${vacancyList}
  `;
}

function renderVacancy(vacancy) {
  const canApply = user.role === "candidato";
  const applications = Array.isArray(vacancy.applications) ? vacancy.applications : [];
  const applied = applications.some((application) => application.email === user.email);
  const canManage = vacancy.canManage === true;
  const canReviewApplications = canManage || (user.role === "reclutador" && applications.length > 0);
  const isClosed = vacancy.status === "closed";

  const mapPinIcon = typeof window.ui !== "undefined" && window.ui.icon ? window.ui.icon("map-pin", "rp-icon-sm") : "";
  const usersIcon = typeof window.ui !== "undefined" && window.ui.icon ? window.ui.icon("users", "rp-icon-sm") : "";

  return `
    <article class="vacancy-card-v2" id="vac-${escapeHtml(vacancy.id)}">
      <div class="vacancy-card-header-v2">
        <div class="vacancy-title-area">
          <div class="vacancy-badges-row">
            <span class="rp-badge rp-badge--primary">${escapeHtml(vacancy.type)}</span>
            ${isClosed ? '<span class="rp-badge rp-badge--danger">Cerrada</span>' : '<span class="rp-badge rp-badge--success">Activa</span>'}
            ${vacancy.location ? `<span class="rp-badge" style="gap: 4px;">${mapPinIcon} ${escapeHtml(vacancy.location)}</span>` : ""}
          </div>
          <h2 class="vacancy-card-title">${escapeHtml(vacancy.title)}</h2>
        </div>

        ${
          canReviewApplications
            ? `
              <div class="vacancy-actions-group">
                <button
                  type="button"
                  class="rp-btn rp-btn--secondary rp-btn--sm"
                  onclick="goToPipelineForVacancy('${encodeURIComponent(vacancy.id)}')"
                  title="Ver candidatos en Kanban"
                >
                  ${usersIcon}
                  <span>Pipeline (${applications.length})</span>
                </button>
                ${
                  canManage
                    ? `<button type="button" class="rp-btn rp-btn--ghost rp-btn--sm" onclick="openEditVacancyDialog('${encodeURIComponent(vacancy.id)}')">Editar</button>`
                    : ""
                }
                ${
                  user.role === "administrador"
                    ? `<button type="button" class="rp-btn rp-btn--ghost rp-btn--sm" style="color: var(--rp-danger);" onclick="deleteVacancy('${encodeURIComponent(vacancy.id)}', '${escapeHtml(vacancy.title)}')">Eliminar</button>`
                    : ""
                }
              </div>
            `
            : ""
        }
      </div>

      <p class="vacancy-card-desc">
        ${escapeHtml(vacancy.description).replace(/\n/g, "<br>")}
      </p>

      <div class="vacancy-card-footer-v2">
        <div class="vacancy-publisher-info">
          <span>Publicada por: <b>${escapeHtml(vacancy.recruiterName || "Administrador")}</b></span>
          ${vacancy.createdAt ? `<span>· ${new Date(vacancy.createdAt).toLocaleDateString("es")}</span>` : ""}
        </div>

        <div class="vacancy-actions-group">
          ${
            canApply && !isClosed
              ? applied
                ? `
                  <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                    <span class="rp-badge rp-badge--success">Ya te postulaste</span>
                    <button type="button" class="rp-btn rp-btn--secondary rp-btn--sm" onclick="openCandidateAiFit('${encodeURIComponent(vacancy.id)}')">
                      Análisis de Idoneidad IA
                    </button>
                  </div>
                `
                : `
                  <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                    <button type="button" class="rp-btn rp-btn--primary rp-btn--sm" onclick="applyToVacancy('${encodeURIComponent(vacancy.id)}')">
                      Postularme
                    </button>
                    <button type="button" class="rp-btn rp-btn--secondary rp-btn--sm" onclick="openCandidateAiFit('${encodeURIComponent(vacancy.id)}')">
                      Análisis de Idoneidad IA
                    </button>
                  </div>
                `
              : canApply && isClosed
              ? '<span class="rp-badge" style="opacity: 0.7;">Convocatoria finalizada</span>'
              : ""
          }
        </div>
      </div>
    </article>
  `;
}

function renderDocumentList(documents) {
  if (!documents.length) {
    return '<p class="empty-state" style="margin: 4px 0;">No hay documentos registrados.</p>';
  }

  const fileIcon = typeof window.ui !== "undefined" && window.ui.icon ? window.ui.icon("file-text", "rp-icon-sm") : "";

  return `
    <ul class="document-list" style="display: flex; flex-direction: column; gap: 8px; list-style: none; padding: 0; margin: 0;">
      ${documents
        .map((document) => {
          const name = escapeHtml(documentName(document));
          const savedFile = typeof document === "object" && document.id;

          return `
            <li style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: var(--rp-surface-2); border: 1px solid var(--rp-border); border-radius: var(--rp-radius-md); gap: 10px;">
              <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
                ${fileIcon}
                <span class="document-name" style="font-size: 13px; font-weight: 600; color: var(--rp-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                  ${name}
                </span>
              </div>
              ${
                savedFile
                  ? `<button type="button" class="rp-btn rp-btn--secondary rp-btn--sm" onclick="viewDocument('${encodeURIComponent(document.id)}')">Ver archivo</button>`
                  : '<span class="document-legacy" style="font-size: 11px; color: var(--rp-text-muted);">Sin archivo físico</span>'
              }
            </li>
          `;
        })
        .join("")}
    </ul>
  `;
}


function renderApplicants(applications) {
  if (!applications.length) {
    return '<p class="empty-state">Esta vacante todavía no tiene postulaciones.</p>';
  }

  return `<ul class="applicant-list">${applications
    .map((application) => {
      const details = [
        application.phone && `Teléfono: ${application.phone}`,
        application.location && `Ubicación: ${application.location}`,
        application.resumeName && `CV: ${application.resumeName}`,
      ]
        .filter(Boolean)
        .map(escapeHtml)
        .join(" · ");

      const history = (application.activities || [])
        .map((activity) => {
          const eventText = activity.type === "status"
            ? `Etapa: ${statusLabel(activity.fromStatus || "")} → ${statusLabel(activity.toStatus || "")}`
            : activity.type === "assignment"
              ? "Cambio de responsable"
              : "Nota interna";
          return `<li><b>${escapeHtml(eventText)}</b> · ${escapeHtml(activity.author)} · ${new Date(activity.createdAt).toLocaleString("es")}${activity.note ? `<p>${escapeHtml(activity.note)}</p>` : ""}</li>`;
        })
        .join("");
      const recruiterOptions = usersCache
        .map((recruiter) => `<option value="${escapeHtml(recruiter.id)}" ${application.assignedRecruiterId === recruiter.id ? "selected" : ""}>${escapeHtml(recruiter.name)}</option>`)
        .join("");

      return `<li class="application-card"><div class="applicant-heading"><span><b>${escapeHtml(application.name)}</b> · ${escapeHtml(application.email)} ${application.aiScore ? `<span class="kanban-ai-pill ${application.aiScore >= 80 ? "score-high" : application.aiScore >= 60 ? "score-med" : "score-low"}">Match IA: ${application.aiScore}%</span>` : ""} <small class="applicant-details">${details}</small></span><button class="document-button" onclick=\"viewDocument('${encodeURIComponent(application.resumeId)}', '${encodeURIComponent(application.id)}')\">Ver CV</button></div><div class="application-controls"><label>Etapa<select id="stage-${escapeHtml(application.id)}">${["recibida", "en_revision", "entrevista", "oferta", "rechazada"].map((stage) => `<option value="${stage}" ${application.status === stage ? "selected" : ""}>${statusLabel(stage)}</option>`).join("")}</select></label><label>Responsable<select id="assignee-${escapeHtml(application.id)}"><option value="">Sin asignar</option>${recruiterOptions}</select></label><label class="note-field">Nota interna<textarea id="note-${escapeHtml(application.id)}" maxlength="2000" rows="2" placeholder="Añade contexto o próximos pasos"></textarea></label><button class="primary small" onclick="saveApplicationUpdate('${encodeURIComponent(application.id)}')">Guardar seguimiento</button></div><details class="application-history"><summary>Historial y notas (${(application.activities || []).length})</summary><ul>${history || "<li>Sin actividad registrada.</li>"}</ul></details></li>`;
    })
    .join("")}</ul>`;
}

async function saveApplicationUpdate(encodedId) {
  const id = decodeURIComponent(encodedId);
  const statusValue = document.getElementById(`stage-${id}`).value;
  const assignedRecruiterId = document.getElementById(`assignee-${id}`).value || null;
  const note = document.getElementById(`note-${id}`).value.trim();
  try {
    const response = await apiRequest(`/api/applications/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: { status: statusValue, assigned_recruiter_id: assignedRecruiterId, note },
    });
    const result = await response.json();
    await view("jobs");
    if (!result.statusChanged) {
      showMessage("Se guardó el seguimiento.");
    } else {
      showMessage(
        result.emailSent
          ? "Se guardó el seguimiento y se notificó al candidato."
          : "Se guardó el seguimiento, pero no se pudo enviar el correo.",
        !result.emailSent,
      );
    }
  } catch (error) {
    console.error("No se pudo actualizar la postulación:", error);
    showMessage(error.message, true);
  }
}

function showMessage(message, isError = false) {
  const messageBox = document.getElementById("page-message");
  if (!messageBox) return;

  messageBox.textContent = message;
  messageBox.classList.toggle("is-error", isError);
}

async function addDoc() {
  const input = document.getElementById("file");
  const file = input.files[0];

  if (!file) {
    showMessage("Selecciona un archivo antes de subirlo.", true);
    return;
  }

  try {
    const body = new FormData();
    body.append("file", file);
    const response = await apiRequest("/api/documents", { method: "POST", body });
    user.documents.push(await response.json());
    await view("docs");
  } catch (error) {
    console.error("No se pudo subir el documento:", error);
    showMessage(error.message, true);
  }
}

async function saveOwnProfile(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const formData = new FormData(form);
  const message = document.getElementById("profile-message");
  try {
    user = await (await apiRequest("/api/auth/profile", {
      method: "PATCH",
      body: {
        name: String(formData.get("name")).trim(),
        phone: String(formData.get("phone")).trim(),
        location: String(formData.get("location")).trim(),
      },
    })).json();
    document.getElementById("user").textContent = user.name;
    message.textContent = "Perfil actualizado.";
    message.classList.remove("is-error");
  } catch (error) {
    message.textContent = error.message;
    message.classList.add("is-error");
  }
}

async function changeOwnPassword(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const formData = new FormData(form);
  const message = document.getElementById("password-message");
  try {
    const result = await (await apiRequest("/api/auth/password", {
      method: "POST",
      body: {
        current_password: String(formData.get("current_password")),
        new_password: String(formData.get("new_password")),
      },
    })).json();
    form.reset();
    message.textContent = result.message;
    message.classList.remove("is-error");
  } catch (error) {
    message.textContent = error.message;
    message.classList.add("is-error");
  }
}

async function deleteOwnAccount() {
  const password = document.getElementById("delete-account-password").value;
  const message = document.getElementById("delete-account-message");
  if (!password) {
    message.textContent = "Escribe tu contraseña para confirmar la eliminación.";
    message.classList.add("is-error");
    return;
  }
  if (!confirm("Se eliminarán de forma permanente tu cuenta, postulaciones y documentos. ¿Continuar?")) return;
  try {
    await apiRequest("/api/auth/account", {
      method: "DELETE",
      body: { current_password: password },
    });
    location.href = "index.html";
  } catch (error) {
    message.textContent = error.message;
    message.classList.add("is-error");
  }
}

let currentEvaluatingApp = null;
let currentCandidateRating = 0;
let currentSelectedSplitStage = "";

async function viewDocument(encodedId, optionalAppId = null) {
  const id = decodeURIComponent(encodedId || "");
  const appId = optionalAppId ? decodeURIComponent(optionalAppId) : null;

  const dialog = document.getElementById("document-preview");
  const frame = document.getElementById("document-frame");
  const download = document.getElementById("document-download");
  const subtitle = document.getElementById("preview-subtitle");
  const splitPane = document.getElementById("split-evaluation-pane");
  const splitBody = document.querySelector(".split-preview-body");

  if (!dialog) return;

  // 1. Localizar la postulación del candidato en caché
  currentEvaluatingApp = null;
  let app = null;

  if (user && user.role !== "candidato") {
    if (appId) {
      app = (pipelineApplicationsCache || []).find((a) => a.id === appId);
    }
    if (!app && id) {
      app = (pipelineApplicationsCache || []).find((a) => a.resumeId === id);
    }
    if (!app && vacanciesCache) {
      for (const v of vacanciesCache) {
        if (v.applications) {
          const found = v.applications.find((a) => (id && a.resumeId === id) || (appId && a.id === appId));
          if (found) {
            app = { ...found, vacancyTitle: v.title, vacancyId: v.id };
            break;
          }
        }
      }
    }
  }

  // 2. Configurar el panel de evaluación
  if (app) {
    currentEvaluatingApp = app;
    dialog.dataset.appId = app.id;
    if (splitPane) splitPane.style.display = "flex";
    if (splitBody) splitBody.classList.remove("no-eval");
    if (subtitle) subtitle.textContent = `Expediente: ${app.name || "Candidato"} · ${app.vacancyTitle || "Vacante"}`;
    setupSplitEvaluationPanel(app);
  } else {
    if (splitPane) splitPane.style.display = "none";
    if (splitBody) splitBody.classList.add("no-eval");
    if (subtitle) subtitle.textContent = "Visualizador de Currículum";
  }

  // 3. Abrir el modal de inmediato para dar respuesta instantánea al usuario
  dialog.showModal();

  // 4. Cargar el documento PDF de forma asíncrona
  if (id && id !== "null" && id !== "undefined") {
    try {
      const response = await apiRequest(`/api/documents/${encodeURIComponent(id)}`);
      const blob = await response.blob();
      const filename = decodeURIComponent(response.headers.get("X-Document-Name") || "curriculum.pdf");

      const oldUrl = dialog.dataset.objectUrl;
      if (oldUrl) URL.revokeObjectURL(oldUrl);

      // Forzar tipo application/pdf para asegurar visor nativo en iframe
      const pdfBlob = new Blob([blob], { type: "application/pdf" });
      const url = URL.createObjectURL(pdfBlob);
      dialog.dataset.objectUrl = url;

      if (frame) {
        frame.src = url;
        frame.title = `Vista previa de ${filename}`;
      }
      if (download) {
        download.href = url;
        download.download = filename;
        download.textContent = `Descargar ${filename}`;
        download.style.display = "inline-flex";
      }
    } catch (docErr) {
      console.warn("No se pudo cargar el archivo PDF original:", docErr);
      if (frame) {
        frame.srcdoc = `
          <html><body style="font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc; color: #334155; text-align: center; padding: 24px; box-sizing: border-box;">
            <div style="background: white; padding: 32px; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.05); max-width: 420px;">
              <div style="margin-bottom: 14px;"><svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto; display: block;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg></div>
              <h3 style="margin: 0 0 8px 0; color: #0f172a; font-size: 18px;">Documento Curricular Registrado</h3>
              <p style="margin: 0 0 16px 0; font-size: 14px; color: #64748b; line-height: 1.5;">El postulante adjuntó su CV al registrar la postulación.</p>
              <div style="background: #f1f5f9; padding: 10px 14px; border-radius: 8px; font-size: 12px; font-family: monospace; color: #334155; margin-bottom: 16px; word-break: break-all;">ID Documento: ${escapeHtml(id)}</div>
              <p style="font-size: 13px; color: #475569; margin: 0;">Puedes calificar con estrellas, dejar notas y evaluar el perfil en el panel lateral.</p>
            </div>
          </body></html>
        `;
      }
      if (download) download.style.display = "none";
    }
  } else {
    if (frame) {
      frame.srcdoc = `
        <html><body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc; color: #475569; text-align: center; padding: 20px;">
          <div>
            <div style="margin-bottom: 14px;"><svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto; display: block;"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg></div>
            <h3 style="margin: 0 0 8px 0; color: #1e293b;">Postulación sin documento adjunto</h3>
            <p style="font-size: 13px; color: #64748b;">El candidato no adjuntó archivo o fue registrado manualmente.</p>
          </div>
        </body></html>
      `;
    }
    if (download) download.style.display = "none";
  }
}

function setupSplitEvaluationPanel(app) {
  document.getElementById("eval-candidate-name").textContent = app.name || "Candidato";
  document.getElementById("eval-candidate-vacancy").textContent = "" + (app.vacancyTitle || "Vacante");

  const avatar = document.getElementById("eval-candidate-avatar");
  if (avatar) {
    avatar.textContent = (app.name || "CD")
      .split(/\s+/)
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }

  const detailsEl = document.getElementById("eval-candidate-details");
  if (detailsEl) {
    const details = [
      app.email && `Correo: ${escapeHtml(app.email)}`,
      app.phone && `Teléfono: ${escapeHtml(app.phone)}`,
      app.location && `Ubicación: ${escapeHtml(app.location)}`,
    ]
      .filter(Boolean)
      .join("<br>");
    detailsEl.innerHTML = details;
  }

  // Setup stages
  currentSelectedSplitStage = app.status;
  updateSplitStageButtons();

  // Setup recruiter dropdown
  const assigneeSelect = document.getElementById("eval-assignee-select");
  if (assigneeSelect) {
    const options = (usersCache || [])
      .map(
        (r) =>
          `<option value="${escapeHtml(r.id)}" ${app.assignedRecruiterId === r.id ? "selected" : ""}>${escapeHtml(r.name)}</option>`
      )
      .join("");
    assigneeSelect.innerHTML = `<option value="">Sin asignar</option>${options}`;
  }

  // Detect star rating from previous notes if present
  let detectedRating = 0;
  if (app.activities) {
    for (const act of app.activities) {
      if (act.note && (act.note.includes("Calificación") || act.note.includes("estrella"))) {
        const match = act.note.match(/(\d)\/5/);
        if (match) {
          detectedRating = parseInt(match[1], 10);
          break;
        }
      }
    }
  }
  setCandidateRating(detectedRating);

  // Clear note input and messages
  document.getElementById("eval-note-text").value = "";
  const aiLoading = document.getElementById("ai-loading");
  const aiResults = document.getElementById("ai-results");
  const runAiBtn = document.getElementById("run-ai-btn");
  if (aiLoading) aiLoading.style.display = "none";
  if (runAiBtn) runAiBtn.disabled = false;
  currentAiAnalysis = null;

  // Visualizar de inmediato dictamen y score si el candidato ya fue evaluado
  if (app.aiScore !== null && app.aiScore !== undefined) {
    const score = app.aiScore;
    const stars = score >= 85 ? 5 : score >= 70 ? 4 : score >= 55 ? 3 : 2;
    const stage = score >= 70 ? "entrevista" : score >= 55 ? "en_revision" : "rechazada";
    currentAiAnalysis = {
      matchScore: score,
      stars: stars,
      verdict: app.aiVerdict || (score >= 80 ? "Recomendación Favorable" : "Perfil en Evaluación"),
      suggestedStage: stage,
      summary: app.aiSummary || `Afinidad técnica del ${score}% frente a los requerimientos de la vacante.`,
      matchedSkills: [],
      missingSkills: [],
      interviewQuestions: [
        "Detalle su experiencia práctica en las tecnologías solicitadas por el puesto.",
        "¿Cómo asegura la calidad, pruebas y entrega oportuna en sus proyectos?",
        "Describa cómo colabora en equipo y prioriza requerimientos de alta exigencia."
      ],
    };
    if (!detectedRating) {
      setCandidateRating(stars);
    }

    const scorePill = document.getElementById("ai-score-pill");
    const verdictLabel = document.getElementById("ai-verdict-label");
    const progressFill = document.getElementById("ai-progress-fill");
    const summaryEl = document.getElementById("ai-summary");
    
    if (verdictLabel) verdictLabel.textContent = app.aiVerdict || "Evaluación Técnica Preliminar";
    if (scorePill) {
      scorePill.textContent = `${app.aiScore}% Compatibilidad`;
      scorePill.className = "ai-score-pill " + (app.aiScore >= 80 ? "score-high" : app.aiScore >= 60 ? "score-med" : "score-low");
    }
    if (progressFill) progressFill.style.width = `${app.aiScore}%`;
    if (summaryEl) summaryEl.textContent = app.aiSummary || `Afinidad técnica del ${app.aiScore}% frente a los requerimientos de la vacante.`;
    
    if (aiResults) aiResults.style.display = "block";
    if (runAiBtn) runAiBtn.textContent = "Volver a Analizar";

    // Si faltan etiquetas detalladas de competencias, ejecutar análisis en segundo plano sin ocultar los datos
    if (app.id) {
      runAiScreening(true);
    }
  } else {
    if (aiResults) aiResults.style.display = "none";
    if (runAiBtn) runAiBtn.textContent = "Ejecutar Análisis";
    if (app.id) {
      runAiScreening(false);
    }
  }
  const msgEl = document.getElementById("eval-status-message");
  if (msgEl) {
    msgEl.textContent = "";
    msgEl.classList.remove("show", "is-error");
  }

  // Render previous history
  renderSplitHistory(app.activities || []);
}

function updateSplitStageButtons() {
  const container = document.getElementById("eval-stages-group");
  if (!container) return;
  container.querySelectorAll(".eval-stage-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.stage === currentSelectedSplitStage);
  });
}

function setSplitStage(stage) {
  currentSelectedSplitStage = stage;
  updateSplitStageButtons();
}

function setCandidateRating(val) {
  currentCandidateRating = val;
  const starsContainer = document.getElementById("eval-stars");
  if (starsContainer) {
    starsContainer.querySelectorAll(".star-btn").forEach((btn) => {
      const btnVal = parseInt(btn.dataset.value, 10);
      if (btnVal <= val) {
        btn.classList.add("active");
        btn.style.color = "#f59e0b";
      } else {
        btn.classList.remove("active");
        btn.style.color = "#cbd5e1";
      }
    });
  }

  const labelEl = document.getElementById("eval-rating-text");
  if (labelEl) {
    const labels = {
      0: "Sin calificar",
      1: "1/5 - No recomendado",
      2: "2/5 - No encaja",
      3: "3/5 - Cumplimiento básico",
      4: "4/5 - Favorable / Competitivo",
      5: "5/5 - Sobresaliente / Recomendado",
    };
    labelEl.textContent = labels[val] || "Sin calificar";
    labelEl.style.color = val >= 4 ? "#047857" : val === 3 ? "#b45309" : "#64748b";
  }
}

function renderSplitHistory(activities) {
  const historyList = document.getElementById("eval-history-list");
  if (!historyList) return;

  if (!activities || !activities.length) {
    historyList.innerHTML = '<li style="color: var(--muted); font-size: 12px;">Sin evaluaciones ni notas previas.</li>';
    return;
  }

  historyList.innerHTML = activities
    .map((act) => {
      const title =
        act.type === "status"
          ? `Etapa: ${statusLabel(act.fromStatus || "")} → ${statusLabel(act.toStatus || "")}`
          : act.type === "assignment"
          ? "Cambio de responsable"
          : "Nota de evaluación";
      return `
        <li>
          <b>${escapeHtml(title)}</b> · <small>${escapeHtml(act.author)} · ${new Date(act.createdAt).toLocaleString("es")}</small>
          ${act.note ? `<p style="margin: 6px 0 0 0; font-size: 13px;">${escapeHtml(act.note)}</p>` : ""}
        </li>
      `;
    })
    .join("");
}

async function saveSplitEvaluation() {
  if (!currentEvaluatingApp) return;

  const stage = currentSelectedSplitStage;
  const assigneeId = document.getElementById("eval-assignee-select").value || null;
  const rawNote = document.getElementById("eval-note-text").value.trim();
  const msgEl = document.getElementById("eval-status-message");

  let fullNote = rawNote;
  if (currentCandidateRating > 0) {
    const starStr = "".repeat(currentCandidateRating);
    const ratingPrefix = `[Calificación: ${currentCandidateRating}/5 estrellas]`;
    fullNote = rawNote ? `${ratingPrefix} ${rawNote}` : ratingPrefix;
  }

  try {
    const response = await apiRequest(`/api/applications/${encodeURIComponent(currentEvaluatingApp.id)}`, {
      method: "PATCH",
      body: {
        status: stage,
        assigned_recruiter_id: assigneeId,
        note: fullNote || null,
      },
    });

    const result = await response.json();

    // Update in-memory cache
    currentEvaluatingApp.status = stage;
    currentEvaluatingApp.assignedRecruiterId = assigneeId;
    if (stage === "rechazada") {
      currentEvaluatingApp.rejectedAt = new Date().toISOString();
      currentEvaluatingApp._minutesLeft = 30;
    }

    if (fullNote) {
      currentEvaluatingApp.activities = currentEvaluatingApp.activities || [];
      currentEvaluatingApp.activities.unshift({
        id: String(Date.now()),
        type: "note",
        author: user.name,
        note: fullNote,
        createdAt: new Date().toISOString(),
      });
      renderSplitHistory(currentEvaluatingApp.activities);
      document.getElementById("eval-note-text").value = "";
    }

    if (msgEl) {
      msgEl.textContent = "Evaluación guardada con éxito.";
      msgEl.classList.remove("is-error");
      msgEl.classList.add("show");
      setTimeout(() => msgEl.classList.remove("show"), 3000);
    }

    showKanbanToast(`Evaluación técnica registrada para ${escapeHtml(currentEvaluatingApp.name)}`);

    // Update Kanban board if visible
    const container = document.getElementById("kanban-board-container");
    if (container) container.innerHTML = renderPipelineBoardOnly();
  } catch (error) {
    console.error("Error al guardar evaluación:", error);
    if (msgEl) {
      msgEl.textContent = error.message || "No se pudo guardar la evaluación.";
      msgEl.classList.add("is-error", "show");
    }
  }
}

function closeDocumentPreview() {
  const dialog = document.getElementById("document-preview");
  if (dialog) {
    dialog.close();
    const oldUrl = dialog.dataset.objectUrl;
    if (oldUrl) {
      URL.revokeObjectURL(oldUrl);
      delete dialog.dataset.objectUrl;
    }
    const frame = document.getElementById("document-frame");
    if (frame) frame.src = "about:blank";
  }
  currentEvaluatingApp = null;
  currentAiAnalysis = null;
}

function openEditUserDialog(encodedId) {
  if (user.role !== "administrador") return;

  const id = decodeURIComponent(encodedId);
  const account = usersCache.find(
    (entry) => entry.id === id && ["candidato", "reclutador"].includes(entry.role),
  );

  if (!account) {
    showMessage("No se encontró el perfil que deseas editar.", true);
    return;
  }

  document.getElementById("edit-user-id").value = account.id;
  document.getElementById("edit-user-name").value = account.name;
  document.getElementById("edit-user-email").value = account.email;
  document.getElementById("edit-user-message").textContent = "";
  document.getElementById("edit-user-message").classList.remove("is-error");
  document.getElementById("edit-user-dialog").showModal();
}

function closeEditUserDialog() {
  document.getElementById("edit-user-dialog").close();
}

async function saveUserEdit(event) {
  event.preventDefault();
  if (user.role !== "administrador") return;

  const form = document.getElementById("edit-user-form");
  if (!form.reportValidity()) return;

  const id = document.getElementById("edit-user-id").value;
  const name = document.getElementById("edit-user-name").value.trim();
  const email = document.getElementById("edit-user-email").value.trim().toLowerCase();
  const message = document.getElementById("edit-user-message");

  try {
    await apiRequest(`/api/users/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: { name, email },
    });
    closeEditUserDialog();
    const currentPage = nav.querySelector("button.active")?.dataset.page || "home";
    await view(currentPage);
  } catch (error) {
    console.error("No se pudo actualizar el perfil:", error);
    message.textContent = error.message;
    message.classList.add("is-error");
  }
}

async function promoteRecruiter(encodedId) {
  const id = decodeURIComponent(encodedId);
  try {
    await apiRequest(`/api/users/${encodeURIComponent(id)}/promote-recruiter`, {
      method: "POST",
    });
    await view("candidates");
  } catch (error) {
    console.error("No se pudo habilitar al reclutador:", error);
    showMessage(error.message, true);
  }
}

document
  .getElementById("document-preview")
  .addEventListener("close", () => {
    const dialog = document.getElementById("document-preview");
    const url = dialog.dataset.objectUrl;

    if (url) URL.revokeObjectURL(url);
    delete dialog.dataset.objectUrl;
    document.getElementById("document-frame").removeAttribute("src");
  });

function openEditVacancyDialog(encodedId) {
  const id = decodeURIComponent(encodedId);
  const vacancy = vacanciesCache.find((entry) => entry.id === id);
  const canManage =
    user.role === "administrador" ||
    (user.role === "reclutador" && vacancy?.recruiterEmail === user.email);

  if (!vacancy || !canManage) {
    showMessage("No tienes permiso para editar esta vacante.", true);
    return;
  }

  const recruiters = usersCache.filter((entry) => entry.role === "reclutador");
  const recruiterSelect = document.getElementById("edit-vacancy-recruiter");
  recruiterSelect.innerHTML = `<option value="">Sin asignar (administrador)</option>${recruiters
    .map(
      (recruiter) =>
        `<option value="${escapeHtml(recruiter.id)}">${escapeHtml(recruiter.name)} · ${escapeHtml(recruiter.email)}</option>`,
    )
    .join("")}`;
  recruiterSelect.value = vacancy.recruiterId || "";
  recruiterSelect.closest("div").classList.toggle("hidden", user.role !== "administrador");

  document.getElementById("edit-vacancy-id").value = vacancy.id;
  document.getElementById("edit-vacancy-title").value = vacancy.title || "";
  document.getElementById("edit-vacancy-type").value = vacancy.type || "";
  document.getElementById("edit-vacancy-location").value = vacancy.location || "";
  document.getElementById("edit-vacancy-status").value =
    vacancy.status === "closed" ? "closed" : "active";
  document.getElementById("edit-vacancy-description").value =
    vacancy.description || "";
  document.getElementById("edit-vacancy-message").textContent = "";
  document.getElementById("edit-vacancy-message").classList.remove("is-error");
  document.getElementById("edit-vacancy-dialog").showModal();
}

function closeEditVacancyDialog() {
  document.getElementById("edit-vacancy-dialog").close();
}

async function saveVacancyEdit(event) {
  event.preventDefault();
  const form = document.getElementById("edit-vacancy-form");
  if (!form.reportValidity()) return;

  const id = document.getElementById("edit-vacancy-id").value;
  const message = document.getElementById("edit-vacancy-message");
  const vacancy = vacanciesCache.find((entry) => entry.id === id);
  const canManage =
    user.role === "administrador" ||
    (user.role === "reclutador" && vacancy?.recruiterEmail === user.email);

  if (!vacancy || !canManage) {
    message.textContent = "No tienes permiso para editar esta vacante.";
    message.classList.add("is-error");
    return;
  }

  const formData = new FormData(form);
  const title = String(formData.get("title")).trim();
  const type = String(formData.get("type")).trim();
  const description = String(formData.get("description")).trim();
  if (!title || !type || !description) {
    message.textContent = "Completa el título, tipo y descripción de la vacante.";
    message.classList.add("is-error");
    return;
  }

  try {
    await apiRequest(`/api/vacancies/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: {
        title,
        type,
        location: String(formData.get("location")).trim(),
        description,
        status: String(formData.get("status")),
        recruiter_id: String(formData.get("recruiterEmail") || "") || null,
      },
    });
    closeEditVacancyDialog();
    await view("jobs");
  } catch (error) {
    console.error("No se pudo actualizar la vacante:", error);
    message.textContent = error.message;
    message.classList.add("is-error");
  }
}

async function publishVacancy(event) {
  event.preventDefault();

  if (!["reclutador", "administrador"].includes(user.role)) return;
  const form = document.getElementById("vacancy-form");
  if (!form.reportValidity()) return;

  const formData = new FormData(form);
  try {
    await apiRequest("/api/vacancies", {
      method: "POST",
      body: {
        title: String(formData.get("title")).trim(),
        type: String(formData.get("type")).trim(),
        location: String(formData.get("location")).trim(),
        description: String(formData.get("description")).trim(),
        recruiter_id: String(formData.get("recruiterEmail") || "") || null,
      },
    });
    await view("jobs");
  } catch (error) {
    console.error("No se pudo publicar la vacante:", error);
    showMessage(error.message, true);
  }
}

async function applyToVacancy(encodedId) {
  const id = decodeURIComponent(encodedId);
  await view("apply", id);
}

async function submitApplication(event) {
  event.preventDefault();
  if (user.role !== "candidato") return;

  const form = document.getElementById("application-form");
  if (!form.reportValidity()) return;

  const message = document.getElementById("page-message");
  const pendingId = sessionStorage.getItem("recruitpro_pending_application");
  if (!pendingId) {
    showMessage("No se encontró la vacante. Regresa a la lista e inténtalo de nuevo.", true);
    return;
  }
  try {
    const response = await apiRequest(
      `/api/vacancies/${encodeURIComponent(pendingId)}/applications`,
      { method: "POST", body: new FormData(form) },
    );
    const result = await response.json();
    const vacancy = vacanciesCache.find((entry) => entry.id === pendingId);
    sessionStorage.removeItem("recruitpro_pending_application");
    sessionStorage.setItem(
      "recruitpro_application_success",
      `Tu postulación para ${vacancy?.title || "la vacante"} fue enviada correctamente.${result.emailSent ? " Te enviamos una confirmación por correo." : " No fue posible enviar el correo de confirmación."}`,
    );
    await view("jobs");
  } catch (error) {
    console.error("No se pudo enviar la postulación:", error);
    message.textContent = error.message;
    message.classList.add("is-error");
  }
}

async function logout() {
  try {
    await apiRequest("/api/auth/logout", { method: "POST" });
    sessionStorage.clear();
    location.href = "index.html";
  } catch (error) {
    console.error("No se pudo cerrar sesión:", error);
    showMessage(error.message, true);
  }
}


/* ==========================================================================
   FASE 4: KANBAN PIPELINE FUNCTIONS (SortableJS, Cards v2, Undo, Confetti)
   ========================================================================== */

let showArchivedRechazadas = false;

function toggleArchivedRechazadas() {
  showArchivedRechazadas = !showArchivedRechazadas;
  refreshPipelineBoard();
}

function renderPipelineView() {
  const vacancyOptions = vacanciesCache
    .map(
      (v) =>
        `<option value="${escapeHtml(v.id)}" ${currentPipelineVacancyId === v.id ? "selected" : ""}>${escapeHtml(v.title)} (${(v.applications || []).length} postulantes)</option>`
    )
    .join("");

  const searchIcon = typeof window.ui !== "undefined" && window.ui.icon
    ? window.ui.icon("search", "rp-icon-sm")
    : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>';

  const chevronLeft = typeof window.ui !== "undefined" && window.ui.icon
    ? window.ui.icon("chevron-left", "rp-icon-sm")
    : "‹";

  const chevronRight = typeof window.ui !== "undefined" && window.ui.icon
    ? window.ui.icon("chevron-right", "rp-icon-sm")
    : "›";

  const stages = [
    { key: "recibida", title: "Recibidas" },
    { key: "en_revision", title: "En revisión" },
    { key: "entrevista", title: "Entrevista" },
    { key: "oferta", title: "Oferta" },
    { key: "rechazada", title: "Rechazada" },
  ];

  const mobileTabsHtml = `
    <div class="kanban-mobile-tabs" role="tablist" aria-label="Etapas del proceso">
      ${stages
        .map(
          (st) => `
        <button
          type="button"
          role="tab"
          aria-selected="${mobileActiveStageKey === st.key ? "true" : "false"}"
          class="kanban-mobile-tab-btn ${mobileActiveStageKey === st.key ? "active" : ""}"
          onclick="setMobileActiveStage('${st.key}')"
          id="tab-${st.key}"
        >
          <span>${escapeHtml(st.title)}</span>
        </button>
      `
        )
        .join("")}
    </div>
  `;

  setTimeout(() => {
    initKanbanSortables();
    if (typeof window.ui !== "undefined" && window.ui.refreshIcons) {
      window.ui.refreshIcons();
    }
  }, 20);

  return `
    <div class="head">
      <small>PROCESO DE SELECCIÓN</small>
      <h1>Pipeline Interactivo</h1>
      <p>Arrastra candidatos entre columnas para sincronizar su avance, notas y estado en tiempo real.</p>
    </div>

    <div class="kanban-wrapper">
      <div class="kanban-controls-bar">
        <div class="kanban-controls-left">
          <div class="kanban-search-box">
            ${searchIcon}
            <input
              type="text"
              class="kanban-search-input"
              id="pipeline-search"
              placeholder="Buscar por nombre, correo, vacante o ciudad..."
              value="${escapeHtml(pipelineSearchQuery)}"
              oninput="filterPipelineCards(this.value)"
              aria-label="Buscar candidatos en el tablero"
            />
          </div>

          <select
            id="pipeline-vacancy-select"
            class="kanban-vacancy-select"
            onchange="changePipelineVacancy(this.value)"
            aria-label="Filtrar por vacante"
          >
            <option value="">Todas las vacantes</option>
            ${vacancyOptions}
          </select>
        </div>

        <div class="kanban-controls-right">
          <div class="kanban-stats-badge" id="pipeline-total-stats">
            <span>Candidatos:</span>
            <b id="pipeline-stats-num">${pipelineApplicationsCache.length}</b>
          </div>

          <button
            type="button"
            class="kanban-scroll-btn"
            onclick="scrollKanban('left')"
            title="Desplazar hacia la izquierda"
            aria-label="Desplazar tablero a la izquierda"
          >
            ${chevronLeft}
          </button>
          <button
            type="button"
            class="kanban-scroll-btn"
            onclick="scrollKanban('right')"
            title="Desplazar hacia la derecha"
            aria-label="Desplazar tablero a la derecha"
          >
            ${chevronRight}
          </button>
        </div>
      </div>

      ${mobileTabsHtml}

      <div class="kanban-board-container-outer">
        <div id="kanban-board-container">
          ${renderPipelineBoardOnly()}
        </div>
      </div>
    </div>
  `;
}

function renderPipelineBoardOnly() {
  const stages = [
    { key: "recibida", title: "Recibidas" },
    { key: "en_revision", title: "En revisión" },
    { key: "entrevista", title: "Entrevista" },
    { key: "oferta", title: "Oferta" },
    { key: "rechazada", title: "Rechazada" },
  ];

  const q = pipelineSearchQuery.trim().toLowerCase();
  const filteredApps = q
    ? pipelineApplicationsCache.filter(
        (app) =>
          (app.name && app.name.toLowerCase().includes(q)) ||
          (app.email && app.email.toLowerCase().includes(q)) ||
          (app.location && app.location.toLowerCase().includes(q)) ||
          (app.vacancyTitle && app.vacancyTitle.toLowerCase().includes(q))
      )
    : pipelineApplicationsCache;

  setTimeout(() => {
    initKanbanSortables();
    if (typeof window.ui !== "undefined" && window.ui.refreshIcons) {
      window.ui.refreshIcons();
    }
  }, 0);

  return `
    <div class="kanban-board" id="kanban-main-board">
      ${stages.map((stage) => renderKanbanColumn(stage.key, stage.title, filteredApps)).join("")}
    </div>
  `;
}

function renderKanbanColumn(stageKey, stageTitle, applications) {
  let columnApps = applications.filter((app) => app.status === stageKey);
  let archivedCount = 0;

  // Auto-archivo de rechazadas tras 30 minutos
  if (stageKey === "rechazada") {
    const now = Date.now();
    const THIRTY_MINUTES_MS = 30 * 60 * 1000;

    const activeApps = [];
    const archivedApps = [];

    columnApps.forEach((app) => {
      let rejectedTime = null;
      if (app.rejectedAt) {
        rejectedTime = new Date(app.rejectedAt).getTime();
      } else if (Array.isArray(app.activities)) {
        const act = [...app.activities].reverse().find((a) => a.toStatus === "rechazada");
        if (act && act.createdAt) rejectedTime = new Date(act.createdAt).getTime();
      }
      if (!rejectedTime && app.appliedAt) {
        rejectedTime = new Date(app.appliedAt).getTime();
      }

      const elapsed = rejectedTime ? (now - rejectedTime) : 0;
      if (elapsed > THIRTY_MINUTES_MS) {
        archivedApps.push(app);
      } else {
        app._minutesLeft = Math.max(1, Math.ceil((THIRTY_MINUTES_MS - elapsed) / 60000));
        activeApps.push(app);
      }
    });

    archivedCount = archivedApps.length;
    columnApps = showArchivedRechazadas ? [...activeApps, ...archivedApps] : activeApps;
  }

  const isMobileActive = mobileActiveStageKey === stageKey;

  return `
    <div
      class="kanban-column stage-${stageKey} ${isMobileActive ? "is-mobile-active" : ""}"
      data-stage="${stageKey}"
      id="kcol-${stageKey}"
      ondragover="kanbanDragOver(event)"
      ondragleave="kanbanDragLeave(event)"
      ondrop="kanbanDrop(event, '${stageKey}')"
    >
      <div class="kanban-col-header">
        <div class="kanban-col-title-wrap">
          <span class="kanban-stage-dot"></span>
          <h3 class="kanban-col-title">${escapeHtml(stageTitle)}</h3>
        </div>
        <span class="kanban-count-pill ${columnApps.length > 0 ? "is-active" : "is-zero"}">
          ${columnApps.length}${archivedCount > 0 && !showArchivedRechazadas ? ` (+${archivedCount})` : ""}
        </span>
      </div>

      <div class="kanban-cards-list" id="col-list-${stageKey}" data-stage="${stageKey}">
        ${
          columnApps.length
            ? columnApps.map(renderCandidateCard).join("")
            : renderEmptyColumnState(stageKey)
        }
        ${
          stageKey === "rechazada" && archivedCount > 0
            ? `
              <div style="margin-top: 12px; padding: 10px; background: var(--rp-surface); border: 1px dashed var(--rp-border); border-radius: var(--rp-radius-md); text-align: center;">
                <small style="display: block; color: var(--rp-text-muted); font-size: 11px; margin-bottom: 6px;">
                  ${showArchivedRechazadas ? `Mostrando ${archivedCount} archivada(s) (>30m)` : `${archivedCount} candidatura(s) archivada(s) (>30m)`}
                </small>
                <button
                  type="button"
                  class="rp-btn rp-btn--secondary rp-btn--sm"
                  style="font-size: 11px; padding: 4px 10px;"
                  onclick="event.stopPropagation(); toggleArchivedRechazadas()"
                >
                  ${showArchivedRechazadas ? "Ocultar archivadas" : "Ver archivadas"}
                </button>
              </div>
            `
            : ""
        }
      </div>
    </div>
  `;
}

function renderCandidateCard(app) {
  const avatar = typeof window.ui !== "undefined" && window.ui.avatar
    ? window.ui.avatar(app.name, 36)
    : getDynamicAvatar(app.name, 36);

  const briefcaseIcon = typeof window.ui !== "undefined" && window.ui.icon
    ? window.ui.icon("briefcase", "rp-icon-sm")
    : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="7" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>';

  const mailIcon = typeof window.ui !== "undefined" && window.ui.icon
    ? window.ui.icon("mail", "rp-icon-sm")
    : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>';

  const phoneIcon = typeof window.ui !== "undefined" && window.ui.icon
    ? window.ui.icon("phone", "rp-icon-sm")
    : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';

  const mapPinIcon = typeof window.ui !== "undefined" && window.ui.icon
    ? window.ui.icon("map-pin", "rp-icon-sm")
    : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>';

  const clockIcon = typeof window.ui !== "undefined" && window.ui.icon
    ? window.ui.icon("clock", "rp-icon-sm")
    : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';

  const moreIcon = typeof window.ui !== "undefined" && window.ui.icon
    ? window.ui.icon("more-horizontal", "rp-icon-sm")
    : "⋯";

  const fileIcon = typeof window.ui !== "undefined" && window.ui.icon
    ? window.ui.icon("file-text", "rp-icon-sm")
    : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>';

  // AI score visual
  let aiVisual = "";
  if (app.aiScore) {
    aiVisual = typeof window.ui !== "undefined" && window.ui.progressRing
      ? window.ui.progressRing(app.aiScore, 34, 3.5)
      : `<span class="kanban-ai-pill score-${app.aiScore >= 80 ? "high" : app.aiScore >= 60 ? "med" : "low"}"><i data-lucide="sparkles" class="rp-icon rp-icon-sm"></i> ${app.aiScore}%</span>`;
  } else {
    aiVisual = `
      <button
        type="button"
        class="rp-btn rp-btn--ghost rp-btn--sm"
        style="font-size: 11px; padding: 2px 7px; color: var(--rp-primary); background: var(--rp-primary-soft);"
        onclick="event.stopPropagation(); triggerDirectAi('${escapeHtml(app.id)}')"
        title="Analizar afinidad técnica con IA"
      >
        Analizar IA
      </button>
    `;
  }

  const resumeBtn = app.resumeId
    ? `
      <button
        class="rp-btn rp-btn--secondary rp-btn--sm"
        type="button"
        onclick="event.stopPropagation(); viewDocument('${encodeURIComponent(app.resumeId)}', '${encodeURIComponent(app.id)}')"
        title="Ver currículum del candidato"
        style="padding: 4px 9px; font-size: 11.5px;"
      >
        ${fileIcon}
        <span>CV</span>
      </button>
    `
    : "";

  const isGrabbed = keyboardGrabbedCardId === app.id;

  return `
    <div
      class="candidate-card-v2 ${isGrabbed ? "is-keyboard-grabbed" : ""}"
      id="kcard-${escapeHtml(app.id)}"
      data-id="${escapeHtml(app.id)}"
      tabindex="0"
      role="button"
      aria-label="Candidato ${escapeHtml(app.name)}, etapa ${statusLabel(app.status)}"
      draggable="true"
      ondragstart="kanbanDragStart(event, '${escapeHtml(app.id)}')"
      ondragend="kanbanDragEnd(event, '${escapeHtml(app.id)}')"
      onclick="openApplicationDetailDialog('${escapeHtml(app.id)}')"
      onkeydown="handleCardKeyNavigation(event, '${escapeHtml(app.id)}')"
    >
      <div class="candidate-card-header">
        <div class="candidate-card-profile">
          ${avatar}
          <div style="min-width: 0; flex: 1;">
            <h4 class="candidate-card-name" title="${escapeHtml(app.name)}">${escapeHtml(app.name)}</h4>
          </div>
        </div>
        <div class="candidate-card-ai-wrap" onclick="event.stopPropagation()">
          ${aiVisual}
        </div>
      </div>

      <div class="candidate-card-vacancy-chip" title="Vacante: ${escapeHtml(app.vacancyTitle)}">
        ${briefcaseIcon}
        <span>${escapeHtml(app.vacancyTitle)}</span>
      </div>

      <div class="candidate-card-metadata">
        ${
          app.email
            ? `<div class="candidate-meta-row" title="${escapeHtml(app.email)}">
                ${mailIcon}
                <span>${escapeHtml(app.email)}</span>
              </div>`
            : ""
        }
        ${
          app.phone
            ? `<div class="candidate-meta-row" title="${escapeHtml(app.phone)}">
                ${phoneIcon}
                <span>${escapeHtml(app.phone)}</span>
              </div>`
            : ""
        }
        ${
          app.location
            ? `<div class="candidate-meta-row" title="${escapeHtml(app.location)}">
                ${mapPinIcon}
                <span>${escapeHtml(app.location)}</span>
              </div>`
            : ""
        }
      </div>

      ${
        app.status === "rechazada" && app._minutesLeft
          ? `<div class="rejected-countdown-badge" title="Esta candidatura desaparecerá automáticamente del tablero">
              ${clockIcon}
              <span>Se oculta en ${app._minutesLeft} min</span>
            </div>`
          : ""
      }

      <div class="candidate-card-footer" onclick="event.stopPropagation()">
        <div class="candidate-card-footer-left">
          ${resumeBtn}
          <button
            type="button"
            class="rp-btn rp-btn--ghost rp-btn--sm"
            style="padding: 4px 8px; font-size: 11.5px; color: var(--rp-text-2);"
            onclick="openApplicationDetailDialog('${escapeHtml(app.id)}')"
            title="Ver notas y detalles"
          >
            Seguimiento
          </button>
        </div>

        <button
          type="button"
          class="rp-btn rp-btn--ghost rp-btn--icon rp-btn--sm"
          aria-label="Más acciones para ${escapeHtml(app.name)}"
          onclick="openCardActionMenu(event, '${escapeHtml(app.id)}')"
          title="Más opciones"
        >
          ${moreIcon}
        </button>
      </div>
    </div>
  `;
}

const renderKanbanCard = renderCandidateCard;

function openCardActionMenu(e, id) {
  e.stopPropagation();
  const app = pipelineApplicationsCache.find((item) => item.id === id);
  if (!app || typeof window.ui === "undefined" || !window.ui.menu) return;

  const stages = [
    { key: "recibida", label: "Recibidas" },
    { key: "en_revision", label: "En revisión" },
    { key: "entrevista", label: "Entrevista" },
    { key: "oferta", label: "Oferta" },
    { key: "rechazada", label: "Rechazada" },
  ];

  const items = [
    {
      label: "Seguimiento y notas",
      icon: "file-text",
      onSelect: () => openApplicationDetailDialog(app.id),
    },
    { heading: "Mover a etapa" },
    ...stages
      .filter((s) => s.key !== app.status)
      .map((s) => ({
        label: s.label,
        icon: s.key === "rechazada" ? "x-circle" : s.key === "oferta" ? "sparkles" : "arrow-right",
        onSelect: () => applyApplicationStageChangeWithUndo(app, s.key),
      })),
    { separator: true },
    {
      label: "Eliminar postulación",
      icon: "trash-2",
      danger: true,
      onSelect: async () => {
        const ok = await window.ui.confirm({
          title: "¿Eliminar postulación?",
          text: `¿Estás seguro de eliminar permanentemente a "${app.name}"? Esta acción borrará sus notas y registros asociados.`,
          confirmLabel: "Eliminar",
          danger: true,
        });
        if (ok) {
          try {
            await apiRequest(`/api/applications/${encodeURIComponent(app.id)}`, { method: "DELETE" });
            pipelineApplicationsCache = (pipelineApplicationsCache || []).filter((item) => item.id !== app.id);
            refreshPipelineBoard();
            updatePipelineStatsCount();
            window.ui.toast("Postulación eliminada con éxito.", { type: "info" });
          } catch (err) {
            window.ui.toast(err.message || "Error al eliminar postulación", { type: "error" });
          }
        }
      },
    },
  ];

  window.ui.menu(e.currentTarget, items);
}

function initKanbanSortables() {
  if (typeof Sortable === "undefined") return;

  sortableInstances.forEach((inst) => {
    try {
      inst.destroy();
    } catch (_) {}
  });
  sortableInstances = [];

  const stageLists = document.querySelectorAll(".kanban-cards-list");
  stageLists.forEach((listEl) => {
    const sortable = new Sortable(listEl, {
      group: "recruitpro-kanban",
      animation: 200,
      ghostClass: "sortable-ghost",
      chosenClass: "sortable-chosen",
      delay: 0,
      touchStartThreshold: 4,
      filter: ".kanban-empty-compact, button, a, select, input",
      preventOnFilter: false,
      onEnd: function (evt) {
        const toList = evt.to;
        const fromList = evt.from;
        if (!toList || toList === fromList) return;

        const targetStage = toList.dataset.stage;
        const cardEl = evt.item;
        const appId = cardEl.dataset.id;
        if (!appId || !targetStage) return;

        const app = pipelineApplicationsCache.find((a) => a.id === appId);
        if (!app) return;

        applyApplicationStageChangeWithUndo(app, targetStage);
      },
    });
    sortableInstances.push(sortable);
  });
}

function handleCardKeyNavigation(e, appId) {
  const app = pipelineApplicationsCache.find((a) => a.id === appId);
  if (!app) return;

  const stagesOrder = ["recibida", "en_revision", "entrevista", "oferta", "rechazada"];
  const currentIdx = stagesOrder.indexOf(app.status);

  if (e.key === " " || e.key === "Enter") {
    e.preventDefault();
    if (keyboardGrabbedCardId === appId) {
      keyboardGrabbedCardId = null;
      refreshPipelineBoard();
      if (typeof window.ui !== "undefined" && window.ui.toast) {
        window.ui.toast(`Tarjeta fijada en ${statusLabel(app.status)}`, { type: "info", duration: 2000 });
      }
    } else {
      keyboardGrabbedCardId = appId;
      refreshPipelineBoard();
      setTimeout(() => {
        const cardEl = document.getElementById(`kcard-${appId}`);
        if (cardEl) cardEl.focus();
      }, 20);
      if (typeof window.ui !== "undefined" && window.ui.toast) {
        window.ui.toast(`Tarjeta seleccionada. Usa ← / → para moverla de etapa o Espacio para soltarla`, { type: "info", duration: 3500 });
      }
    }
  } else if (e.key === "ArrowRight" && keyboardGrabbedCardId === appId) {
    e.preventDefault();
    if (currentIdx < stagesOrder.length - 1) {
      const nextStage = stagesOrder[currentIdx + 1];
      applyApplicationStageChangeWithUndo(app, nextStage);
      setTimeout(() => {
        const cardEl = document.getElementById(`kcard-${appId}`);
        if (cardEl) cardEl.focus();
      }, 30);
    }
  } else if (e.key === "ArrowLeft" && keyboardGrabbedCardId === appId) {
    e.preventDefault();
    if (currentIdx > 0) {
      const prevStage = stagesOrder[currentIdx - 1];
      applyApplicationStageChangeWithUndo(app, prevStage);
      setTimeout(() => {
        const cardEl = document.getElementById(`kcard-${appId}`);
        if (cardEl) cardEl.focus();
      }, 30);
    }
  } else if (e.key === "Escape" && keyboardGrabbedCardId === appId) {
    keyboardGrabbedCardId = null;
    refreshPipelineBoard();
  }
}

function setMobileActiveStage(stageKey) {
  mobileActiveStageKey = stageKey;
  document.querySelectorAll(".kanban-mobile-tab-btn").forEach((btn) => {
    const isThis = btn.id === `tab-${stageKey}`;
    btn.classList.toggle("active", isThis);
    btn.setAttribute("aria-selected", isThis ? "true" : "false");
  });
  document.querySelectorAll(".kanban-column").forEach((col) => {
    col.classList.toggle("is-mobile-active", col.dataset.stage === stageKey);
  });
}

function scrollKanban(direction) {
  const board = document.getElementById("kanban-main-board");
  if (!board) return;
  const amount = direction === "left" ? -320 : 320;
  board.scrollBy({ left: amount, behavior: "smooth" });
}

function refreshPipelineBoard() {
  const container = document.getElementById("kanban-board-container");
  if (container) {
    container.innerHTML = renderPipelineBoardOnly();
  }
}

function updatePipelineStatsCount() {
  const numEl = document.getElementById("pipeline-stats-num");
  if (numEl && typeof window.ui !== "undefined" && window.ui.countUp) {
    window.ui.countUp(numEl, pipelineApplicationsCache.length);
  } else if (numEl) {
    numEl.textContent = pipelineApplicationsCache.length;
  }
}

async function changePipelineVacancy(vacancyId) {
  currentPipelineVacancyId = vacancyId;
  try {
    const appsRes = await (
      await apiRequest(
        "/api/applications" + (currentPipelineVacancyId ? `?vacancy_id=${encodeURIComponent(currentPipelineVacancyId)}` : "")
      )
    ).json();
    pipelineApplicationsCache = appsRes.items;
    updatePipelineStatsCount();
    refreshPipelineBoard();
  } catch (err) {
    console.error("Error al filtrar vacante:", err);
  }
}

function filterPipelineCards(query) {
  pipelineSearchQuery = query;
  refreshPipelineBoard();
}

/* Drag and Drop event handlers (HTML5 Fallback) */
function kanbanDragStart(e, id) {
  draggedAppId = id;
  e.dataTransfer.setData("text/plain", id);
  e.dataTransfer.effectAllowed = "move";
  const card = document.getElementById(`kcard-${id}`);
  if (card) {
    setTimeout(() => card.classList.add("sortable-chosen"), 0);
  }
}

function kanbanDragEnd(e, id) {
  const card = document.getElementById(`kcard-${id}`);
  if (card) card.classList.remove("sortable-chosen");
  draggedAppId = null;
}

function kanbanDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  const col = e.currentTarget;
  if (!col.classList.contains("drag-over")) {
    col.classList.add("drag-over");
  }
}

function kanbanDragLeave(e) {
  const col = e.currentTarget;
  col.classList.remove("drag-over");
}

async function kanbanDrop(e, targetStage) {
  e.preventDefault();
  const col = e.currentTarget;
  col.classList.remove("drag-over");

  const id = e.dataTransfer.getData("text/plain") || draggedAppId;
  if (!id) return;

  const app = pipelineApplicationsCache.find((item) => item.id === id);
  if (!app || app.status === targetStage) return;

  await applyApplicationStageChangeWithUndo(app, targetStage);
}

async function moveApplicationStageDirect(id, targetStage) {
  const app = pipelineApplicationsCache.find((item) => item.id === id);
  if (!app || app.status === targetStage) return;
  await applyApplicationStageChangeWithUndo(app, targetStage);
}

async function applyApplicationStageChange(app, targetStage) {
  return applyApplicationStageChangeWithUndo(app, targetStage);
}

async function applyApplicationStageChangeWithUndo(app, targetStage) {
  if (!app || app.status === targetStage) return;

  const oldStage = app.status;
  const oldRejectedAt = app.rejectedAt;
  const oldMinutesLeft = app._minutesLeft;

  // Optimistic update
  app.status = targetStage;
  if (targetStage === "rechazada") {
    app.rejectedAt = new Date().toISOString();
    app._minutesLeft = 30;
  } else {
    delete app._minutesLeft;
  }

  // Celebratory confetti if moved to "oferta"
  if (targetStage === "oferta" && typeof confetti === "function") {
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.65 },
        colors: ["#2563EB", "#7C3AED", "#10B981", "#F59E0B"],
      });
    } catch (_) {}
  }

  refreshPipelineBoard();

  if (typeof window.ui !== "undefined" && window.ui.announce) {
    window.ui.announce(`${app.name} movido a la etapa ${statusLabel(targetStage)}`);
  }

  try {
    await apiRequest(`/api/applications/${encodeURIComponent(app.id)}`, {
      method: "PATCH",
      body: { status: targetStage },
    });

    const label = statusLabel(targetStage);
    const msg = targetStage === "rechazada"
      ? `${app.name} movido a Rechazada (se ocultará en 30 min)`
      : `${app.name} movido a: ${label}`;

    if (typeof window.ui !== "undefined" && window.ui.toast) {
      window.ui.toast(msg, {
        type: "success",
        actionLabel: "Deshacer",
        duration: 5000,
        onAction: async () => {
          app.status = oldStage;
          app.rejectedAt = oldRejectedAt;
          app._minutesLeft = oldMinutesLeft;
          refreshPipelineBoard();
          try {
            await apiRequest(`/api/applications/${encodeURIComponent(app.id)}`, {
              method: "PATCH",
              body: { status: oldStage },
            });
            window.ui.toast(`Se restauró a ${app.name} en ${statusLabel(oldStage)}`, { type: "info" });
          } catch (revertErr) {
            window.ui.toast("Error al revertir etapa", { type: "error" });
          }
        },
      });
    } else {
      showKanbanToast(msg);
    }
  } catch (error) {
    console.error("Error al actualizar etapa:", error);
    // Rollback state
    app.status = oldStage;
    app.rejectedAt = oldRejectedAt;
    app._minutesLeft = oldMinutesLeft;
    refreshPipelineBoard();

    if (typeof window.ui !== "undefined" && window.ui.toast) {
      window.ui.toast(error.message || "No se pudo cambiar la etapa", { type: "error" });
    } else {
      showKanbanToast("" + (error.message || "No se pudo cambiar la etapa"), true);
    }
  }
}

/* Detail modal & notes */
function openApplicationDetailDialog(id) {
  const app = pipelineApplicationsCache.find((item) => item.id === id);
  if (!app) return;

  const dialog = document.getElementById("application-detail-dialog");
  const infoEl = document.getElementById("app-detail-candidate-info");
  const stageSelect = document.getElementById("app-detail-stage");
  const assigneeSelect = document.getElementById("app-detail-assignee");
  const noteEl = document.getElementById("app-detail-note");
  const historyEl = document.getElementById("app-detail-history");
  const msgEl = document.getElementById("app-detail-message");

  document.getElementById("app-detail-id").value = app.id;
  msgEl.textContent = "";
  msgEl.classList.remove("is-error", "show");
  noteEl.value = "";

  infoEl.innerHTML = `
    <div style="background: #f8fafc; padding: 14px; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 16px;">
      <h3 style="margin: 0 0 6px 0; font-size: 16px;">${escapeHtml(app.name)}</h3>
      <p style="margin: 0; font-size: 13px; color: var(--muted);">Correo: ${escapeHtml(app.email)} · ${escapeHtml(app.vacancyTitle)}</p>
      ${app.resumeId ? `<div style="margin-top: 10px;"><button type="button" class="kanban-action-btn primary-btn" onclick=\"viewDocument('${encodeURIComponent(app.resumeId)}', '${encodeURIComponent(app.id)}')\">Abrir Currículum</button></div>` : ""}
    </div>
  `;

  stageSelect.value = app.status;

  const recruiterOptions = usersCache
    .map((r) => `<option value="${escapeHtml(r.id)}" ${app.assignedRecruiterId === r.id ? "selected" : ""}>${escapeHtml(r.name)}</option>`)
    .join("");
  assigneeSelect.innerHTML = `<option value="">Sin asignar</option>${recruiterOptions}`;

  const historyItems = (app.activities || [])
    .map((act) => {
      const title = act.type === "status"
        ? `Etapa: ${statusLabel(act.fromStatus || "")} → ${statusLabel(act.toStatus || "")}`
        : act.type === "assignment"
        ? "Cambio de responsable"
        : "Nota interna";
      return `<li><b>${escapeHtml(title)}</b> · <small>${escapeHtml(act.author)} · ${new Date(act.createdAt).toLocaleString("es")}</small>${act.note ? `<p>"${escapeHtml(act.note)}"</p>` : ""}</li>`;
    })
    .join("");

  historyEl.innerHTML = historyItems || "<li>Sin notas ni actividad previa registrada.</li>";

  dialog.showModal();
}

function closeApplicationDetailDialog() {
  const dialog = document.getElementById("application-detail-dialog");
  dialog.close();
}

async function saveApplicationDetailUpdate(e) {
  e.preventDefault();
  const id = document.getElementById("app-detail-id").value;
  const stage = document.getElementById("app-detail-stage").value;
  const assigneeId = document.getElementById("app-detail-assignee").value || null;
  const note = document.getElementById("app-detail-note").value.trim();
  const msgEl = document.getElementById("app-detail-message");

  try {
    const response = await apiRequest(`/api/applications/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: { status: stage, assigned_recruiter_id: assigneeId, note: note || null },
    });
    const result = await response.json();

    const app = pipelineApplicationsCache.find((item) => item.id === id);
    if (app) {
      app.status = stage;
      app.assignedRecruiterId = assigneeId;
      if (stage === "rechazada") {
        app.rejectedAt = new Date().toISOString();
        app._minutesLeft = 30;
      }
      if (note) {
        app.activities = app.activities || [];
        app.activities.unshift({
          id: String(Date.now()),
          type: "note",
          author: user.name,
          note: note,
          createdAt: new Date().toISOString(),
        });
      }
    }

    closeApplicationDetailDialog();
    showKanbanToast("Seguimiento guardado correctamente.");
    const container = document.getElementById("kanban-board-container");
    if (container) container.innerHTML = renderPipelineBoardOnly();
  } catch (error) {
    console.error("Error al guardar seguimiento:", error);
    msgEl.textContent = error.message || "No se pudo guardar el seguimiento.";
    msgEl.classList.add("is-error", "show");
  }
}

async function deleteCurrentApplication() {
  const id = document.getElementById("app-detail-id").value;
  if (!id) return;

  const app = (pipelineApplicationsCache || []).find((item) => item.id === id);
  const name = app ? app.name : "esta postulación";

  let confirmed = false;
  if (typeof window.ui !== "undefined" && window.ui.confirm) {
    confirmed = await window.ui.confirm({
      title: "¿Eliminar postulación?",
      text: `¿Estás seguro de que deseas eliminar permanentemente la postulación de ${name}?`,
      confirmLabel: "Eliminar",
      danger: true,
    });
  } else {
    confirmed = confirm(`¿Estás seguro de que deseas eliminar permanentemente la postulación de ${name}?`);
  }
  if (!confirmed) return;

  try {
    await apiRequest(`/api/applications/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    pipelineApplicationsCache = (pipelineApplicationsCache || []).filter((item) => item.id !== id);
    closeApplicationDetailDialog();
    if (typeof window.ui !== "undefined" && window.ui.toast) {
      window.ui.toast("Postulación eliminada exitosamente.", { type: "info" });
    } else {
      showKanbanToast("Postulación eliminada exitosamente.");
    }
    refreshPipelineBoard();
    updatePipelineStatsCount();
  } catch (error) {
    console.error("Error al eliminar postulación:", error);
    if (typeof window.ui !== "undefined" && window.ui.toast) {
      window.ui.toast(error.message || "No se pudo eliminar la postulación.", { type: "error" });
    } else {
      alert(error.message || "No se pudo eliminar la postulación.");
    }
  }
}

/* Toast alert notification */
let toastTimeout = null;
function showKanbanToast(message, isError = false) {
  if (typeof window.ui !== "undefined" && window.ui.toast) {
    window.ui.toast(message, { type: isError ? "error" : "success" });
    return;
  }
  const toast = document.getElementById("kanban-toast");
  if (!toast) return;

  const iconSvg = isError
    ? `<svg style="width: 18px; height: 18px; color: #fca5a5; flex-shrink: 0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
    : `<svg style="width: 18px; height: 18px; color: #86efac; flex-shrink: 0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>`;

  toast.innerHTML = `
    ${iconSvg}
    <span style="line-height: 1.4;">${escapeHtml(message)}</span>
  `;
  toast.classList.toggle("is-error", isError);
  toast.classList.add("show");

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

async function initializeDashboard() {
  try {
    user = await (await apiRequest("/api/auth/me")).json();
    document.getElementById("user").textContent = user.name;
    document.getElementById("user-role").textContent = label(user.role);
    const avatarEl = document.getElementById("avatar");
    if (avatarEl) {
      avatarEl.innerHTML = getDynamicAvatar(user.name, 38);
      avatarEl.classList.add("has-dynamic");
    }
    const items =
      user.role === "candidato"
        ? [["home", "Inicio", "home"], ["jobs", "Vacantes", "briefcase"], ["applications", "Mis postulaciones", "send"], ["profile", "Mi perfil", "user"], ["docs", "Mis documentos", "file-text"]]
        : user.role === "reclutador"
          ? [["home", "Inicio", "home"], ["procesos", "Procesos de selección", "folder-check"], ["pipeline", "Pipeline Kanban", "columns-3"], ["jobs", "Vacantes", "briefcase"], ["candidates", "Candidatos", "users"]]
          : [["home", "Inicio", "home"], ["procesos", "Procesos de selección", "folder-check"], ["pipeline", "Pipeline Kanban", "columns-3"], ["jobs", "Vacantes", "briefcase"], ["candidates", "Candidatos", "users"], ["recruiters", "Equipo de selección", "user-check"]];
    
    nav.innerHTML = `
      <div id="nav-pill" class="rp-nav-pill"></div>
      ${items
        .map(([page, title]) => `<button type="button" data-page="${page}" onclick="view('${page}')">${title}</button>`)
        .join("")}
    `;

    // Renderizar menú móvil
    const mobileList = document.getElementById("mobile-nav-list");
    if (mobileList) {
      mobileList.innerHTML = items
        .map(([page, title, iconName]) => `
          <button type="button" class="rp-mobile-nav-btn" data-page="${page}" onclick="view('${page}'); closeMobileMenu();">
            <i data-lucide="${iconName}" class="rp-icon rp-icon-sm"></i>
            <span>${title}</span>
          </button>
        `)
        .join("");
    }

    // Inicializar tema y refrescar iconos
    if (window.ui && window.ui.theme) {
      ui.theme.apply(ui.theme.get());
    }
    if (window.ui && typeof window.ui.refreshIcons === "function") {
      ui.refreshIcons();
    }
    setTimeout(updateNavPill, 100);

    const pendingApplicationId = sessionStorage.getItem("recruitpro_pending_application");
    if (user.role === "candidato" && pendingApplicationId) {
      await view("apply", pendingApplicationId);
    } else {
      await view("home");
    }
  } catch (error) {
    console.error("No se pudo iniciar el panel:", error);
    location.href = "index.html";
  }
}

initializeDashboard();


function goToPipelineForVacancy(encodedId) {
  const id = decodeURIComponent(encodedId);
  currentPipelineVacancyId = id;
  view("pipeline");
}

async function deleteVacancy(encodedId, title) {
  const id = decodeURIComponent(encodedId);
  let confirmed = false;
  if (typeof window.ui !== "undefined" && window.ui.confirm) {
    confirmed = await window.ui.confirm({
      title: "¿Eliminar vacante?",
      text: `¿Estás seguro de que deseas eliminar permanentemente la vacante "${title}" y todas sus postulaciones asociadas? Esta acción no se puede deshacer.`,
      confirmLabel: "Eliminar vacante",
      danger: true,
    });
  } else {
    confirmed = confirm(`¿Estás seguro de que deseas eliminar la vacante "${title}"?`);
  }
  if (!confirmed) return;

  try {
    await apiRequest(`/api/vacancies/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (typeof window.ui !== "undefined" && window.ui.toast) {
      window.ui.toast(`Vacante "${title}" eliminada con éxito.`, { type: "info" });
    } else {
      showKanbanToast(`Vacante "${title}" eliminada con éxito.`);
    }
    await view("jobs");
  } catch (error) {
    console.error("Error al eliminar vacante:", error);
    showMessage(error.message || "No se pudo eliminar la vacante.", true);
  }
}

/* ==========================================================================
   AI RECRUITMENT & SCREENING FUNCTIONS
   ========================================================================== */

let currentAiAnalysis = null;

async function triggerAiScreening(isBackground = false) {
  const runBtn = document.getElementById("run-ai-btn");
  const loading = document.getElementById("ai-loading");
  const results = document.getElementById("ai-results");

  if (!currentEvaluatingApp) {
    const dialog = document.getElementById("document-preview");
    const storedAppId = dialog ? dialog.dataset.appId : null;
    if (storedAppId && pipelineApplicationsCache) {
      currentEvaluatingApp = pipelineApplicationsCache.find((a) => a.id === storedAppId);
    }
  }

  if (!currentEvaluatingApp) {
    if (loading && !isBackground) {
      loading.style.display = "block";
      loading.innerHTML = '<span style="color: #b91c1c;">No se encontró la postulación asociada para este documento.</span>';
    }
    return;
  }

  if (!isBackground) {
    if (runBtn) {
      runBtn.disabled = true;
      runBtn.textContent = "Analizando...";
    }
    if (loading) {
      loading.style.display = "block";
      loading.innerHTML = '<span>Procesando currículum y evaluando correlación técnica con la vacante...</span>';
    }
    if (results) results.style.display = "none";
  }

  try {
    const response = await apiRequest(`/api/ai/analyze-application/${encodeURIComponent(currentEvaluatingApp.id)}`);
    const data = await response.json();
    currentAiAnalysis = data;

    // Update UI elements
    const scorePill = document.getElementById("ai-score-pill");
    const verdictLabel = document.getElementById("ai-verdict-label");
    const progressFill = document.getElementById("ai-progress-fill");
    const summaryEl = document.getElementById("ai-summary");
    const matchedTags = document.getElementById("ai-matched-tags");
    const missingTags = document.getElementById("ai-missing-tags");
    const questionsList = document.getElementById("ai-questions-list");

    if (verdictLabel) {
      verdictLabel.textContent = data.verdict;
    }
    if (scorePill) {
      scorePill.textContent = `${data.matchScore}% Compatibilidad`;
      scorePill.className = "ai-score-pill " + (data.matchScore >= 80 ? "score-high" : data.matchScore >= 60 ? "score-med" : "score-low");
    }
    if (progressFill) progressFill.style.width = `${data.matchScore}%`;
    if (summaryEl) summaryEl.textContent = data.summary;

    if (matchedTags) {
      matchedTags.innerHTML = (data.matchedSkills || []).length
        ? data.matchedSkills.map((s) => `<span class="ai-tag matched">${escapeHtml(s)}</span>`).join("")
        : '<span class="ai-tag">Sin competencias directas identificadas</span>';
    }

    if (missingTags) {
      missingTags.innerHTML = (data.missingSkills || []).length
        ? data.missingSkills.map((s) => `<span class="ai-tag missing">${escapeHtml(s)}</span>`).join("")
        : '<span class="ai-tag matched">Cumple todos los requisitos clave de la vacante</span>';
    }

    if (questionsList) {
      questionsList.innerHTML = (data.interviewQuestions || [])
        .map((q) => `<li>${escapeHtml(q)}</li>`)
        .join("");
    }

    if (loading) loading.style.display = "none";
    if (results) {
      results.style.display = "block";
      results.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    
    // Automatically auto-populate recommendation
    autoApplyAiRecommendation();

    // Update in-memory applications cache so Kanban cards update
    currentEvaluatingApp.aiScore = data.matchScore;
    currentEvaluatingApp.aiVerdict = data.verdict;
    const cachedItem = (pipelineApplicationsCache || []).find((a) => a.id === currentEvaluatingApp.id);
    if (cachedItem) {
      cachedItem.aiScore = data.matchScore;
      cachedItem.aiVerdict = data.verdict;
    }
    const container = document.getElementById("kanban-board-container");
    if (container) container.innerHTML = renderPipelineBoardOnly();

    showKanbanToast(`Análisis completado: ${data.matchScore}% de compatibilidad técnica.`);
  } catch (error) {
    console.error("Error en AI Screening:", error);
    if (loading) {
      loading.style.display = "block";
      loading.innerHTML = `<span style="color: #b91c1c;">Error al analizar: ${escapeHtml(error.message || "Error en el servidor")}</span>`;
    }
  } finally {
    if (runBtn) {
      runBtn.disabled = false;
      runBtn.textContent = "Volver a Analizar";
    }
  }
}

const runAiScreening = triggerAiScreening;

function autoApplyAiRecommendation() {
  if (!currentAiAnalysis && currentEvaluatingApp && currentEvaluatingApp.aiScore) {
    const score = currentEvaluatingApp.aiScore;
    const stars = score >= 85 ? 5 : score >= 70 ? 4 : score >= 55 ? 3 : 2;
    const stage = score >= 70 ? "entrevista" : score >= 55 ? "en_revision" : "rechazada";
    currentAiAnalysis = {
      matchScore: score,
      stars: stars,
      verdict: currentEvaluatingApp.aiVerdict || "Recomendación Favorable (Nivel Sobresaliente)",
      suggestedStage: stage,
      summary: currentEvaluatingApp.aiSummary || `Afinidad técnica del ${score}% frente a los requerimientos de la vacante.`,
      matchedSkills: [],
      interviewQuestions: [],
    };
  }

  if (!currentAiAnalysis) return;

  // 1. Auto-set stars directly
  const targetStars = currentAiAnalysis.stars || (currentAiAnalysis.matchScore >= 85 ? 5 : 4);
  setCandidateRating(targetStars);

  // 2. Auto-set stage
  if (currentAiAnalysis.suggestedStage) {
    setSplitStage(currentAiAnalysis.suggestedStage);
  }

  // 3. Auto-populate note
  const noteEl = document.getElementById("eval-note-text");
  if (noteEl) {
    const skillsList = (currentAiAnalysis.matchedSkills || []).length
      ? currentAiAnalysis.matchedSkills.map((s) => "• " + s).join("\n")
      : "• Competencias en proceso de homologación";
    const questionsList = (currentAiAnalysis.interviewQuestions || []).length
      ? currentAiAnalysis.interviewQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")
      : ["1. Describa sus principales proyectos y logros en su especialidad.", "2. ¿Cuál es su metodología para asegurar la calidad de sus entregables?"].join("\n");

    const noteText = `[Dictamen Técnico IA: ${currentAiAnalysis.matchScore}% Compatibilidad - ${currentAiAnalysis.verdict}]
Resumen: ${currentAiAnalysis.summary}

Competencias acreditadas:
${skillsList}

Puntos de control para el panel de entrevista:
${questionsList}`;

    noteEl.value = noteText;
  }

  showKanbanToast(`Calificación consolidada: ${targetStars} de 5 estrellas.`);
}

/* Candidate AI Vacancy Fit Dialog */
async function openCandidateAiFit(encodedVacancyId) {
  const id = decodeURIComponent(encodedVacancyId);
  const dialog = document.getElementById("ai-candidate-fit-dialog");
  const loading = document.getElementById("ai-candidate-loading");
  const results = document.getElementById("ai-candidate-results");

  if (loading) {
    loading.style.display = "block";
    loading.textContent = "Analizando los requisitos de la vacante frente a tu perfil...";
  }
  if (results) results.style.display = "none";

  dialog.showModal();

  try {
    const res = await apiRequest(`/api/ai/analyze-vacancy-fit/${encodeURIComponent(id)}`);
    const data = await res.json();

    document.getElementById("ai-candidate-verdict").textContent = data.verdict;
    const scorePill = document.getElementById("ai-candidate-score-pill");
    scorePill.textContent = `${data.matchScore}% de afinidad`;
    scorePill.className = "ai-score-pill " + (data.matchScore >= 80 ? "score-high" : data.matchScore >= 60 ? "score-med" : "score-low");

    document.getElementById("ai-candidate-progress-fill").style.width = `${data.matchScore}%`;
    document.getElementById("ai-candidate-advice").textContent = data.candidateAdvice;

    document.getElementById("ai-candidate-matched").innerHTML = (data.matchedSkills || []).length
      ? data.matchedSkills.map((s) => `<span class="ai-tag matched">${escapeHtml(s)}</span>`).join("")
      : '<span class="ai-tag">Tus habilidades generales aplican para este puesto</span>';

    document.getElementById("ai-candidate-missing").innerHTML = (data.missingSkills || []).length
      ? data.missingSkills.map((s) => `<span class="ai-tag missing">Área técnica: ${escapeHtml(s)}</span>`).join("")
      : '<span class="ai-tag matched">¡Cumples con todas las tecnologías principales!</span>';

    loading.style.display = "none";
    results.style.display = "block";
  } catch (err) {
    console.error("Error al evaluar compatibilidad:", err);
    if (loading) loading.textContent = "No se pudo realizar el análisis: " + (err.message || "Sube tu CV en 'Documentos' primero.");
  }
}

function closeAiCandidateDialog() {
  const dialog = document.getElementById("ai-candidate-fit-dialog");
  if (dialog) dialog.close();
}

async function triggerDirectAi(appId) {
  showKanbanToast("Ejecutando análisis técnico de IA...", false);
  try {
    const res = await apiRequest(`/api/ai/analyze-application/${encodeURIComponent(appId)}`);
    const data = await res.json();
    
    // Update in cache
    const item = (pipelineApplicationsCache || []).find((a) => a.id === appId);
    if (item) {
      item.aiScore = data.matchScore;
      item.aiVerdict = data.verdict;
    }
    const container = document.getElementById("kanban-board-container");
    if (container) container.innerHTML = renderPipelineBoardOnly();
    
    showKanbanToast(`IA: ${item ? item.name : "Candidato"} evaluado con ${data.matchScore}% de afinidad.`);
  } catch (err) {
    console.error("Error en análisis directo:", err);
    showKanbanToast("No se pudo completar el análisis con IA.", true);
  }
}

async function deleteUserDirect(encodedId, name) {
  const id = decodeURIComponent(encodedId);
  let confirmed = false;
  if (typeof window.ui !== "undefined" && window.ui.confirm) {
    confirmed = await window.ui.confirm({
      title: "¿Eliminar cuenta de usuario?",
      text: `¿Estás seguro de eliminar permanentemente la cuenta de "${name}"? Se borrarán sus postulaciones, documentos y accesos.`,
      confirmLabel: "Eliminar usuario",
      danger: true,
    });
  } else {
    confirmed = confirm(`¿Estás seguro de que deseas eliminar la cuenta de "${name}"?`);
  }
  if (!confirmed) return;

  try {
    await apiRequest(`/api/users/${encodeURIComponent(id)}`, { method: "DELETE" });
    const currentPage = nav.querySelector("button.active")?.dataset.page || "home";
    await view(currentPage);
    if (typeof window.ui !== "undefined" && window.ui.toast) {
      window.ui.toast(`Cuenta de ${name} eliminada con éxito.`, { type: "info" });
    } else {
      showKanbanToast(`Cuenta de ${name} eliminada con éxito.`);
    }
  } catch (error) {
    console.error("Error al eliminar usuario:", error);
    alert(error.message || "No se pudo eliminar el usuario.");
  }
}

async function deleteUserFromModal() {
  const id = document.getElementById("edit-user-id").value;
  const name = document.getElementById("edit-user-name").value;
  if (!id) return;
  closeEditUserDialog();
  await deleteUserDirect(encodeURIComponent(id), name);
}

// Auto-limpieza en vivo: cada 60 segundos actualiza la columna de Rechazadas
// para que los candidatos desaparezcan automáticamente al cumplir 30 minutos
setInterval(() => {
  const container = document.getElementById("kanban-board-container");
  if (container && Array.isArray(pipelineApplicationsCache) && pipelineApplicationsCache.some((a) => a.status === "rechazada")) {
    container.innerHTML = renderPipelineBoardOnly();
  }
}, 60000);


/* ==========================================================================
   FASE 3: LAYOUT GLOBAL, NAVEGACIÓN CON PILL, MENÚ MÓVIL Y COMMAND PALETTE
   ========================================================================== */

function updateNavPill() {
  const navEl = document.getElementById("nav");
  const pill = document.getElementById("nav-pill");
  if (!navEl || !pill) return;
  const activeBtn = navEl.querySelector("button.active");
  if (activeBtn) {
    pill.style.opacity = "1";
    pill.style.transform = `translateX(${activeBtn.offsetLeft}px)`;
    pill.style.width = `${activeBtn.offsetWidth}px`;
  } else {
    pill.style.opacity = "0";
  }
}

window.addEventListener("resize", updateNavPill);
window.addEventListener("scroll", () => {
  const topbar = document.getElementById("site-header");
  if (topbar) {
    topbar.classList.toggle("is-scrolled", window.scrollY > 8);
  }
}, { passive: true });

function toggleMobileMenu() {
  const drawer = document.getElementById("mobile-drawer");
  const btn = document.getElementById("mobile-menu-btn");
  if (!drawer) return;
  const isOpen = drawer.classList.toggle("is-open");
  if (btn) btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
  drawer.setAttribute("aria-hidden", isOpen ? "false" : "true");
}

function closeMobileMenu() {
  const drawer = document.getElementById("mobile-drawer");
  const btn = document.getElementById("mobile-menu-btn");
  if (drawer) drawer.classList.remove("is-open");
  if (btn) btn.setAttribute("aria-expanded", "false");
}

/* Command Palette (Ctrl + K) */
let commandPaletteItems = [];
let commandPaletteSelectedIndex = 0;

function openCommandPalette() {
  const dlg = document.getElementById("rp-cmd-dialog");
  const input = document.getElementById("rp-cmd-input");
  if (!dlg) return;
  closeMobileMenu();
  document.querySelectorAll(".pdf-sidebar-link").forEach((button) => {
    button.classList.toggle("active", button.dataset.nav === page);
  });
  buildGlobalCommandIndex();
  renderCommandPaletteResults("");
  try {
    dlg.showModal();
  } catch (e) {}
  if (input) {
    input.value = "";
    setTimeout(() => input.focus(), 60);
  }
  if (window.ui && typeof window.ui.refreshIcons === "function") {
    window.ui.refreshIcons(dlg);
  }
}

function closeCommandPalette() {
  const dlg = document.getElementById("rp-cmd-dialog");
  if (dlg && dlg.open) dlg.close();
}

function buildGlobalCommandIndex() {
  commandPaletteItems = [];

  if (user) {
    const navList =
      user.role === "candidato"
        ? [["home", "Inicio", "home"], ["jobs", "Vacantes disponibles", "briefcase"], ["applications", "Mis postulaciones", "send"], ["profile", "Mi perfil", "user"], ["docs", "Mis documentos", "file-text"]]
        : [["home", "Inicio", "home"], ["pipeline", "Proceso de selección", "kanban"], ["jobs", "Vacantes", "briefcase"], ["candidates", "Candidatos", "users"], ["profile", "Mi perfil", "user"]];
    if (user.role === "administrador") {
      navList.push(["recruiters", "Equipo de selección", "user-check"]);
    }

    navList.forEach(([page, label, iconName]) => {
      commandPaletteItems.push({
        type: "nav",
        category: "Navegación",
        label: label,
        icon: iconName,
        action: () => { view(page); closeCommandPalette(); }
      });
    });
  }

  commandPaletteItems.push({
    type: "action",
    category: "Acciones rápidas",
    label: "Alternar modo oscuro / claro",
    icon: "sun-moon",
    action: () => { ui.theme.toggle(); closeCommandPalette(); }
  });
  commandPaletteItems.push({
    type: "action",
    category: "Acciones rápidas",
    label: "Ver portal público de empleo",
    icon: "external-link",
    action: () => { window.open("empleos.html", "_blank"); closeCommandPalette(); }
  });

  if (user && user.role !== "candidato") {
    commandPaletteItems.push({
      type: "action",
      category: "Acciones rápidas",
      label: "Publicar nueva vacante",
      icon: "plus-circle",
      action: () => { view("jobs"); closeCommandPalette(); }
    });
  }

  if (Array.isArray(pipelineApplicationsCache)) {
    pipelineApplicationsCache.slice(0, 15).forEach((app) => {
      commandPaletteItems.push({
        type: "candidate",
        category: "Candidatos",
        label: `${app.name} (${app.vacancyTitle || "Candidato"})`,
        detail: `${app.email} · Match ${app.aiScore || 0}%`,
        icon: "user",
        action: () => {
          view("pipeline");
          setTimeout(() => openApplicationDetailDialog(app.id), 250);
          closeCommandPalette();
        }
      });
    });
  }

  if (Array.isArray(vacanciesCache)) {
    vacanciesCache.forEach((v) => {
      commandPaletteItems.push({
        type: "vacancy",
        category: "Vacantes",
        label: v.title,
        detail: `${v.type || "Tiempo completo"} · ${v.location || "Remoto"}`,
        icon: "briefcase",
        action: () => {
          view("pipeline", v.id);
          closeCommandPalette();
        }
      });
    });
  }
}

function handleCommandPaletteSearch(query) {
  renderCommandPaletteResults(query);
}

function renderCommandPaletteResults(query) {
  const resultsEl = document.getElementById("rp-cmd-results");
  if (!resultsEl) return;

  const q = (query || "").trim().toLowerCase();
  const filtered = q
    ? commandPaletteItems.filter((item) =>
        item.label.toLowerCase().includes(q) ||
        (item.detail && item.detail.toLowerCase().includes(q)) ||
        (item.category && item.category.toLowerCase().includes(q))
      )
    : commandPaletteItems.slice(0, 10);

  if (!filtered.length) {
    resultsEl.innerHTML = `
      <div style="padding: 32px 16px; text-align: center; color: var(--rp-text-muted);">
        <i data-lucide="search-x" class="rp-icon" style="width: 32px; height: 32px; margin-bottom: 8px; opacity: 0.5;"></i>
        <p style="margin: 0; font-size: 13.5px; font-weight: 500;">No se encontraron resultados para "${escapeHtml(query)}"</p>
      </div>
    `;
    if (window.ui && typeof window.ui.refreshIcons === "function") {
      window.ui.refreshIcons(resultsEl);
    }
    return;
  }

  commandPaletteSelectedIndex = 0;
  const groups = {};
  filtered.forEach((it, idx) => {
    groups[it.category] = groups[it.category] || [];
    groups[it.category].push({ item: it, index: idx });
  });

  let html = "";
  Object.entries(groups).forEach(([category, items]) => {
    html += `<div class="rp-cmd-section-title">${escapeHtml(category)}</div>`;
    items.forEach(({ item, index }) => {
      html += `
        <button type="button" class="rp-cmd-item ${index === 0 ? "is-selected" : ""}" data-idx="${index}" onclick="executeCommandPaletteItem(${index})">
          <div class="rp-cmd-item-left">
            <i data-lucide="${escapeHtml(item.icon || "arrow-right")}" class="rp-icon rp-icon-sm" style="color: var(--rp-text-muted);"></i>
            <div>
              <span style="font-weight: 600;">${escapeHtml(item.label)}</span>
              ${item.detail ? `<span style="font-size: 11.5px; color: var(--rp-text-muted); margin-left: 6px;">${escapeHtml(item.detail)}</span>` : ""}
            </div>
          </div>
          <i data-lucide="corner-down-left" class="rp-icon rp-icon-sm" style="opacity: 0.4;"></i>
        </button>
      `;
    });
  });

  resultsEl.innerHTML = html;
  if (window.ui && typeof window.ui.refreshIcons === "function") {
    window.ui.refreshIcons(resultsEl);
  }
}

function executeCommandPaletteItem(index) {
  const item = commandPaletteItems[index];
  if (item && typeof item.action === "function") {
    item.action();
  }
}

// Global Keyboard Shortcuts
window.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    openCommandPalette();
    return;
  }
  const cmdDlg = document.getElementById("rp-cmd-dialog");
  if (cmdDlg && cmdDlg.open) {
    if (e.key === "Escape") {
      closeCommandPalette();
      return;
    }
    const items = [...cmdDlg.querySelectorAll(".rp-cmd-item")];
    if (!items.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      commandPaletteSelectedIndex = (commandPaletteSelectedIndex + 1) % items.length;
      items.forEach((it, i) => it.classList.toggle("is-selected", i === commandPaletteSelectedIndex));
      items[commandPaletteSelectedIndex].scrollIntoView({ block: "nearest" });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      commandPaletteSelectedIndex = (commandPaletteSelectedIndex - 1 + items.length) % items.length;
      items.forEach((it, i) => it.classList.toggle("is-selected", i === commandPaletteSelectedIndex));
      items[commandPaletteSelectedIndex].scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      const selected = items[commandPaletteSelectedIndex];
      if (selected) selected.click();
    }
  }
});

// Close command dialog on click outside
document.addEventListener("click", (e) => {
  const dlg = document.getElementById("rp-cmd-dialog");
  if (dlg && dlg.open && e.target === dlg) {
    closeCommandPalette();
  }
});

/* ==========================================================================
   ADVANCED B2B SAAS SHORTCUTS: LINEAR-STYLE KEYBOARD FIRST NAVIGATION
   G+H (Home), G+P (Pipeline), G+V (Vacancies), G+C (Candidates), G+E (Equipo)
   N (New Vacancy), / (Quick Search), ? (Show Shortcuts Help)
   ========================================================================== */

let pendingKeyChord = null;
let chordTimeout = null;

document.addEventListener("keydown", (e) => {
  // Ignore shortcuts when inside an active input, textarea or contenteditable
  const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : "";
  const isInput = activeTag === "input" || activeTag === "textarea" || activeTag === "select" || document.activeElement.isContentEditable;
  
  // Don't trigger if Ctrl / Cmd / Alt is pressed (except Ctrl+K handled separately)
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (isInput) return;

  const key = e.key.toLowerCase();

  // 1. Two-key chord starting with "g" (Go to...)
  if (pendingKeyChord === "g") {
    clearTimeout(chordTimeout);
    pendingKeyChord = null;
    if (key === "h") {
      e.preventDefault();
      view("home");
      if (window.ui && window.ui.toast) window.ui.toast("Navegando a Inicio", { duration: 1500 });
      return;
    } else if (key === "p") {
      e.preventDefault();
      view("pipeline");
      if (window.ui && window.ui.toast) window.ui.toast("Navegando a Proceso de selección", { duration: 1500 });
      return;
    } else if (key === "v") {
      e.preventDefault();
      view("jobs");
      if (window.ui && window.ui.toast) window.ui.toast("Navegando a Vacantes", { duration: 1500 });
      return;
    } else if (key === "c") {
      e.preventDefault();
      view("candidates");
      if (window.ui && window.ui.toast) window.ui.toast("Navegando a Candidatos", { duration: 1500 });
      return;
    } else if (key === "e") {
      e.preventDefault();
      view("recruiters");
      if (window.ui && window.ui.toast) window.ui.toast("Navegando a Equipo de selección", { duration: 1500 });
      return;
    }
  }

  if (key === "g") {
    pendingKeyChord = "g";
    chordTimeout = setTimeout(() => { pendingKeyChord = null; }, 1200);
    return;
  }

  // 2. Single-key shortcuts
  if (key === "/") {
    e.preventDefault();
    openCommandPalette();
    return;
  } else if (key === "n" && (user?.role === "administrador" || user?.role === "reclutador")) {
    e.preventDefault();
    view("jobs");
    setTimeout(() => {
      const titleInput = document.getElementById("job-title");
      if (titleInput) {
        titleInput.focus();
        titleInput.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 250);
    if (window.ui && window.ui.toast) window.ui.toast("Crear nueva vacante (formulario activo)", { duration: 2000 });
    return;
  } else if (key === "?") {
    e.preventDefault();
    if (window.ui && window.ui.toast) {
      window.ui.toast("Atajos: G+H Inicio · G+P Pipeline · G+V Vacantes · G+C Candidatos · N Nueva vacante · / Buscar", { duration: 6000 });
    }
    return;
  }
});


/* ==========================================================================
   FUNCIONES OFICIALES DISEÑO PDF (SCREEN 2, 3 Y 4)
   ========================================================================== */

let currentApprovalApp = null;
let currentApprovalDocCategory = "bancaria";
let currentApprovalDocName = "Certificado Apertura Cuenta Davivienda *";

function renderProcesosDeSeleccion(applications = [], vacancies = []) {
  const totalUsers = new Set(applications.map((a) => a.email || a.id)).size || 1;
  const totalDocs = Math.max(25, applications.length * 3);
  const approvedCount = 25;
  const inReviewCount = applications.filter((a) => a.status === "en_revision" || a.status === "recibida").length || 0;
  const rejectedCount = applications.filter((a) => a.status === "rechazada").length || 0;
  const subsanadosCount = 0;

  const vacancyOptions = [
    `<option value="">Todos los procesos</option>`,
    `<option value="aspirante_docente">Aspirante: Nuevo a docente cátedra</option>`,
    ...vacancies.map((v) => `<option value="${escapeHtml(v.id)}">${escapeHtml(v.title)}</option>`)
  ].join("");

  return `
    <div class="pdf-process-header">
      <div class="pdf-process-header-icon">
        <i data-lucide="folder-check"></i>
      </div>
      <div>
        <h1 class="pdf-process-header-title">Gestión de Contratación de Seleccionados</h1>
        <p class="pdf-process-header-sub">Administra tus documentos por proceso</p>
      </div>
    </div>

    <!-- 6 Metric Cards Row (PDF Screen 3) -->
    <div class="pdf-metric-cards-row">
      <div class="pdf-stat-card">
        <div>
          <div class="pdf-stat-number">${totalUsers}</div>
          <div class="pdf-stat-text">Usuarios</div>
        </div>
        <div class="pdf-stat-icon-wrap pdf-stat-icon-gray">
          <i data-lucide="users"></i>
        </div>
      </div>

      <div class="pdf-stat-card">
        <div>
          <div class="pdf-stat-number">${totalDocs}</div>
          <div class="pdf-stat-text">Documentos</div>
        </div>
        <div class="pdf-stat-icon-wrap pdf-stat-icon-gray">
          <i data-lucide="folder"></i>
        </div>
      </div>

      <div class="pdf-stat-card">
        <div>
          <div class="pdf-stat-number" style="color: #15803d;">${approvedCount}</div>
          <div class="pdf-stat-text">Aprobados</div>
        </div>
        <div class="pdf-stat-icon-wrap pdf-stat-icon-green">
          <i data-lucide="check-circle-2"></i>
        </div>
      </div>

      <div class="pdf-stat-card">
        <div>
          <div class="pdf-stat-number" style="color: #d97706;">${inReviewCount}</div>
          <div class="pdf-stat-text">Pendientes Revisión</div>
        </div>
        <div class="pdf-stat-icon-wrap pdf-stat-icon-amber">
          <i data-lucide="clock"></i>
        </div>
      </div>

      <div class="pdf-stat-card">
        <div>
          <div class="pdf-stat-number" style="color: #dc2626;">${rejectedCount}</div>
          <div class="pdf-stat-text">Rechazados</div>
        </div>
        <div class="pdf-stat-icon-wrap pdf-stat-icon-red">
          <i data-lucide="x-circle"></i>
        </div>
      </div>

      <div class="pdf-stat-card">
        <div>
          <div class="pdf-stat-number" style="color: #d97706;">${subsanadosCount}</div>
          <div class="pdf-stat-text">Subsanados</div>
        </div>
        <div class="pdf-stat-icon-wrap pdf-stat-icon-amber">
          <i data-lucide="refresh-cw"></i>
        </div>
      </div>
    </div>

    <!-- Dark Slate Filter Box (PDF Screen 3) -->
    <div class="pdf-filter-container">
      <div class="pdf-filter-header">
        <i data-lucide="file-text" style="width: 16px; height: 16px; color: #86efac;"></i>
        <span>Mis Documentos por Proceso</span>
        <span class="pdf-filter-badge" id="pdf-filter-count">${applications.length || 1}</span>
      </div>

      <!-- Fila 1 de Filtros -->
      <div class="pdf-filter-row-1">
        <select id="pdf-proc-select" class="pdf-filter-select" onchange="filterProcesosTable()">
          ${vacancyOptions}
        </select>

        <select id="pdf-unit-select" class="pdf-filter-select" onchange="filterProcesosTable()">
          <option value="">Todas las unidades</option>
          <option value="Facultad de Educación y Ciencias Sociales">Facultad de Educación y Ciencias Sociales</option>
          <option value="Facultad de Ingeniería">Facultad de Ingeniería</option>
          <option value="Facultad de Ciencias Administrativas">Facultad de Ciencias Administrativas</option>
        </select>

        <select id="pdf-state-select" class="pdf-filter-select" onchange="filterProcesosTable()">
          <option value="">Estado proceso</option>
          <option value="activo">Activo</option>
          <option value="finalizado">Finalizado</option>
        </select>

        <select class="pdf-filter-select" onchange="filterProcesosTable()">
          <option>Contratación de Seleccionados</option>
          <option>Preselección Técnica</option>
          <option>Entrevista con Decano</option>
        </select>

        <button type="button" class="pdf-filter-btn-green" onclick="resetProcesosFilters()" title="Refrescar filtros">
          <i data-lucide="refresh-cw" style="width: 15px; height: 15px;"></i>
        </button>
      </div>

      <!-- Fila 2 de Filtros -->
      <div class="pdf-filter-row-2">
        <input
          type="text"
          id="pdf-user-search-input"
          class="pdf-filter-input"
          placeholder="Buscar usuario..."
          oninput="filterProcesosTable()"
        />

        <select class="pdf-filter-select" id="pdf-incompleto-select" onchange="filterProcesosTable()">
          <option value="">Incompleto</option>
          <option value="completo">Completo</option>
          <option value="todos">Todos</option>
        </select>

        <select class="pdf-filter-select" id="pdf-estados-re-select" onchange="filterProcesosTable()">
          <option value="">Estados de Re...</option>
          <option value="revisado">Revisado</option>
          <option value="pendiente">Pendiente</option>
        </select>

        <!-- Dropdown con opciones exactas visibles en Screen 3 -->
        <select class="pdf-filter-select" id="pdf-doc-charge-select" onchange="filterProcesosTable()">
          <option value="">Estado carga de codumentos</option>
          <option value="carga_completa">Carga completa</option>
          <option value="carga_incompleta">Carga incompleta</option>
          <option value="estado_contratacion">Estado de contratación</option>
          <option value="en_formalizacion">En Formalización</option>
          <option value="contratado">Contratado</option>
        </select>

        <select class="pdf-filter-select" id="pdf-ver-select" onchange="filterProcesosTable()">
          <option value="todos">Ver: Todos</option>
          <option value="activos">Ver: Activos</option>
          <option value="archivados">Ver: Archivados</option>
        </select>

        <button type="button" class="pdf-filter-btn-autorizados" onclick="openReportModal()">
          <i data-lucide="check-square" style="width: 14px; height: 14px; color: #22c55e;"></i>
          <span>Autorizados</span>
        </button>
      </div>
    </div>

    <!-- Tabla Interactiva (PDF Screen 3) -->
    <div class="pdf-table-wrapper">
      <table class="pdf-table" id="pdf-procesos-table">
        <thead>
          <tr>
            <th>USUARIO</th>
            <th>PROCESO</th>
            <th>CARGADOS</th>
            <th>APROBADOS</th>
            <th>PENDIENTES POR REVISIÓN</th>
            <th>RECHAZADOS</th>
            <th style="text-align: center;">ACCIÓN</th>
          </tr>
        </thead>
        <tbody id="pdf-procesos-tbody">
          ${renderProcesosRows(applications)}
        </tbody>
      </table>
      <div id="pdf-empty-state" class="pdf-empty-box" style="display: none;">
        <i data-lucide="folder-search" style="width: 48px; height: 48px; color: #94a3b8; stroke-width: 1.5; margin-bottom: 12px;"></i>
        <h4>No hay registros</h4>
        <p>No se encontraron registros con los filtros aplicados</p>
      </div>
    </div>
  `;
}

function renderProcesosRows(applications = []) {
  if (!applications || !applications.length) {
    // Fila de referencia idéntica al PDF Screen 2 & 3
    return `
      <tr class="pdf-proceso-row" data-name="aspirante nuevo a docente catedra" data-email="docente@institucion.edu.co" data-process="aspirante nuevo a docente catedra" data-unit="Facultad de Educación y Ciencias Sociales" data-state="activo">
        <td>
          <div class="pdf-user-cell">
            ${getDynamicAvatar("Aspirante Docente", 34)}
            <div>
              <b style="font-size: 13.5px; color: var(--rp-text);">Aspirante: Nuevo a docente cátedra</b>
              <div style="font-size: 11.5px; color: var(--rp-text-muted);">docente@institucion.edu.co</div>
            </div>
          </div>
        </td>
        <td>
          <div class="pdf-proceso-cell">
            <span class="pdf-proceso-title">Aspirante: Nuevo a docente cátedra</span>
            <span class="pdf-proceso-sub">Facultad de Educación y Ciencias Sociales</span>
            <span class="pdf-pill-activo">Activo</span>
          </div>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">
            <span class="pdf-pill-cargados">22/22</span>
            <span class="pdf-pill-contratado">Contratado</span>
          </div>
        </td>
        <td>
          <span class="pdf-pill-aprobados">22</span>
        </td>
        <td style="color: var(--rp-text-muted); font-size: 13px; font-weight: 600;">0</td>
        <td style="color: var(--rp-text-muted); font-size: 13px; font-weight: 600;">0</td>
        <td style="text-align: center;">
          <button type="button" class="pdf-action-btn" onclick="openPdfApprovalDialog('demo-app-1')" title="Revisar expediente y documentos">
            <i data-lucide="eye"></i>
          </button>
        </td>
      </tr>
    `;
  }

  return applications.map((app) => {
    const candidateName = escapeHtml(app.name || app.candidateName || "Aspirante");
    const candidateEmail = escapeHtml(app.email || "");
    const vacancyTitle = escapeHtml(app.vacancyTitle || "Aspirante: Nuevo a docente cátedra");
    const faculty = "Facultad de Educación y Ciencias Sociales";
    const isOferta = app.status === "oferta";

    return `
      <tr class="pdf-proceso-row" data-name="${candidateName.toLowerCase()}" data-email="${candidateEmail.toLowerCase()}" data-process="${vacancyTitle.toLowerCase()}" data-unit="Facultad de Educación y Ciencias Sociales" data-state="${app.status || 'activo'}">
        <td>
          <div class="pdf-user-cell">
            ${getDynamicAvatar(candidateName, 34)}
            <div>
              <b style="font-size: 13.5px; color: var(--rp-text);">${candidateName}</b>
              <div style="font-size: 11.5px; color: var(--rp-text-muted);">${candidateEmail}</div>
            </div>
          </div>
        </td>
        <td>
          <div class="pdf-proceso-cell">
            <span class="pdf-proceso-title">${vacancyTitle}</span>
            <span class="pdf-proceso-sub">${faculty}</span>
            <span class="pdf-pill-activo">Activo</span>
          </div>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">
            <span class="pdf-pill-cargados">22/22</span>
            <span class="pdf-pill-contratado">${isOferta ? "Contratado" : "En Formalización"}</span>
          </div>
        </td>
        <td>
          <span class="pdf-pill-aprobados">22</span>
        </td>
        <td style="color: var(--rp-text-muted); font-size: 13px; font-weight: 600;">${app.status === 'en_revision' ? 1 : 0}</td>
        <td style="color: var(--rp-text-muted); font-size: 13px; font-weight: 600;">${app.status === 'rechazada' ? 1 : 0}</td>
        <td style="text-align: center;">
          <button type="button" class="pdf-action-btn" onclick="openPdfApprovalDialog('${escapeHtml(app.id)}')" title="Revisar expediente y documentos">
            <i data-lucide="eye"></i>
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

function filterProcesosTable() {
  const query = (document.getElementById("pdf-user-search-input")?.value || "").trim().toLowerCase();
  const unit = (document.getElementById("pdf-unit-select")?.value || "").toLowerCase();
  const proc = (document.getElementById("pdf-proc-select")?.value || "").toLowerCase();
  const charge = (document.getElementById("pdf-doc-charge-select")?.value || "").toLowerCase();

  const rows = document.querySelectorAll(".pdf-proceso-row");
  let visibleCount = 0;

  rows.forEach((row) => {
    const name = row.dataset.name || "";
    const email = row.dataset.email || "";
    const process = row.dataset.process || "";
    const rowUnit = (row.dataset.unit || "").toLowerCase();

    let match = true;
    if (query && !name.includes(query) && !email.includes(query) && !process.includes(query)) {
      match = false;
    }
    if (unit && !rowUnit.includes(unit)) {
      match = false;
    }
    if (proc && !process.includes(proc)) {
      match = false;
    }

    row.style.display = match ? "" : "none";
    if (match) visibleCount++;
  });

  const emptyBox = document.getElementById("pdf-empty-state");
  const countBadge = document.getElementById("pdf-filter-count");
  if (emptyBox) emptyBox.style.display = visibleCount === 0 ? "block" : "none";
  if (countBadge) countBadge.textContent = visibleCount;
}

function resetProcesosFilters() {
  const search = document.getElementById("pdf-user-search-input");
  const unit = document.getElementById("pdf-unit-select");
  const proc = document.getElementById("pdf-proc-select");
  const state = document.getElementById("pdf-state-select");
  const charge = document.getElementById("pdf-doc-charge-select");

  if (search) search.value = "";
  if (unit) unit.value = "";
  if (proc) proc.value = "";
  if (state) state.value = "";
  if (charge) charge.value = "";

  filterProcesosTable();
  if (typeof window.ui !== "undefined" && window.ui.toast) {
    window.ui.toast("Filtros restablecidos", { type: "info" });
  }
}

/* ==========================================================================
   INTEGRACIÓN CECAR: CATÁLOGOS, HOJA DE VIDA, REVISIÓN, SUBSANACIÓN,
   REPORTES ESPECIALIZADOS Y MESA DE AYUDAS (RF-001 A RF-106)
   ========================================================================== */

let catalogosCache = null;
let currentApprovalAppId = null;
let currentApprovalDossier = null;
let currentApprovalItemId = null;
let currentCandidateAppId = null;
let currentCandidateDossier = null;
let currentReportType = "no_aprobados";
let currentTicketList = [];
let currentOpenTicket = null;

async function ensureCatalogos() {
  if (catalogosCache) return catalogosCache;
  try {
    const res = await apiRequest("/api/catalogos");
    catalogosCache = await res.json();

    // Llenar selectores institucionales en reportes
    populateSelectOptions("report-filter-faculty", catalogosCache.facultades || [], "Todas las facultades");
    populateSelectOptions("report-filter-program", catalogosCache.programas || [], "Todos los programas");
    populateSelectOptions("report-filter-campus", catalogosCache.sedes || [], "Todas las sedes");
    populateSelectOptions("report-filter-period", catalogosCache.periodos_academicos || [], "Todos los periodos");

    // Llenar selector de motivos de descarte
    const discardSelect = document.getElementById("discard-reason-select");
    if (discardSelect && catalogosCache.motivos_descarte) {
      discardSelect.innerHTML = catalogosCache.motivos_descarte
        .map((m) => `<option value="${escapeHtml(m.id)}">[${escapeHtml(m.code)}] ${escapeHtml(m.name)}</option>`)
        .join("");
    }
  } catch (err) {
    console.error("Error cargando catálogos CECAR:", err);
  }
  return catalogosCache;
}

function populateSelectOptions(elemId, list, defaultLabel) {
  const el = document.getElementById(elemId);
  if (!el) return;
  el.innerHTML = `<option value="">${escapeHtml(defaultLabel)}</option>` +
    list.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join("");
}

/* ==========================================================================
   GESTOR DE HOJA DE VIDA POR ÍTEMS Y SOPORTES INDEPENDIENTES (CANDIDATO)
   ========================================================================== */

function renderCecarHvBuilder(dossier, vacancy) {
  const appData = dossier.application || {};
  const items = dossier.items || [];
  const status = appData.status || "borrador";
  const progress = appData.progress_percentage || 0;
  const isSubsanacion = status === "subsanacion_requerida";
  const isReadOnly = !["borrador", "subsanacion_requerida"].includes(status);
  const latestSubsanacion = dossier.latest_subsanacion || {};

  const sections = [
    { key: "datos_personales", title: "1. Datos Personales e Identificación", icon: "user", types: ["HV-001", "HV-002", "HV-003", "HV-004", "HV-005"] },
    { key: "formacion", title: "2. Formación Académica y Títulos", icon: "graduation-cap", types: ["HV-006", "HV-007", "HV-008", "HV-009", "HV-010", "HV-011"] },
    { key: "experiencia", title: "3. Experiencia Laboral y Docencia", icon: "briefcase", types: ["HV-012", "HV-013", "HV-014", "HV-015"] },
    { key: "produccion", title: "4. Producción Intelectual e Idiomas", icon: "book-open", types: ["HV-016", "HV-017", "HV-018", "HV-019"] },
    { key: "certificaciones", title: "5. Certificaciones y Distinciones", icon: "award", types: ["HV-020", "HV-021"] },
    { key: "institucionales", title: "6. Requisitos Institucionales y Contratación", icon: "file-check-2", types: ["HV-022", "HV-023", "HV-024", "HV-025", "HV-026"] },
  ];

  let subsanacionBannerHtml = "";
  if (isSubsanacion) {
    let deadlineStr = "Plazo en curso";
    if (appData.subsanacion_deadline) {
      try {
        deadlineStr = new Date(appData.subsanacion_deadline).toLocaleString("es");
      } catch (e) {}
    }
    subsanacionBannerHtml = `
      <div class="cecar-subsanacion-banner">
        <div class="cecar-subsanacion-header">
          <i data-lucide="alert-triangle" style="width: 24px; height: 24px; color: #b45309;"></i>
          <div>
            <h3 class="cecar-subsanacion-title">Subsanación Documental Requerida</h3>
            <span class="cecar-countdown-badge"><i data-lucide="clock" style="width: 14px; height: 14px;"></i> Plazo límite: ${escapeHtml(deadlineStr)}</span>
          </div>
        </div>
        <p style="margin: 8px 0; font-size: 13.5px; line-height: 1.5;">
          ${escapeHtml(latestSubsanacion.instructions || "El comité evaluador ha solicitado subsanar soportes documentales específicos.")}
        </p>
        <p style="margin: 4px 0 12px; font-size: 12.5px; color: #92400e; font-weight: 600;">
          📌 Regla Institucional RN-011: Los ítems ya aprobados están bloqueados contra modificación. Solo puedes actualizar los ítems marcados como OBSERVADO.
        </p>
        <button type="button" class="rp-btn" style="background: #b45309; color: #fff; font-weight: 700;" onclick="submitSubsanacionCandidate('${appData.id}')">
          <i data-lucide="send" style="width: 15px; height: 15px;"></i>
          Enviar Subsanación al Comité
        </button>
      </div>
    `;
  }

  return `
    <div class="dash-header-wrap" style="margin-bottom: 20px;">
      <div class="dash-header-main">
        <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 6px;">
          <span class="dash-tag">${escapeHtml(appData.code || vacancy.code || "CONV-CECAR")}</span>
          <span class="cecar-badge-status ${status}">${escapeHtml(statusLabel(status))}</span>
        </div>
        <h1 class="dash-greeting-title" style="font-size: 24px;">${escapeHtml(vacancy.title || "Convocatoria Docente CECAR")}</h1>
        <p class="dash-greeting-sub">
          ${escapeHtml(vacancy.faculty || "Facultad de Educación y Ciencias Sociales")} · ${escapeHtml(vacancy.campus || "Sede Principal Sincelejo")} · Periodo: ${escapeHtml(vacancy.academic_period || "2026-2")}
        </p>
      </div>
      <div class="dash-header-actions">
        <button type="button" class="rp-btn rp-btn--secondary rp-btn--sm" onclick="view('jobs')">
          ← Volver a Convocatorias
        </button>
      </div>
    </div>

    ${subsanacionBannerHtml}

    <!-- Barra de Progreso de Carga Documental (RF-016) -->
    <div class="cecar-progress-card">
      <div class="cecar-progress-top">
        <span style="font-size: 13.5px; font-weight: 700; color: var(--rp-text);">
          Completitud del Expediente Documental (HV-001 a HV-026)
        </span>
        <span style="font-size: 14px; font-weight: 800; color: #15803d;">${progress}%</span>
      </div>
      <div class="cecar-progress-bar-bg">
        <div class="cecar-progress-bar-fill" style="width: ${progress}%;"></div>
      </div>
      <small style="color: var(--rp-text-muted); margin-top: 8px; display: block; font-size: 12px;">
        Cada dato registrado debe estar asociado a su archivo de soporte probatorio independiente (RF-014 a RF-042).
      </small>
    </div>

    <!-- Secciones del Expediente -->
    ${sections.map((sec) => {
      const sectionItems = items.filter((it) => it.section === sec.key || sec.types.includes(it.item_type));
      return `
        <div class="cecar-hv-section">
          <div class="cecar-hv-section-header">
            <h2 class="cecar-hv-section-title">
              <i data-lucide="${sec.icon}" style="width: 18px; height: 18px; color: #16a34a;"></i>
              <span>${sec.title}</span>
            </h2>
            ${!isReadOnly ? `
              <button type="button" class="rp-btn rp-btn--secondary rp-btn--sm" onclick="openAddHvItemModal('${sec.key}')" ${isSubsanacion ? 'disabled title="En subsanación no se permite agregar nuevos ítems (solo corregir observados)"' : ''}>
                <i data-lucide="plus" style="width: 14px; height: 14px;"></i>
                Agregar Ítem
              </button>
            ` : ''}
          </div>

          ${sectionItems.length ? sectionItems.map((item) => renderCandidateItemRow(item, isSubsanacion, isReadOnly)).join("") : `
            <div style="padding: 16px; text-align: center; color: var(--rp-text-muted); font-size: 13px; background: var(--rp-surface-2); border-radius: 8px; border: 1px dashed var(--rp-border);">
              No has registrado información en esta sección.
            </div>
          `}
        </div>
      `;
    }).join("")}

    <!-- Panel de Radicación y Consentimientos (RF-017, RF-040, RN-028) -->
    <div class="cecar-hv-section" style="border: 1px solid #16a34a; background: rgba(22, 163, 74, 0.02);">
      <h3 style="margin: 0 0 12px; font-size: 15px; color: #15803d; font-weight: 800;">
        Declaración, Consentimientos Institucionales y Radicación
      </h3>

      <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;">
        <label style="display: flex; gap: 10px; align-items: flex-start; font-size: 13px; cursor: pointer;">
          <input type="checkbox" id="cecar-is-internal" ${appData.is_internal ? 'checked' : ''} ${isReadOnly ? 'disabled' : ''} style="margin-top: 3px;" />
          <span><b>Soy docente o empleado actual de CECAR</b> (Candidatura interna / Escalafón).</span>
        </label>

        <label style="display: flex; gap: 10px; align-items: flex-start; font-size: 13px; cursor: pointer;">
          <input type="checkbox" id="cecar-talent-bank" ${appData.talent_bank_consent ? 'checked' : ''} ${isReadOnly ? 'disabled' : ''} style="margin-top: 3px;" />
          <span><b>Autorizo conservar mi hoja de vida y soportes en el Banco de Talentos Institucional CECAR</b> para futuras convocatorias según política de protección de datos (RN-028).</span>
        </label>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; border-top: 1px solid var(--rp-border); padding-top: 16px;">
        <div>
          ${appData.application_code ? `
            <div style="font-size: 13px; color: var(--rp-text-muted);">
              Código de Radicación: <b style="color: var(--rp-text); font-family: monospace;">${escapeHtml(appData.application_code)}</b>
            </div>
          ` : ''}
        </div>

        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          ${status === 'borrador' ? `
            <button type="button" class="rp-btn rp-btn--secondary" onclick="window.ui.toast('Borrador guardado automáticamente', { type: 'info' })">
              Guardar Borrador
            </button>
            <button type="button" class="rp-btn rp-btn--primary" style="background: #15803d;" onclick="submitApplicationFormal('${appData.id}')">
              <i data-lucide="check-circle" style="width: 16px; height: 16px;"></i>
              Radicar Postulación Formal
            </button>
          ` : ''}

          ${isSubsanacion ? `
            <button type="button" class="rp-btn" style="background: #b45309; color: #fff; font-weight: 700;" onclick="submitSubsanacionCandidate('${appData.id}')">
              <i data-lucide="send" style="width: 16px; height: 16px;"></i>
              Enviar Subsanación al Comité
            </button>
          ` : ''}

          ${status !== 'borrador' ? `
            <a class="rp-btn rp-btn--secondary" href="/api/applications/${encodeURIComponent(appData.id)}/constancia" target="_blank" style="text-decoration: none;">
              <i data-lucide="download" style="width: 15px; height: 15px;"></i>
              Descargar Constancia de Postulación (PDF)
            </a>
          ` : ''}

          ${!['borrador', 'rechazada', 'retirada', 'vinculada'].includes(status) ? `
            <button type="button" class="rp-btn rp-btn--danger rp-btn--sm" onclick="openWithdrawCandidateModal('${appData.id}')">
              Retirar Candidatura
            </button>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

function renderCandidateItemRow(item, isSubsanacion, isReadOnly) {
  const reviews = currentCandidateDossier?.reviews || [];
  const latestReview = reviews.filter((r) => r.item_id === item.id).pop();
  const itemReviewStatus = latestReview?.decision || "pendiente";
  const isObservado = itemReviewStatus === "observado";
  const isAprobado = itemReviewStatus === "aprobado";
  const isRechazado = itemReviewStatus === "rechazado";

  // Regla RN-011: en subsanación solo los observados se pueden editar/cargar soporte
  const isLockedBySubsanacion = isSubsanacion && !isObservado;

  const support = (currentCandidateDossier?.supports || []).find((s) => s.item_id === item.id);

  return `
    <div class="cecar-item-card ${isObservado ? 'is-observado' : isAprobado ? 'is-aprobado' : isRechazado ? 'is-rechazado' : ''} ${isLockedBySubsanacion ? 'is-locked' : ''}">
      <div style="flex: 1; min-width: 0;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px; flex-wrap: wrap;">
          <span class="cecar-badge-type">${escapeHtml(item.item_type)}</span>
          <span class="cecar-badge-status ${itemReviewStatus}">
            ${itemReviewStatus === 'aprobado' ? '✓ Aprobado' : isObservado ? '⚠️ Observado' : isRechazado ? '✕ Rechazado' : 'Pendiente de Revisión'}
          </span>
          ${isLockedBySubsanacion ? `<span style="font-size: 11px; color: var(--rp-text-muted); font-weight: 600;">🔒 Bloqueado por RN-011</span>` : ''}
        </div>
        <h4 style="margin: 0 0 4px; font-size: 14px; color: var(--rp-text); font-weight: 700;">
          ${escapeHtml(item.title)}
        </h4>
        <div style="font-size: 12.5px; color: var(--rp-text-muted);">
          ${item.data?.institucion ? `<span>${escapeHtml(item.data.institucion)}</span> · ` : ''}
          ${item.data?.ano ? `<span>Año: ${escapeHtml(String(item.data.ano))}</span>` : ''}
        </div>

        ${isObservado && latestReview?.reason ? `
          <div style="margin-top: 8px; padding: 8px 12px; background: #fef3c7; border: 1px solid #fde68a; border-radius: 6px; color: #92400e; font-size: 12px;">
            <b>Observación del Revisor:</b> ${escapeHtml(latestReview.reason)}
          </div>
        ` : ''}

        ${isRechazado && latestReview?.reason ? `
          <div style="margin-top: 8px; padding: 8px 12px; background: #fee2e2; border: 1px solid #fca5a5; border-radius: 6px; color: #991b1b; font-size: 12px;">
            <b>Motivo de Rechazo:</b> ${escapeHtml(latestReview.reason)}
          </div>
        ` : ''}
      </div>

      <!-- Soportes y Acciones del Ítem -->
      <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px; flex-shrink: 0;">
        ${support ? `
          <div style="display: flex; align-items: center; gap: 6px;">
            <a class="kanban-action-btn" href="/api/applications/${encodeURIComponent(currentCandidateAppId)}/items/${encodeURIComponent(item.id)}/support/view" target="_blank" style="text-decoration: none; font-size: 11.5px; padding: 4px 10px;" title="Ver soporte digital">
              <i data-lucide="eye" style="width: 13px; height: 13px;"></i> Ver Soporte
            </a>
            <a class="kanban-action-btn" href="/api/applications/${encodeURIComponent(currentCandidateAppId)}/items/${encodeURIComponent(item.id)}/support/download" download style="text-decoration: none; font-size: 11.5px; padding: 4px 10px;" title="Descargar">
              <i data-lucide="download" style="width: 13px; height: 13px;"></i>
            </a>
          </div>
        ` : `
          <span style="font-size: 11.5px; color: #dc2626; font-weight: 600;">Sin soporte adjunto</span>
        `}

        ${(!isReadOnly || (isSubsanacion && isObservado)) ? `
          <div style="display: flex; gap: 6px;">
            <label class="rp-btn rp-btn--sm" style="cursor: ${isLockedBySubsanacion ? 'not-allowed' : 'pointer'}; background: var(--rp-surface); border: 1px solid var(--rp-border); font-size: 11.5px; padding: 4px 10px;" title="${isLockedBySubsanacion ? 'Bloqueado por regla RN-011' : 'Subir o reemplazar soporte'}">
              <i data-lucide="upload" style="width: 12px; height: 12px;"></i> ${support ? 'Reemplazar' : 'Subir Soporte'}
              <input type="file" accept=".pdf,.png,.jpg,.jpeg" style="display: none;" ${isLockedBySubsanacion ? 'disabled' : ''} onchange="handleUploadItemSupport('${item.id}', this)" />
            </label>
            ${!isSubsanacion ? `
              <button type="button" class="rp-btn rp-btn--ghost rp-btn--sm" style="color: #dc2626; padding: 4px 6px;" onclick="deleteCandidateItem('${item.id}')" title="Eliminar ítem">
                <i data-lucide="trash-2" style="width: 13px; height: 13px;"></i>
              </button>
            ` : ''}
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function openAddHvItemModal(sectionKey) {
  const dialog = document.getElementById("candidate-item-dialog");
  if (!dialog) return;
  document.getElementById("hv-item-id").value = "";
  document.getElementById("hv-item-section").value = sectionKey;
  document.getElementById("hv-item-title").value = "";
  document.getElementById("hv-item-inst").value = "";
  document.getElementById("hv-item-year").value = "";
  document.getElementById("hv-item-file").value = "";

  const typeSelect = document.getElementById("hv-item-type");
  const catalog = catalogosCache?.tipos_items_hv || [];
  const filtered = catalog.filter((t) => t.seccion === sectionKey || !t.seccion);

  typeSelect.innerHTML = (filtered.length ? filtered : catalog)
    .map((t) => `<option value="${escapeHtml(t.id)}">[${escapeHtml(t.id)}] ${escapeHtml(t.nombre)}</option>`)
    .join("");

  dialog.showModal();
}

function closeCandidateItemModal() {
  const dialog = document.getElementById("candidate-item-dialog");
  if (dialog) dialog.close();
}

async function handleSaveCandidateItem(event) {
  event.preventDefault();
  const section = document.getElementById("hv-item-section").value;
  const itemType = document.getElementById("hv-item-type").value;
  const title = document.getElementById("hv-item-title").value.trim();
  const inst = document.getElementById("hv-item-inst").value.trim();
  const year = document.getElementById("hv-item-year").value.trim();
  const fileInput = document.getElementById("hv-item-file");

  try {
    const res = await apiRequest(`/api/applications/${encodeURIComponent(currentCandidateAppId)}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item_type: itemType,
        section: section,
        title: title,
        data: { institucion: inst, ano: year },
      }),
    });
    const newItem = await res.json();

    if (fileInput.files.length) {
      const fd = new FormData();
      fd.append("file", fileInput.files[0]);
      await apiRequest(`/api/applications/${encodeURIComponent(currentCandidateAppId)}/items/${encodeURIComponent(newItem.id)}/support`, {
        method: "POST",
        body: fd,
      });
    }

    closeCandidateItemModal();
    window.ui.toast("Ítem guardado con éxito", { type: "success" });

    // Recargar expediente
    const dossierRes = await apiRequest(`/api/applications/${encodeURIComponent(currentCandidateAppId)}/dossier`);
    currentCandidateDossier = await dossierRes.json();
    const vacancy = vacanciesCache.find((v) => v.id === currentCandidateDossier.application?.vacancy_id) || {};
    document.getElementById("app").innerHTML = renderCecarHvBuilder(currentCandidateDossier, vacancy);
    if (window.ui && window.ui.refreshIcons) window.ui.refreshIcons();
  } catch (err) {
    console.error("Error guardando ítem:", err);
    window.ui.toast(err.message, { type: "error" });
  }
}

async function deleteCandidateItem(itemId) {
  if (!confirm("¿Deseas eliminar este ítem y su soporte adjunto?")) return;
  try {
    await apiRequest(`/api/applications/${encodeURIComponent(currentCandidateAppId)}/items/${encodeURIComponent(itemId)}`, {
      method: "DELETE",
    });
    window.ui.toast("Ítem eliminado", { type: "info" });
    const dossierRes = await apiRequest(`/api/applications/${encodeURIComponent(currentCandidateAppId)}/dossier`);
    currentCandidateDossier = await dossierRes.json();
    const vacancy = vacanciesCache.find((v) => v.id === currentCandidateDossier.application?.vacancy_id) || {};
    document.getElementById("app").innerHTML = renderCecarHvBuilder(currentCandidateDossier, vacancy);
    if (window.ui && window.ui.refreshIcons) window.ui.refreshIcons();
  } catch (err) {
    window.ui.toast(err.message, { type: "error" });
  }
}

async function handleUploadItemSupport(itemId, input) {
  if (!input.files || !input.files.length) return;
  const file = input.files[0];
  const fd = new FormData();
  fd.append("file", file);

  try {
    await apiRequest(`/api/applications/${encodeURIComponent(currentCandidateAppId)}/items/${encodeURIComponent(itemId)}/support`, {
      method: "POST",
      body: fd,
    });
    window.ui.toast(`Soporte "${file.name}" cargado con éxito`, { type: "success" });
    const dossierRes = await apiRequest(`/api/applications/${encodeURIComponent(currentCandidateAppId)}/dossier`);
    currentCandidateDossier = await dossierRes.json();
    const vacancy = vacanciesCache.find((v) => v.id === currentCandidateDossier.application?.vacancy_id) || {};
    document.getElementById("app").innerHTML = renderCecarHvBuilder(currentCandidateDossier, vacancy);
    if (window.ui && window.ui.refreshIcons) window.ui.refreshIcons();
  } catch (err) {
    window.ui.toast(err.message, { type: "error" });
  }
}

async function submitApplicationFormal(appId) {
  const isInternal = document.getElementById("cecar-is-internal")?.checked || false;
  const talentConsent = document.getElementById("cecar-talent-bank")?.checked || false;

  try {
    const res = await apiRequest(`/api/applications/${encodeURIComponent(appId)}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        talent_bank_consent: talentConsent,
        is_internal: isInternal,
      }),
    });
    const data = await res.json();

    if (typeof confetti === "function") {
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    }
    window.ui.toast(`¡Postulación radicada con éxito! Radicado: ${data.applicationCode || 'CONV-CECAR'}`, { type: "success" });

    // Recargar vista
    const dossierRes = await apiRequest(`/api/applications/${encodeURIComponent(appId)}/dossier`);
    currentCandidateDossier = await dossierRes.json();
    const vacancy = vacanciesCache.find((v) => v.id === currentCandidateDossier.application?.vacancy_id) || {};
    document.getElementById("app").innerHTML = renderCecarHvBuilder(currentCandidateDossier, vacancy);
    if (window.ui && window.ui.refreshIcons) window.ui.refreshIcons();
  } catch (err) {
    window.ui.toast(err.message, { type: "error" });
  }
}

async function submitSubsanacionCandidate(appId) {
  if (!confirm("¿Deseas enviar los soportes subsanados para una nueva revisión del comité?")) return;
  try {
    const res = await apiRequest(`/api/applications/${encodeURIComponent(appId)}/subsanacion/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "Soportes observados corregidos por el aspirante." }),
    });
    window.ui.toast("Subsanación entregada correctamente. Tu expediente está en revisión.", { type: "success" });

    const dossierRes = await apiRequest(`/api/applications/${encodeURIComponent(appId)}/dossier`);
    currentCandidateDossier = await dossierRes.json();
    const vacancy = vacanciesCache.find((v) => v.id === currentCandidateDossier.application?.vacancy_id) || {};
    document.getElementById("app").innerHTML = renderCecarHvBuilder(currentCandidateDossier, vacancy);
    if (window.ui && window.ui.refreshIcons) window.ui.refreshIcons();
  } catch (err) {
    window.ui.toast(err.message, { type: "error" });
  }
}

function openWithdrawCandidateModal(appId) {
  currentCandidateAppId = appId;
  const dialog = document.getElementById("withdraw-candidate-dialog");
  if (dialog) dialog.showModal();
}

function closeWithdrawCandidateModal() {
  const dialog = document.getElementById("withdraw-candidate-dialog");
  if (dialog) dialog.close();
}

async function handleConfirmWithdraw(event) {
  event.preventDefault();
  const reason = document.getElementById("withdraw-reason").value.trim();
  try {
    await apiRequest(`/api/applications/${encodeURIComponent(currentCandidateAppId)}/retirar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    closeWithdrawCandidateModal();
    window.ui.toast("Candidatura retirada formalmente (RN-004)", { type: "info" });
    await view("applications");
  } catch (err) {
    window.ui.toast(err.message, { type: "error" });
  }
}

/* ==========================================================================
   VISOR Y APROBACIÓN DE DOCUMENTOS (REVISOR / TALENTO HUMANO RF-043 - RF-053)
   ========================================================================== */

async function openPdfApprovalDialog(appId) {
  const dialog = document.getElementById("pdf-document-approval-dialog");
  if (!dialog) return;

  currentApprovalAppId = appId;
  await ensureCatalogos();

  try {
    const res = await apiRequest(`/api/applications/${encodeURIComponent(appId)}/dossier`);
    currentApprovalDossier = await res.json();
  } catch (err) {
    console.error("Error cargando expediente:", err);
    window.ui.toast("No se pudo cargar el expediente", { type: "error" });
    return;
  }

  const appData = currentApprovalDossier.application || {};
  const candName = appData.candidateName || appData.name || "Aspirante";
  const candEmail = appData.candidateEmail || appData.email || "";

  document.getElementById("pdf-doc-view-title").textContent = appData.vacancyTitle || "Expediente de Selección";
  document.getElementById("pdf-doc-view-candidate").textContent = `${candName} · ${candEmail}`;

  const stageBadge = document.getElementById("pdf-doc-stage-badge");
  if (stageBadge) {
    stageBadge.className = `cecar-badge-status ${appData.status || 'pendiente'}`;
    stageBadge.textContent = `Estado: ${statusLabel(appData.status || 'recibida')}`;
  }

  const progressBadge = document.getElementById("pdf-doc-progress-badge");
  if (progressBadge) {
    progressBadge.textContent = `Carga: ${appData.progress_percentage || 0}%`;
  }

  renderApprovalAccordionDossier(currentApprovalDossier);

  // Seleccionar primer ítem por defecto
  const items = currentApprovalDossier.items || [];
  if (items.length) {
    selectApprovalDocItem(items[0].id);
  } else {
    document.getElementById("pdf-approval-doc-frame").srcdoc = "<p style='padding:40px; font-family:sans-serif;'>Este aspirante aún no tiene ítems registrados.</p>";
  }

  dialog.showModal();
  if (window.ui && window.ui.refreshIcons) window.ui.refreshIcons();
}

function closePdfApprovalDialog() {
  const dialog = document.getElementById("pdf-document-approval-dialog");
  if (dialog) dialog.close();
  const frame = document.getElementById("pdf-approval-doc-frame");
  if (frame) frame.removeAttribute("src");
}

function renderApprovalAccordionDossier(dossier) {
  const listEl = document.getElementById("pdf-doc-accordion-list");
  if (!listEl) return;

  const items = dossier.items || [];
  const reviews = dossier.reviews || [];

  const categories = [
    { id: "formacion", title: "Formación Académica", icon: "graduation-cap", types: ["HV-006", "HV-007", "HV-008", "HV-009", "HV-010", "HV-011"] },
    { id: "experiencia", title: "Experiencia Laboral", icon: "briefcase", types: ["HV-012", "HV-013", "HV-014", "HV-015"] },
    { id: "personal", title: "Identificación y Personal", icon: "user", types: ["HV-001", "HV-002", "HV-003", "HV-004", "HV-005"] },
    { id: "produccion", title: "Producción e Idiomas", icon: "book-open", types: ["HV-016", "HV-017", "HV-018", "HV-019"] },
    { id: "certificaciones", title: "Certificaciones", icon: "award", types: ["HV-020", "HV-021"] },
    { id: "institucionales", title: "Requisitos y Contratación", icon: "file-check-2", types: ["HV-022", "HV-023", "HV-024", "HV-025", "HV-026"], expanded: true },
  ];

  listEl.innerHTML = categories.map((cat) => {
    const catItems = items.filter((it) => it.section === cat.id || cat.types.includes(it.item_type));
    const isExpanded = cat.expanded || catItems.length > 0;

    return `
      <div class="pdf-accordion-item" data-category="${cat.id}">
        <button type="button" class="pdf-accordion-btn ${isExpanded ? 'expanded' : ''}" onclick="toggleApprovalCategory(this)">
          <div style="display: flex; align-items: center; gap: 7px;">
            <i data-lucide="${cat.icon}" style="width: 14px; height: 14px; color: #15803d;"></i>
            <span>${cat.title}</span>
          </div>
          <span class="pdf-accordion-badge">${catItems.length}</span>
        </button>
        <div class="pdf-accordion-subitems" style="display: ${isExpanded ? 'block' : 'none'};">
          ${catItems.length ? catItems.map((it) => {
            const rev = reviews.filter((r) => r.item_id === it.id).pop();
            const dec = rev?.decision || "pendiente";
            const isSelected = currentApprovalItemId === it.id;
            return `
              <div
                class="pdf-doc-subitem ${isSelected ? 'active' : ''}"
                onclick="selectApprovalDocItem('${escapeHtml(it.id)}')"
                data-item-id="${escapeHtml(it.id)}"
                data-status="${dec}"
              >
                <div style="min-width: 0;">
                  <div style="font-weight: 600; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${escapeHtml(it.title)}
                  </div>
                  <small style="font-size: 10.5px; color: #64748b;">${escapeHtml(it.item_type)}</small>
                </div>
                <span class="cecar-badge-status ${dec}" style="font-size: 10px; padding: 2px 6px;">
                  ${dec === 'aprobado' ? '✓' : dec === 'observado' ? '⚠️' : dec === 'rechazado' ? '✕' : '•'}
                </span>
              </div>
            `;
          }).join("") : `
            <div style="padding: 6px 12px; font-size: 11px; color: #94a3b8;">Sin ítems registrados</div>
          `}
        </div>
      </div>
    `;
  }).join("");

  if (window.ui && window.ui.refreshIcons) window.ui.refreshIcons(listEl);
}

function selectApprovalDocItem(itemId) {
  currentApprovalItemId = itemId;
  const items = currentApprovalDossier?.items || [];
  const item = items.find((it) => it.id === itemId);
  if (!item) return;

  document.querySelectorAll(".pdf-doc-subitem").forEach((el) => {
    el.classList.toggle("active", el.dataset.itemId === itemId);
  });

  const frame = document.getElementById("pdf-approval-doc-frame");
  const downloadLink = document.getElementById("pdf-approval-doc-download");

  const support = (currentApprovalDossier?.supports || []).find((s) => s.item_id === itemId);

  if (support) {
    frame.src = `/api/applications/${encodeURIComponent(currentApprovalAppId)}/items/${encodeURIComponent(itemId)}/support/view`;
    if (downloadLink) {
      downloadLink.href = `/api/applications/${encodeURIComponent(currentApprovalAppId)}/items/${encodeURIComponent(itemId)}/support/download`;
    }
  } else {
    frame.srcdoc = `
      <div style="padding: 40px; font-family: 'Plus Jakarta Sans', sans-serif; color: #1e293b;">
        <h3 style="color: #15803d; margin-top:0;">[${escapeHtml(item.item_type)}] ${escapeHtml(item.title)}</h3>
        <p><b>Institución:</b> ${escapeHtml(item.data?.institucion || 'No especificada')}</p>
        <p><b>Año:</b> ${escapeHtml(String(item.data?.ano || ''))}</p>
        <div style="margin-top: 24px; padding: 14px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #991b1b; font-size: 13px;">
          ⚠️ El aspirante registró este ítem sin adjuntar archivo de soporte digital probatorio.
        </div>
      </div>
    `;
    if (downloadLink) downloadLink.removeAttribute("href");
  }
}

async function approveCurrentCandidateDoc() {
  if (!currentApprovalAppId || !currentApprovalItemId) return;
  try {
    await apiRequest(`/api/applications/${encodeURIComponent(currentApprovalAppId)}/items/${encodeURIComponent(currentApprovalItemId)}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "aprobado", comments: "Documento verificado y cumple especificación CECAR" }),
    });
    window.ui.toast("Ítem aprobado con éxito", { type: "success" });
    const res = await apiRequest(`/api/applications/${encodeURIComponent(currentApprovalAppId)}/dossier`);
    currentApprovalDossier = await res.json();
    renderApprovalAccordionDossier(currentApprovalDossier);
  } catch (err) {
    window.ui.toast(err.message, { type: "error" });
  }
}

async function subsanarCurrentCandidateDoc() {
  if (!currentApprovalAppId || !currentApprovalItemId) return;
  const reason = prompt("Indica el motivo de la observación para subsanación (obligatorio):", "Soporte ilegible o no corresponde al título");
  if (!reason || !reason.trim()) return;

  try {
    await apiRequest(`/api/applications/${encodeURIComponent(currentApprovalAppId)}/items/${encodeURIComponent(currentApprovalItemId)}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "observado", reason: reason.trim() }),
    });
    window.ui.toast("Ítem marcado como OBSERVADO", { type: "info" });
    const res = await apiRequest(`/api/applications/${encodeURIComponent(currentApprovalAppId)}/dossier`);
    currentApprovalDossier = await res.json();
    renderApprovalAccordionDossier(currentApprovalDossier);
  } catch (err) {
    window.ui.toast(err.message, { type: "error" });
  }
}

async function rejectCurrentCandidateDoc() {
  if (!currentApprovalAppId || !currentApprovalItemId) return;
  const reason = prompt("Indica el motivo de rechazo definitivo del ítem (obligatorio):", "No cumple con el perfil mínimo de la convocatoria");
  if (!reason || !reason.trim()) return;

  try {
    await apiRequest(`/api/applications/${encodeURIComponent(currentApprovalAppId)}/items/${encodeURIComponent(currentApprovalItemId)}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "rechazado", reason: reason.trim() }),
    });
    window.ui.toast("Ítem rechazado", { type: "error" });
    const res = await apiRequest(`/api/applications/${encodeURIComponent(currentApprovalAppId)}/dossier`);
    currentApprovalDossier = await res.json();
    renderApprovalAccordionDossier(currentApprovalDossier);
  } catch (err) {
    window.ui.toast(err.message, { type: "error" });
  }
}

async function preselectCurrentCandidate() {
  if (!currentApprovalAppId) return;
  try {
    await apiRequest(`/api/applications/${encodeURIComponent(currentApprovalAppId)}/preselect`, {
      method: "POST",
    });
    window.ui.toast("Aspirante preseleccionado satisfactoriamente", { type: "success" });
    const badge = document.getElementById("pdf-doc-stage-badge");
    if (badge) {
      badge.className = "cecar-badge-status preseleccionada";
      badge.textContent = "Estado: Preseleccionada";
    }
  } catch (err) {
    window.ui.toast(err.message, { type: "error" });
  }
}

function openRequestSubsanacionModal() {
  const reviews = currentApprovalDossier?.reviews || [];
  const hasObservados = reviews.some((r) => r.decision === "observado");
  if (!hasObservados) {
    alert("Para emitir una solicitud de subsanación, primero debes marcar al menos un ítem como OBSERVADO.");
    return;
  }
  const dialog = document.getElementById("subsanacion-request-dialog");
  if (dialog) dialog.showModal();
}

function closeRequestSubsanacionModal() {
  const dialog = document.getElementById("subsanacion-request-dialog");
  if (dialog) dialog.close();
}

async function handleSendSubsanacionRequest(event) {
  event.preventDefault();
  const hours = parseInt(document.getElementById("subsanacion-deadline-hours").value, 10) || 48;
  const instructions = document.getElementById("subsanacion-instructions").value.trim();

  try {
    await apiRequest(`/api/applications/${encodeURIComponent(currentApprovalAppId)}/subsanacion/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deadline_hours: hours, instructions }),
    });
    closeRequestSubsanacionModal();
    window.ui.toast(`Solicitud de subsanación enviada. Plazo: ${hours} horas (RN-011 activada).`, { type: "success" });
    const badge = document.getElementById("pdf-doc-stage-badge");
    if (badge) {
      badge.className = "cecar-badge-status subsanacion_requerida";
      badge.textContent = "Estado: Subsanación Requerida";
    }
  } catch (err) {
    window.ui.toast(err.message, { type: "error" });
  }
}

function openDiscardCandidateModal() {
  const dialog = document.getElementById("discard-candidate-dialog");
  if (dialog) dialog.showModal();
}

function closeDiscardCandidateModal() {
  const dialog = document.getElementById("discard-candidate-dialog");
  if (dialog) dialog.close();
}

async function handleDiscardCandidate(event) {
  event.preventDefault();
  const reasonId = document.getElementById("discard-reason-select").value;
  const details = document.getElementById("discard-details").value.trim();

  try {
    await apiRequest(`/api/applications/${encodeURIComponent(currentApprovalAppId)}/discard`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason_id: reasonId, details }),
    });
    closeDiscardCandidateModal();
    window.ui.toast("Candidato descartado con registro en auditoría (RN-024)", { type: "info" });
    closePdfApprovalDialog();
    await view("procesos");
  } catch (err) {
    window.ui.toast(err.message, { type: "error" });
  }
}

function openScheduleInterviewModal() {
  const dialog = document.getElementById("schedule-interview-dialog");
  if (dialog) dialog.showModal();
}

function closeScheduleInterviewModal() {
  const dialog = document.getElementById("schedule-interview-dialog");
  if (dialog) dialog.close();
}

async function handleScheduleInterview(event) {
  event.preventDefault();
  const dt = document.getElementById("interview-datetime").value;
  const modality = document.getElementById("interview-modality").value;
  const location = document.getElementById("interview-location").value.trim();
  const committee = document.getElementById("interview-committee").value.trim().split(",").map((s) => s.trim()).filter(Boolean);

  try {
    await apiRequest("/api/interviews/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        application_id: currentApprovalAppId,
        scheduled_for: new Date(dt).toISOString(),
        modality,
        location,
        committee_members: committee,
      }),
    });
    closeScheduleInterviewModal();
    window.ui.toast("Entrevista agendada exitosamente", { type: "success" });
  } catch (err) {
    window.ui.toast(err.message, { type: "error" });
  }
}

function openAcademicTestsModal() {
  const dialog = document.getElementById("academic-tests-dialog");
  if (dialog) dialog.showModal();
}

function closeAcademicTestsModal() {
  const dialog = document.getElementById("academic-tests-dialog");
  if (dialog) dialog.close();
}

async function handleSaveAcademicTests(event) {
  event.preventDefault();
  const type = document.getElementById("test-type").value;
  const score = parseFloat(document.getElementById("test-score").value);
  const obs = document.getElementById("test-observations").value.trim();

  try {
    if (type === "clase_modelo") {
      await apiRequest(`/api/applications/${encodeURIComponent(currentApprovalAppId)}/classroom-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          didactics_score: score,
          subject_mastery_score: score,
          observations: obs,
        }),
      });
    } else {
      await apiRequest(`/api/applications/${encodeURIComponent(currentApprovalAppId)}/tests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          test_type: type,
          score: score,
          passed: score >= 70,
          observations: obs,
        }),
      });
    }
    closeAcademicTestsModal();
    window.ui.toast("Calificación registrada con éxito", { type: "success" });
  } catch (err) {
    window.ui.toast(err.message, { type: "error" });
  }
}

function openOccupationalExamModal() {
  const dialog = document.getElementById("occupational-exam-dialog");
  if (dialog) dialog.showModal();
}

function closeOccupationalExamModal() {
  const dialog = document.getElementById("occupational-exam-dialog");
  if (dialog) dialog.close();
}

async function handleSaveOccupationalExam(event) {
  event.preventDefault();
  const concept = document.getElementById("occupational-concept").value;
  const notes = document.getElementById("occupational-notes").value.trim();

  try {
    await apiRequest(`/api/applications/${encodeURIComponent(currentApprovalAppId)}/occupational-exam`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        aptitude_concept: concept,
        recommendations: notes,
      }),
    });
    closeOccupationalExamModal();
    window.ui.toast("Concepto administrativo de aptitud laboral guardado (RN-027)", { type: "success" });
  } catch (err) {
    window.ui.toast(err.message, { type: "error" });
  }
}

function openHiringBindingModal() {
  const dialog = document.getElementById("hiring-binding-dialog");
  if (dialog) dialog.showModal();
}

function closeHiringBindingModal() {
  const dialog = document.getElementById("hiring-binding-dialog");
  if (dialog) dialog.close();
}

async function handleConfirmBinding() {
  if (!confirm("¿Deseas confirmar la vinculación institucional del docente seleccionado en CECAR?")) return;
  try {
    await apiRequest(`/api/applications/${encodeURIComponent(currentApprovalAppId)}/confirm-binding`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start_date: new Date().toISOString() }),
    });
    window.ui.toast("¡Candidato formalmente VINCULADO a CECAR! (RF-104)", { type: "success" });
    const badge = document.getElementById("pdf-doc-stage-badge");
    if (badge) {
      badge.className = "cecar-badge-status vinculada";
      badge.textContent = "Estado: Vinculada";
    }
  } catch (err) {
    window.ui.toast(err.message, { type: "error" });
  }
}

async function handleTransferInstitutionalHv() {
  try {
    await apiRequest(`/api/applications/${encodeURIComponent(currentApprovalAppId)}/transfer-institutional-hv`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_system: "GTH-CECAR-ERP" }),
    });
    window.ui.toast("Expediente transferido exitosamente a Gestión de Talento Humano CECAR (RF-105/106)", { type: "success" });
  } catch (err) {
    window.ui.toast(err.message, { type: "error" });
  }
}

/* ==========================================================================
   REPORTES ESPECIALIZADOS CECAR Y EXPORTACIÓN EXCEL/CSV (RF-079, RF-096, RF-097)
   ========================================================================== */

async function openReportModal() {
  const dialog = document.getElementById("report-dialog");
  if (!dialog) return;
  await ensureCatalogos();
  switchReportTab("no_aprobados");
  dialog.showModal();
  if (window.ui && window.ui.refreshIcons) window.ui.refreshIcons();
}

function closeReportModal() {
  const dialog = document.getElementById("report-dialog");
  if (dialog) dialog.close();
}

function switchReportTab(tab) {
  currentReportType = tab;
  ["no-aprobados", "en-proceso", "seleccionados"].forEach((t) => {
    const btn = document.getElementById(`tab-rep-${t}`);
    if (btn) btn.classList.toggle("active", t === tab.replace("_", "-"));
  });
  refreshCurrentSpecializedReport();
}

async function refreshCurrentSpecializedReport() {
  const fac = document.getElementById("report-filter-faculty")?.value || "";
  const prog = document.getElementById("report-filter-program")?.value || "";
  const sede = document.getElementById("report-filter-campus")?.value || "";
  const per = document.getElementById("report-filter-period")?.value || "";

  const tbody = document.getElementById("cecar-report-tbody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px;">Consultando registros...</td></tr>`;

  try {
    const params = new URLSearchParams({
      report_type: currentReportType,
      faculty: fac,
      program: prog,
      campus: sede,
      academic_period: per,
    });
    const res = await apiRequest(`/api/reports/specialized?${params}`);
    const data = await res.json();
    const rows = data.records || [];

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--rp-text-muted); padding: 30px;">No se encontraron registros para los filtros seleccionados.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map((r) => `
      <tr>
        <td>
          <b>${escapeHtml(r.candidate_name || '')}</b>
          <div style="font-size: 11px; color: var(--rp-text-muted);">${escapeHtml(r.candidate_email || '')}</div>
        </td>
        <td>${escapeHtml(r.vacancy_title || '')}</td>
        <td>${escapeHtml(r.faculty || 'CECAR')}</td>
        <td><span class="cecar-badge-status ${r.status || 'pendiente'}">${escapeHtml(r.status || '')}</span></td>
        <td style="font-size: 12px; color: var(--rp-text-muted);">${escapeHtml(r.details || r.discard_reason || r.binding_status || '-')}</td>
      </tr>
    `).join("");
  } catch (err) {
    console.error("Error cargando reporte especializado:", err);
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #dc2626; padding: 20px;">Error al cargar datos: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function downloadCsvReport() {
  const fac = document.getElementById("report-filter-faculty")?.value || "";
  const prog = document.getElementById("report-filter-program")?.value || "";
  const sede = document.getElementById("report-filter-campus")?.value || "";
  const per = document.getElementById("report-filter-period")?.value || "";

  const params = new URLSearchParams({
    report_type: currentReportType,
    faculty: fac,
    program: prog,
    campus: sede,
    academic_period: per,
  });

  const downloadUrl = `/api/reports/export?${params}`;
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = `Reporte_${currentReportType}_CECAR.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  window.ui.toast("Descargando reporte oficial en Excel/CSV con UTF-8 BOM", { type: "success" });
}

/* ==========================================================================
   MESA DE AYUDAS Y TICKETS DE SOPORTE (RF-099)
   ========================================================================== */

function openMesaDeAyudas() {
  const dialog = document.getElementById("mesa-ayudas-dialog");
  if (!dialog) return;
  switchTicketTab("new");
  dialog.showModal();
  if (window.ui && window.ui.refreshIcons) window.ui.refreshIcons();
}

function closeMesaDeAyudas() {
  const dialog = document.getElementById("mesa-ayudas-dialog");
  if (dialog) dialog.close();
}

function switchTicketTab(tab) {
  const newPane = document.getElementById("ticket-tab-new-pane");
  const listPane = document.getElementById("ticket-tab-list-pane");
  const tabNew = document.getElementById("tab-ticket-new");
  const tabList = document.getElementById("tab-ticket-list");

  if (tab === "new") {
    if (newPane) newPane.style.display = "block";
    if (listPane) listPane.style.display = "none";
    if (tabNew) tabNew.classList.add("active");
    if (tabList) tabList.classList.remove("active");
  } else {
    if (newPane) newPane.style.display = "none";
    if (listPane) listPane.style.display = "block";
    if (tabNew) tabNew.classList.remove("active");
    if (tabList) tabList.classList.add("active");
    loadTicketsList();
  }
}

async function handleCreateTicket(event) {
  event.preventDefault();
  const category = document.getElementById("ticket-category").value;
  const priority = document.getElementById("ticket-priority").value;
  const subject = document.getElementById("ticket-subject").value.trim();
  const desc = document.getElementById("ticket-desc").value.trim();

  try {
    const res = await apiRequest("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, priority, subject, description: desc }),
    });
    const ticket = await res.json();
    window.ui.toast(`Ticket creado exitosamente: ${ticket.ticket_number}`, { type: "success" });
    document.getElementById("ticket-subject").value = "";
    document.getElementById("ticket-desc").value = "";
    switchTicketTab("list");
  } catch (err) {
    window.ui.toast(err.message, { type: "error" });
  }
}

async function loadTicketsList() {
  const container = document.getElementById("cecar-ticket-list-container");
  const thread = document.getElementById("cecar-ticket-thread");
  if (!container) return;
  if (thread) thread.style.display = "none";
  container.style.display = "block";

  container.innerHTML = `<p style="text-align:center; color: var(--rp-text-muted); padding: 20px;">Cargando tus solicitudes...</p>`;

  try {
    const res = await apiRequest("/api/tickets");
    const data = await res.json();
    currentTicketList = data.tickets || [];

    if (!currentTicketList.length) {
      container.innerHTML = `<p style="text-align:center; color: var(--rp-text-muted); padding: 30px;">Aún no tienes tickets de soporte registrados.</p>`;
      return;
    }

    container.innerHTML = currentTicketList.map((tk) => `
      <div class="cecar-ticket-item" onclick="openTicketThread('${escapeHtml(tk.id)}')">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <b style="font-size: 13px; color: var(--rp-text);">${escapeHtml(tk.subject)}</b>
          <span class="cecar-badge-status ${tk.status === 'resuelto' ? 'aprobado' : tk.status === 'en_tramite' ? 'observado' : 'pendiente'}" style="font-size: 10.5px;">
            ${escapeHtml(tk.status)}
          </span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 11.5px; color: var(--rp-text-muted);">
          <span>Radicado: <b>${escapeHtml(tk.ticket_number)}</b> · ${escapeHtml(tk.category)}</span>
          <span>${new Date(tk.created_at).toLocaleDateString("es")}</span>
        </div>
      </div>
    `).join("");
  } catch (err) {
    container.innerHTML = `<p style="color: #dc2626; text-align: center; padding: 20px;">Error al cargar tickets: ${escapeHtml(err.message)}</p>`;
  }
}

function openTicketThread(ticketId) {
  const ticket = currentTicketList.find((t) => t.id === ticketId);
  if (!ticket) return;
  currentOpenTicket = ticket;

  const container = document.getElementById("cecar-ticket-list-container");
  const thread = document.getElementById("cecar-ticket-thread");
  const title = document.getElementById("ticket-thread-title");
  const box = document.getElementById("ticket-messages-box");

  if (container) container.style.display = "none";
  if (thread) thread.style.display = "block";
  if (title) title.textContent = `[${ticket.ticket_number}] ${ticket.subject}`;

  const msgs = ticket.messages || [
    { sender: "Usuario", message: ticket.description, time: ticket.created_at }
  ];

  if (box) {
    box.innerHTML = msgs.map((m) => `
      <div class="cecar-chat-bubble ${m.sender === 'Usuario' ? 'mine' : 'support'}">
        <div style="font-size: 10.5px; opacity: 0.8; margin-bottom: 2px;">${escapeHtml(m.sender || 'Soporte')}</div>
        <div>${escapeHtml(m.message || '')}</div>
      </div>
    `).join("");
    box.scrollTop = box.scrollHeight;
  }
}

function backToTicketList() {
  const container = document.getElementById("cecar-ticket-list-container");
  const thread = document.getElementById("cecar-ticket-thread");
  if (container) container.style.display = "block";
  if (thread) thread.style.display = "none";
}

async function handleSendTicketReply(event) {
  event.preventDefault();
  if (!currentOpenTicket) return;
  const input = document.getElementById("ticket-reply-input");
  const message = input.value.trim();
  if (!message) return;

  try {
    await apiRequest(`/api/tickets/${encodeURIComponent(currentOpenTicket.id)}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    input.value = "";
    // Agregar burbuja localmente
    const box = document.getElementById("ticket-messages-box");
    if (box) {
      box.innerHTML += `
        <div class="cecar-chat-bubble mine">
          <div style="font-size: 10.5px; opacity: 0.8; margin-bottom: 2px;">Tú</div>
          <div>${escapeHtml(message)}</div>
        </div>
      `;
      box.scrollTop = box.scrollHeight;
    }
  } catch (err) {
    window.ui.toast(err.message, { type: "error" });
  }
}

function openTutorialModal() {
  const dialog = document.getElementById("tutorial-dialog");
  if (dialog) dialog.showModal();
}

function closeTutorialModal() {
  const dialog = document.getElementById("tutorial-dialog");
  if (dialog) dialog.close();
}
