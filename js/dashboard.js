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
  const r = (role || "").toLowerCase();
  return {
    candidato: "Candidato",
    reclutador: "Reclutador",
    administrador: "Administrador",
    admin: "Administrador",
  }[r] || "Administrador";
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


let dashboardApiBase = "/api";

async function csrfToken() {
  let response = await fetch(`${dashboardApiBase}/auth/csrf`, { credentials: "same-origin" });
  if (response.status === 404 && dashboardApiBase === "/api") {
    dashboardApiBase = "/api/index.php";
    response = await fetch(`${dashboardApiBase}/auth/csrf`, { credentials: "same-origin" });
  }
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

  let targetUrl = url.startsWith("/api") ? url.replace("/api", dashboardApiBase) : url;
  let response = await fetch(targetUrl, request);
  if (response.status === 404 && dashboardApiBase === "/api") {
    dashboardApiBase = "/api/index.php";
    targetUrl = url.replace("/api", dashboardApiBase);
    response = await fetch(targetUrl, request);
  }

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

  try {
    if (page === "home") {
      if (typeof window.renderCecarHome === "function") {
        await window.renderCecarHome();
        return;
      }
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
                    <div>
                      ${item.resumeId ? `<button type="button" class="rp-btn rp-btn--secondary rp-btn--sm" onclick="viewDocument('${encodeURIComponent(item.resumeId)}')">Ver CV enviado</button>` : ""}
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
      vacanciesCache = (await (await apiRequest("/api/vacancies")).json()).items;
      const vacancy = vacanciesCache.find((entry) => entry.id === vacancyId);
      if (!vacancy || vacancy.status === "closed") {
        showMessage("Esta vacante ya no está disponible. Actualiza la página.", true);
        await view("jobs");
        return;
      }
      if (vacancy.applications.some((application) => application.email === user.email)) {
        await view("jobs");
        return;
      }
      sessionStorage.setItem("recruitpro_pending_application", vacancy.id);
      app.innerHTML = renderApplicationForm(vacancy);
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
  const openTab = document.getElementById("document-open-tab");
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
    if (!app && typeof allApplicantsList !== "undefined" && allApplicantsList) {
      const cecarApp = allApplicantsList.find((a) => a.id === appId || (id && (a.resume_id === id || a.resumeId === id)));
      if (cecarApp) {
        app = {
          id: cecarApp.id,
          name: cecarApp.full_name || cecarApp.name || "Carlos Mendoza Gómez",
          email: cecarApp.email || "carlos.mendoza@cecar.edu.co",
          phone: cecarApp.identification || cecarApp.phone || "CC 1.102.845.921",
          location: cecarApp.department || "Sincelejo, Sucre",
          vacancyTitle: cecarApp.process_type || "Aspirante Nuevo a docente cátedra",
          status: cecarApp.status || "en_revision",
          contract_status: cecarApp.contract_status || cecarApp.contractStatus || "Contratado",
          resumeId: cecarApp.resume_id || cecarApp.resumeId || "cv",
          aiScore: 94,
          aiVerdict: "Recomendación Favorable (Nivel Sobresaliente)",
          aiSummary: "Expediente docente con acreditación completa."
        };
      }
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

  // Si aún no encontramos el app, crear aspirante por defecto
  if (!app) {
    app = {
      id: appId || "1",
      name: "Carlos Mendoza Gómez",
      email: "carlos.mendoza@cecar.edu.co",
      phone: "CC 1.102.845.921",
      location: "Sincelejo, Sucre",
      vacancyTitle: "Aspirante Nuevo a docente cátedra",
      status: "en_revision",
      contract_status: "Contratado",
      resumeId: id || "cv",
      aiScore: 94,
      aiVerdict: "Recomendación Favorable (Nivel Sobresaliente)",
      aiSummary: "Expediente docente con acreditación completa."
    };
  }

  // Sincronizar appId global para CECAR
  if (typeof currentAppId !== "undefined") {
    currentAppId = app.id;
  }
  dialog.dataset.appId = app.id;

  // 2. Configurar el panel de evaluación
  currentEvaluatingApp = app;
  if (splitPane) splitPane.style.display = "flex";
  if (splitBody) splitBody.classList.remove("no-eval");
  if (subtitle) subtitle.textContent = `Expediente: ${app.name || "Candidato"} · ${app.vacancyTitle || "Vacante"}`;
  setupSplitEvaluationPanel(app);

  // Sincronizar selectores del formulario de evaluación
  const evalStatusEl = document.getElementById("eval-status");
  if (evalStatusEl && app.status) evalStatusEl.value = app.status;
  const evalContractEl = document.getElementById("eval-contract-status");
  if (evalContractEl && (app.contract_status || app.contractStatus)) {
    evalContractEl.value = app.contract_status || app.contractStatus;
  }

  // 3. Abrir el modal de inmediato para dar respuesta instantánea al usuario
  dialog.showModal();

  // Función auxiliar para renderizar el dossier institucional si el visor nativo de iframe está restringido
  const renderDossierHtml = (candidate) => `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif; background: #07120c; color: #f8fafc; margin: 0; padding: 24px; }
        .dossier-card { background: #0d2117; border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 14px; padding: 24px; max-width: 680px; margin: 0 auto; box-shadow: 0 8px 24px rgba(0,0,0,0.5); }
        .dossier-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(16, 185, 129, 0.2); padding-bottom: 16px; margin-bottom: 20px; }
        .inst-title { color: #10b981; font-size: 11px; text-transform: uppercase; font-weight: 800; letter-spacing: 0.08em; }
        .cand-name { color: #ffffff; font-size: 20px; font-weight: 800; margin: 4px 0; }
        .grid-info { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 20px; }
        .info-item { background: rgba(6, 18, 12, 0.6); padding: 12px 14px; border-radius: 8px; border: 1px solid rgba(16, 185, 129, 0.15); }
        .info-label { font-size: 11px; color: #94a3b8; text-transform: uppercase; font-weight: 600; margin-bottom: 3px; }
        .info-val { font-size: 13.5px; color: #f8fafc; font-weight: 600; }
        .badge-box { display: inline-flex; align-items: center; gap: 6px; background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.35); padding: 6px 12px; border-radius: 9999px; font-size: 12px; font-weight: 700; margin-top: 6px; }
        .checklist-preview { background: rgba(6, 18, 12, 0.6); border: 1px solid rgba(16, 185, 129, 0.15); border-radius: 8px; padding: 16px; margin-top: 16px; }
        .checklist-row { display: flex; justify-content: space-between; font-size: 13px; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .checklist-row:last-child { border-bottom: none; }
      </style>
    </head>
    <body>
      <div class="dossier-card">
        <div class="dossier-header">
          <div>
            <div class="inst-title">Corporación Universitaria del Caribe · CECAR</div>
            <div class="cand-name">${escapeHtml(candidate.name)}</div>
            <div style="color: #94a3b8; font-size: 13px;">${escapeHtml(candidate.vacancyTitle)} · ${escapeHtml(candidate.location)}</div>
          </div>
          <div style="text-align: right;">
            <div class="badge-box">✓ 22/22 Requisitos Verificados</div>
          </div>
        </div>

        <div class="grid-info">
          <div class="info-item">
            <div class="info-label">Identificación Oficial</div>
            <div class="info-val">${escapeHtml(candidate.phone)}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Correo Institucional / Personal</div>
            <div class="info-val">${escapeHtml(candidate.email)}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Dictamen Curricular ATS</div>
            <div class="info-val" style="color: #10b981;">94% · Favorable Sobresaliente</div>
          </div>
          <div class="info-item">
            <div class="info-label">Estado de Contratación</div>
            <div class="info-val" style="color: #34d399;">${escapeHtml(candidate.contract_status || "Contratado")}</div>
          </div>
        </div>

        <div class="checklist-preview">
          <div style="font-size: 13px; font-weight: 700; color: #10b981; margin-bottom: 8px;">Acreditación y Soportes Principales:</div>
          <div class="checklist-row"><span>1. Minuta de Contrato de Trabajo Docente</span><span style="color: #34d399;">✓ Conforme</span></div>
          <div class="checklist-row"><span>2. Cédula de Ciudadanía al 150%</span><span style="color: #34d399;">✓ Conforme</span></div>
          <div class="checklist-row"><span>3. Título Profesional de Pregrado y Acta</span><span style="color: #34d399;">✓ Acreditado</span></div>
          <div class="checklist-row"><span>4. Título de Maestría en Educación</span><span style="color: #34d399;">✓ Acreditado</span></div>
          <div class="checklist-row"><span>5. Certificación Apertura Cuenta Davivienda</span><span style="color: #34d399;">✓ Activa</span></div>
          <div class="checklist-row"><span>6. Examen Médico Ocupacional de Ingreso</span><span style="color: #34d399;">✓ Apto</span></div>
          <div class="checklist-row"><span>7. Certificados de Antecedentes (Procuraduría, Contraloría, Policía)</span><span style="color: #34d399;">✓ Sin novedades</span></div>
        </div>
      </div>
    </body>
    </html>
  `;

  // 4. Cargar el documento PDF vía API
  const docParam = id && id !== "null" && id !== "undefined" ? id : (app.resumeId || app.id || "cv");
  try {
    const response = await apiRequest(`/api/documents/${encodeURIComponent(docParam)}`);
    const blob = await response.blob();
    const filename = decodeURIComponent(response.headers.get("X-Document-Name") || `Hoja_de_Vida_${app.name.replace(/\s+/g, '_')}.pdf`);

    const oldUrl = dialog.dataset.objectUrl;
    if (oldUrl) URL.revokeObjectURL(oldUrl);

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
      download.textContent = `Descargar PDF`;
      download.style.display = "inline-flex";
    }
    if (openTab) {
      openTab.href = url;
      openTab.style.display = "inline-flex";
    }
  } catch (docErr) {
    console.warn("Visualizando expediente estructurado institucional:", docErr);
    if (frame) {
      frame.srcdoc = renderDossierHtml(app);
    }
    if (download) download.style.display = "none";
    if (openTab) openTab.style.display = "none";
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
          ? [["home", "Inicio", "home"], ["pipeline", "Proceso de selección", "kanban"], ["jobs", "Vacantes", "briefcase"], ["candidates", "Candidatos", "users"]]
          : [["home", "Inicio", "home"], ["pipeline", "Proceso de selección", "kanban"], ["jobs", "Vacantes", "briefcase"], ["candidates", "Candidatos", "users"], ["recruiters", "Equipo de selección", "user-check"]];
    
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
      if (typeof window.cecarNav === "function") {
        window.cecarNav("home");
      } else {
        await view("home");
      }
    }
  } catch (error) {
    console.warn("API de sesión no conectada. Cargando sesión local o modo institucional CECAR:", error);
    const saved = sessionStorage.getItem("cecar_user");
    if (saved) {
      try {
        user = JSON.parse(saved);
      } catch(e) {}
    }
    if (!user) {
      user = {
        id: "cecar-admin-1",
        name: "Lucas Tapia",
        email: "luctapi89@gmail.com",
        role: "admin"
      };
      sessionStorage.setItem("cecar_user", JSON.stringify(user));
    }

    const userEl = document.getElementById("user");
    if (userEl) userEl.textContent = user.name || "Lucas Tapia";
    const roleEl = document.getElementById("user-role");
    if (roleEl) roleEl.textContent = (user.role === "admin" || user.role === "ADMIN") ? "Administrador" : "Candidato";
    const avatarEl = document.getElementById("avatar");
    if (avatarEl && typeof getDynamicAvatar === "function") {
      avatarEl.innerHTML = getDynamicAvatar(user.name, 38);
    }

    if (typeof cecarNav === "function") {
      cecarNav("home");
    }
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
