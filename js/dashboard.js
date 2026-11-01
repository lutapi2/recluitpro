const app = document.getElementById("app");
const nav = document.getElementById("nav");
let user;
let usersCache = [];
let vacanciesCache = [];
let vacancyPageState = { q: "", location: "", vacancy_type: "", status_filter: "", sort: "created_at", order: "desc", page: 1 };
let candidatePageState = { q: "", location: "", status_filter: "", sort: "created_at", order: "desc", page: 1 };
let currentPipelineVacancyId = "";
let pipelineApplicationsCache = [];
let pipelineSearchQuery = "";
let draggedAppId = null;

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

function renderPager(result, pageName) {
  const pages = Math.max(1, Math.ceil(result.total / result.page_size));
  return `<div class="pagination"><span>${result.total} resultado${result.total === 1 ? "" : "s"} · Página ${result.page} de ${pages}</span><div><button class="secondary small" type="button" ${result.page <= 1 ? "disabled" : ""} onclick="changePage('${pageName}', ${result.page - 1})">Anterior</button><button class="secondary small" type="button" ${result.page >= pages ? "disabled" : ""} onclick="changePage('${pageName}', ${result.page + 1})">Siguiente</button></div></div>`;
}

function renderVacancyFilters() {
  const isCandidate = user.role === "candidato";
  return `<form class="box filter-panel" onsubmit="applyVacancyFilters(event)"><h2>Buscar vacantes</h2><div class="filter-grid"><label class="field-label">Palabras clave<input name="q" value="${escapeHtml(vacancyPageState.q)}" placeholder="Puesto, descripción o tipo"></label><label class="field-label">Ubicación<input name="location" value="${escapeHtml(vacancyPageState.location)}" placeholder="Ciudad o remoto"></label><label class="field-label">Tipo<input name="vacancy_type" value="${escapeHtml(vacancyPageState.vacancy_type)}" placeholder="Tiempo completo, prácticas"></label>${isCandidate ? "" : `<label class="field-label">Estado<select name="status_filter"><option value="">Todos</option><option value="active" ${vacancyPageState.status_filter === "active" ? "selected" : ""}>Activas</option><option value="closed" ${vacancyPageState.status_filter === "closed" ? "selected" : ""}>Cerradas</option></select></label>`}<label class="field-label">Ordenar por<select name="sort"><option value="created_at" ${vacancyPageState.sort === "created_at" ? "selected" : ""}>Fecha de publicación</option><option value="title" ${vacancyPageState.sort === "title" ? "selected" : ""}>Título</option><option value="location" ${vacancyPageState.sort === "location" ? "selected" : ""}>Ubicación</option><option value="type" ${vacancyPageState.sort === "type" ? "selected" : ""}>Tipo</option></select></label><label class="field-label">Orden<select name="order"><option value="desc" ${vacancyPageState.order === "desc" ? "selected" : ""}>Descendente</option><option value="asc" ${vacancyPageState.order === "asc" ? "selected" : ""}>Ascendente</option></select></label></div><button class="primary small" type="submit">Aplicar filtros</button></form>`;
}

function renderCandidateFilters() {
  return `<form class="box filter-panel" onsubmit="applyCandidateFilters(event)"><h2>Buscar candidatos</h2><div class="filter-grid"><label class="field-label">Nombre o correo<input name="q" value="${escapeHtml(candidatePageState.q)}" placeholder="Buscar"></label><label class="field-label">Ubicación<input name="location" value="${escapeHtml(candidatePageState.location)}" placeholder="Ciudad"></label><label class="field-label">Etapa<select name="status_filter"><option value="">Todas las etapas</option>${["recibida", "en_revision", "entrevista", "oferta", "rechazada"].map((stage) => `<option value="${stage}" ${candidatePageState.status_filter === stage ? "selected" : ""}>${statusLabel(stage)}</option>`).join("")}</select></label><label class="field-label">Ordenar por<select name="sort"><option value="created_at" ${candidatePageState.sort === "created_at" ? "selected" : ""}>Fecha de registro</option><option value="name" ${candidatePageState.sort === "name" ? "selected" : ""}>Nombre</option></select></label><label class="field-label">Orden<select name="order"><option value="desc" ${candidatePageState.order === "desc" ? "selected" : ""}>Descendente</option><option value="asc" ${candidatePageState.order === "asc" ? "selected" : ""}>Ascendente</option></select></label></div><button class="primary small" type="submit">Aplicar filtros</button></form>`;
}

async function applyVacancyFilters(event) {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget).entries());
  vacancyPageState = { ...vacancyPageState, ...values, page: 1 };
  await view("jobs");
}

async function applyCandidateFilters(event) {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget).entries());
  candidatePageState = { ...candidatePageState, ...values, page: 1 };
  await view("candidates");
}

async function changePage(pageName, page) {
  if (pageName === "jobs") {
    vacancyPageState.page = page;
    await view("jobs");
  } else {
    candidatePageState.page = page;
    await view("candidates");
  }
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

async function view(page, vacancyId = "") {
  if (!user) return;
  nav.querySelectorAll("button").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.page === (page === "apply" ? "jobs" : page),
    );
  });

  try {
    if (page === "home") {
      const summary = await (await apiRequest("/api/dashboard/summary")).json();
      const cards = user.role === "administrador"
        ? [["Usuarios", summary.users], ["Candidatos", summary.candidates], ["Reclutadores", summary.recruiters], ["Vacantes", summary.vacancies]]
        : user.role === "reclutador"
          ? [["Vacantes", summary.vacancies], ["Postulaciones", summary.applications]]
          : [["Vacantes disponibles", summary.vacancies], ["Mis postulaciones", summary.applications]];
      app.innerHTML = `<div class="head"><small>DASHBOARD</small><h1>Hola, ${escapeHtml(user.name.split(" ")[0])} </h1><p>Resumen de tu espacio RecruitPro.</p></div><div class="stats">${cards.map(([title, count]) => `<article><b>${title}</b><strong>${count}</strong></article>`).join("")}</div><div class="box"><h3>Encuentra nuevas oportunidades</h3><p>Consulta las vacantes publicadas y descubre oportunidades que se ajusten a tu perfil.</p><button class="primary small" onclick="view('jobs')">Ver vacantes</button></div>`;
    } else if (page === "profile") {
      app.innerHTML = `<div class="head"><small>PERFIL</small><h1>Mi perfil</h1><p>Actualiza tus datos y protege tu cuenta.</p></div><div class="box"><form id="profile-form" onsubmit="saveOwnProfile(event)"><label class="field-label" for="profile-name">Nombre completo</label><input id="profile-name" name="name" required maxlength="100" value="${escapeHtml(user.name)}"><label class="field-label" for="profile-email">Correo electrónico</label><input id="profile-email" type="email" readonly value="${escapeHtml(user.email)}"><label class="field-label" for="profile-phone">Teléfono</label><input id="profile-phone" name="phone" maxlength="30" value="${escapeHtml(user.phone || "")}"><label class="field-label" for="profile-location">Ubicación</label><input id="profile-location" name="location" maxlength="100" value="${escapeHtml(user.location || "")}"><div id="profile-message" class="notice-box" role="status"></div><button class="primary small" type="submit">Guardar perfil</button></form><hr><h2>Cambiar contraseña</h2><form id="password-form" onsubmit="changeOwnPassword(event)"><label class="field-label" for="current-password">Contraseña actual</label><input id="current-password" name="current_password" type="password" autocomplete="current-password" required><label class="field-label" for="new-password">Nueva contraseña (mínimo 12 caracteres)</label><input id="new-password" name="new_password" type="password" minlength="12" maxlength="128" autocomplete="new-password" required><div id="password-message" class="notice-box" role="status"></div><button class="primary small" type="submit">Actualizar contraseña</button></form><hr><h2>Privacidad</h2><p>Consentimiento registrado: ${user.privacyConsentAt ? new Date(user.privacyConsentAt).toLocaleDateString("es") : "No consta (cuenta anterior a la política de consentimiento)"}.</p><p>Versión del aviso: ${escapeHtml(user.privacyConsentVersion || "sin registro")}.</p><p>Para eliminar tu cuenta, postulaciones y documentos, confirma tu contraseña. Esta acción es permanente.</p><label class="field-label" for="delete-account-password">Contraseña actual</label><input id="delete-account-password" type="password" autocomplete="current-password" required><button class="secondary danger-button" type="button" onclick="deleteOwnAccount()">Eliminar mi cuenta y mis datos</button><div id="delete-account-message" class="notice-box" role="status"></div></div>`;
    } else if (page === "applications" && user.role === "candidato") {
      const result = await (await apiRequest("/api/applications/mine")).json();
      const items = result.items.length
        ? `<div class="vacancy-list">${result.items.map((item) => {
            const isOffer = item.status === "oferta";
            const isInterview = item.status === "entrevista";
            return `
              <article class="vacancy-card" style="${isOffer ? 'border: 2px solid #10b981; background: #f0fdf4; border-radius: 14px;' : isInterview ? 'border: 2px solid #6366f1; background: #eef2ff; border-radius: 14px;' : ''}">
                <div class="vacancy-heading">
                  <h2>${escapeHtml(item.vacancyTitle)}</h2>
                  <span class="vacancy-status" style="${isOffer ? 'background: #10b981; color: #fff; font-weight: 700; padding: 4px 12px; border-radius: 9999px;' : isInterview ? 'background: #4f46e5; color: #fff; font-weight: 700; padding: 4px 12px; border-radius: 9999px;' : ''}">${escapeHtml(statusLabel(item.status))}</span>
                </div>
                ${isOffer ? '<p style="color: #047857; font-weight: 700; margin: 10px 0 6px 0; font-size: 15px;">🎉 ¡Felicitaciones! Has recibido una Oferta formal de empleo para este puesto. Nuestro equipo de selección se pondrá en contacto contigo para coordinar tu incorporación.</p>' : ''}
                ${isInterview ? '<p style="color: #4338ca; font-weight: 600; margin: 8px 0;">📅 Has avanzado a la etapa de Entrevista. Te contactaremos pronto con los detalles de fecha y hora.</p>' : ''}
                <p class="muted-copy" style="margin-top: 6px;">Postulación enviada el ${new Date(item.createdAt).toLocaleDateString("es")}.</p>
              </article>
            `;
          }).join("")}</div>`
        : '<p class="empty-state">Todavía no tienes postulaciones.</p>';
      app.innerHTML = `<div class="head"><small>CANDIDATO</small><h1>Mis postulaciones</h1><p>Consulta el estado de tus procesos.</p></div>${items}`;
    } else if (page === "docs" && user.role === "candidato") {
      app.innerHTML = `<div class="head"><small>CANDIDATO</small><h1>Mis documentos</h1><p>Sube tus archivos para que los reclutadores puedan consultarlos cuando te postules.</p></div><div class="box"><label class="field-label" for="file">Selecciona un archivo PDF, DOC o DOCX (máximo 10 MB)</label><input type="file" id="file" accept=".pdf,.doc,.docx" required><button class="primary small" onclick="addDoc()">Subir documento</button><div id="page-message" class="notice-box" role="status"></div><hr>${renderDocumentList(getDocuments(user))}</div>`;
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
      app.innerHTML = `<div class="head"><small>TALENTO</small><h1>Candidatos</h1><p>Busca y filtra candidatos postulados a vacantes de tu equipo.</p></div><div class="box">${renderCandidateFilters()}${renderCandidates(result.items)}${renderPager(result, "candidates")}</div>`;
    } else if (page === "recruiters" && user.role === "administrador") {
      usersCache = await (await apiRequest("/api/users?role=reclutador")).json();
      usersCache = usersCache.items;
      app.innerHTML = `<div class="head"><small>ADMINISTRACIÓN</small><h1>Reclutadores</h1></div><div class="box">${renderRecruiters(usersCache)}</div>`;
    } else if (page === "jobs") {
      const params = new URLSearchParams({ ...vacancyPageState, page: String(vacancyPageState.page), page_size: "20" });
      const result = await (await apiRequest(`/api/vacancies?${params}`)).json();
      vacanciesCache = result.items;
      usersCache = user.role === "administrador"
        ? (await (await apiRequest("/api/users?role=reclutador")).json()).items || []
        : user.role === "reclutador" ? [user] : [];
      app.innerHTML = `${renderVacancyFilters()}${renderVacancies(result.items)}${renderPager(result, "jobs")}`;
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
  } catch (error) {
    console.error("No se pudo cargar la pantalla:", error);
    app.innerHTML = `<div class="box notice-box is-error" role="alert">${escapeHtml(error.message)}</div>`;
  }
}

function renderApplicationForm(vacancy) {
  const candidate = user;
  return `<div class="head"><small>POSTULACIÓN</small><h1>Completa tu perfil</h1><p>Comparte algunos datos para que el equipo pueda conocerte mejor.</p></div><section class="box application-form-box"><div class="application-vacancy"><span class="vacancy-type">${escapeHtml(vacancy.type)}</span><h2>${escapeHtml(vacancy.title)}</h2><span>${escapeHtml(vacancy.location || "Ubicación por definir")}</span></div><form id="application-form" onsubmit="submitApplication(event)"><div class="application-fields"><label class="field-label" for="application-name">Nombre completo</label><input id="application-name" name="name" required maxlength="100" autocomplete="name" value="${escapeHtml(candidate.name)}"><label class="field-label" for="application-email">Correo electrónico</label><input id="application-email" type="email" name="email" required readonly value="${escapeHtml(candidate.email)}"><label class="field-label" for="application-phone">Teléfono</label><input id="application-phone" type="tel" name="phone" required maxlength="30" autocomplete="tel" placeholder="Ej. +52 55 1234 5678" value="${escapeHtml(candidate.phone || "")}"><label class="field-label" for="application-location">Ciudad o ubicación</label><input id="application-location" name="location" required maxlength="100" autocomplete="address-level2" placeholder="Ej. Ciudad de México" value="${escapeHtml(candidate.location || "")}"><label class="field-label" for="application-resume">Hoja de vida o CV</label><div class="resume-upload"><input id="application-resume" name="resume" type="file" required accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"><span>Formatos PDF, DOC o DOCX · máximo 10 MB</span></div></div><label class="consent-label"><input id="application-consent" name="privacy_consent" type="checkbox" required><span>Acepto que mi perfil y CV se compartan con el administrador y los reclutadores responsables para gestionar esta postulación. Consulta el <a href="privacidad.html" target="_blank" rel="noopener">aviso de privacidad</a>.</span></label><div id="page-message" class="notice-box" role="status"></div><div class="application-actions"><button type="button" class="secondary" onclick="sessionStorage.removeItem('recruitpro_pending_application'); view('jobs')">Cancelar</button><button class="primary small" type="submit">Enviar postulación</button></div></form></section>`;
}

function renderDocumentList(documents) {
  if (!documents.length) {
    return '<p class="empty-state">Todavía no has subido documentos.</p>';
  }

  return `<ul class="document-list">${documents
    .map((document) => {
      const name = escapeHtml(documentName(document));
      const savedFile = typeof document === "object" && document.id;

      return `<li><span class="document-name">${name}</span>${
        savedFile
          ? `<button class="document-button" onclick="viewDocument('${encodeURIComponent(document.id)}')">Ver documento</button>`
          : '<span class="document-legacy">Archivo anterior: no se guardó el contenido</span>'
      }</li>`;
    })
    .join("")}</ul>`;
}

function renderCandidates(candidates) {
  if (!candidates.length) {
    return '<p class="empty-state">Todavía no hay candidatos registrados.</p>';
  }

  return `<div class="table-wrap"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Documentos</th>${user.role === "administrador" ? "<th>Acciones</th>" : ""}</tr></thead><tbody>${candidates
    .map((candidate) => {
      const documents = getDocuments(candidate);
      const contents = documents.length
        ? renderDocumentList(documents)
        : '<p class="empty-state">Sin documentos</p>';

      return `<tr><td>${escapeHtml(candidate.name)}</td><td>${escapeHtml(candidate.email)}</td><td><details class="candidate-documents"><summary>${documents.length} documento${documents.length === 1 ? "" : "s"}</summary>${contents}</details></td>${user.role === "administrador" ? `<td><div style="display:flex;gap:6px;align-items:center;"><button class="secondary small" onclick="openEditUserDialog('${encodeURIComponent(candidate.id)}')">Editar</button><button class="secondary small" onclick="promoteRecruiter('${encodeURIComponent(candidate.id)}')">Habilitar reclutador</button><button class="secondary small danger-button" style="color:#dc2626;border-color:#fecaca;" onclick="deleteUserDirect('${encodeURIComponent(candidate.id)}', '${escapeHtml(candidate.name)}')">Eliminar</button></div></td>` : ""}</tr>`;
    })
    .join("")}</tbody></table></div>`;
}

function renderRecruiters(recruiters) {
  if (!recruiters.length) {
    return '<p class="empty-state">Todavía no hay reclutadores registrados.</p>';
  }

  return `<div class="table-wrap"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Acciones</th></tr></thead><tbody>${recruiters
    .map(
      (recruiter) =>
        `<tr><td>${escapeHtml(recruiter.name)}</td><td>${escapeHtml(recruiter.email)}</td><td><div style="display:flex;gap:6px;align-items:center;"><button class="secondary small" onclick="openEditUserDialog('${encodeURIComponent(recruiter.id)}')">Editar</button><button class="secondary small danger-button" style="color:#dc2626;border-color:#fecaca;" onclick="deleteUserDirect('${encodeURIComponent(recruiter.id)}', '${escapeHtml(recruiter.name)}')">Eliminar</button></div></td></tr>`,
    )
    .join("")}</tbody></table></div>`;
}

function renderVacancies(vacancies) {
  const canPublish = user.role === "reclutador" || user.role === "administrador";
  const canApply = user.role === "candidato";
  const vacanciesIntro =
    user.role === "administrador"
      ? "Crea, asigna y actualiza las vacantes de la plataforma."
      : user.role === "reclutador"
        ? "Publica oportunidades y revisa las postulaciones recibidas."
        : "Encuentra oportunidades publicadas por los reclutadores.";
  const recruiters = Array.isArray(usersCache) ? usersCache.filter((entry) => entry.role === "reclutador") : [];
  const ownVacancies = vacancies.filter(
    (vacancy) => vacancy.recruiterId === user.id,
  );
  const vacancyList = vacancies.length
    ? `<div class="vacancy-list">${vacancies.map(renderVacancy).join("")}</div>`
    : '<div class="box empty-state">Todavía no hay vacantes publicadas. ¡Vuelve pronto!</div>';
  const applicationNotice = sessionStorage.getItem("recruitpro_application_success");
  if (applicationNotice) sessionStorage.removeItem("recruitpro_application_success");

  return `<div class="head"><small>OPORTUNIDADES</small><h1>Vacantes</h1><p>${vacanciesIntro}</p></div>${applicationNotice ? `<div class="application-success" role="status">${escapeHtml(applicationNotice)}</div>` : ""}${
    canPublish
      ? `<section class="box vacancy-form-box"><h2>Publicar una vacante</h2><p>Comparte una nueva oportunidad con los candidatos.</p><form id="vacancy-form" onsubmit="publishVacancy(event)"><label class="field-label" for="vacancy-title">Nombre de la vacante</label><input id="vacancy-title" name="title" required maxlength="100" placeholder="Ej. Diseñador de producto"><label class="field-label" for="vacancy-type">Tipo de vacante</label><input id="vacancy-type" name="type" required maxlength="60" placeholder="Ej. Tiempo completo, prácticas, remoto"><label class="field-label" for="vacancy-location">Ubicación</label><input id="vacancy-location" name="location" maxlength="100" placeholder="Ej. Remoto o Ciudad de México">${user.role === "administrador" ? `<label class="field-label" for="vacancy-recruiter">Reclutador asignado</label><select id="vacancy-recruiter" name="recruiterEmail"><option value="">Sin asignar (administrador)</option>${recruiters.map((recruiter) => `<option value="${escapeHtml(recruiter.id)}">${escapeHtml(recruiter.name)} · ${escapeHtml(recruiter.email)}</option>`).join("")}</select>` : ""}<label class="field-label" for="vacancy-description">Descripción</label><textarea id="vacancy-description" name="description" required maxlength="3000" rows="5" placeholder="Describe las responsabilidades y requisitos del puesto"></textarea><div id="page-message" class="notice-box" role="status"></div><button class="primary small" type="submit">Publicar vacante</button></form></section>${user.role === "reclutador" ? `<h2 class="section-title">Vacantes publicadas</h2><p class="muted-copy">Has publicado ${ownVacancies.length} vacante${ownVacancies.length === 1 ? "" : "s"}.</p>` : ""}`
      : ""
  }${canApply ? '<h2 class="section-title">Oportunidades disponibles</h2>' : ""}${vacancyList}`;
}

function renderVacancy(vacancy) {
  const canApply = user.role === "candidato";
  const applications = Array.isArray(vacancy.applications)
    ? vacancy.applications
    : [];
  const applied = applications.some(
    (application) => application.email === user.email,
  );
  const canManage = vacancy.canManage === true;
  const canReviewApplications =
    canManage || (user.role === "reclutador" && applications.length > 0);
  const isClosed = vacancy.status === "closed";

  return `<article class="vacancy-card"><div class="vacancy-heading"><div><span class="vacancy-type">${escapeHtml(vacancy.type)}</span><h2>${escapeHtml(vacancy.title)}</h2></div><div class="vacancy-meta">${isClosed ? '<span class="vacancy-status is-closed">Cerrada</span>' : '<span class="vacancy-status">Activa</span>'}${vacancy.location ? `<span class="vacancy-location">${escapeHtml(vacancy.location)}</span>` : ""}</div></div><p class="vacancy-description">${escapeHtml(vacancy.description).replace(/\n/g, "<br>")}</p><div class="vacancy-footer"><span>Publicada por ${escapeHtml(vacancy.recruiterName || "Administrador")}</span>${
    canApply && !isClosed
      ? applied
        ? `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;"><span class="application-status">Ya te postulaste</span><button type="button" class="kanban-action-btn" style="background: rgba(99, 102, 241, 0.1); color: #4f46e5; border-color: #c7d2fe;" onclick="openCandidateAiFit('${encodeURIComponent(vacancy.id)}')">Análisis de Idoneidad IA</button></div>`
        : `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;"><button class="primary small" onclick="applyToVacancy('${encodeURIComponent(vacancy.id)}')">Postularme</button><button type="button" class="kanban-action-btn" style="background: rgba(99, 102, 241, 0.1); color: #4f46e5; border-color: #c7d2fe;" onclick="openCandidateAiFit('${encodeURIComponent(vacancy.id)}')">Análisis de Idoneidad IA</button></div>`
      : canReviewApplications
        ? `<div class="vacancy-actions">
            ${canManage ? `<button class="secondary small" onclick="openEditVacancyDialog('${encodeURIComponent(vacancy.id)}')">Editar</button>` : ""}
            <button class="kanban-action-btn primary-btn" onclick="goToPipelineForVacancy('${encodeURIComponent(vacancy.id)}')">Ver en Pipeline</button>
            ${user.role === "administrador" ? `<button class="secondary small danger-button" onclick="deleteVacancy('${encodeURIComponent(vacancy.id)}', '${escapeHtml(vacancy.title)}')">Eliminar</button>` : ""}
            <details class="applicants"><summary>${applications.length} postulación${applications.length === 1 ? "" : "es"}</summary>${renderApplicants(applications)}</details>
          </div>`
        : canApply && isClosed
          ? '<span class="application-status is-muted">Convocatoria finalizada</span>'
        : ""
  }</div></article>`;
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

      return `<li class="application-card"><div class="applicant-heading"><span><b>${escapeHtml(application.name)}</b> · ${escapeHtml(application.email)} ${application.aiScore ? `<span class="kanban-ai-pill ${application.aiScore >= 80 ? "score-high" : application.aiScore >= 60 ? "score-med" : "score-low"}">★ Match IA: ${application.aiScore}%</span>` : ""} <small class="applicant-details">${details}</small></span><button class="document-button" onclick=\"viewDocument('${encodeURIComponent(application.resumeId)}', '${encodeURIComponent(application.id)}')\">Ver CV</button></div><div class="application-controls"><label>Etapa<select id="stage-${escapeHtml(application.id)}">${["recibida", "en_revision", "entrevista", "oferta", "rechazada"].map((stage) => `<option value="${stage}" ${application.status === stage ? "selected" : ""}>${statusLabel(stage)}</option>`).join("")}</select></label><label>Responsable<select id="assignee-${escapeHtml(application.id)}"><option value="">Sin asignar</option>${recruiterOptions}</select></label><label class="note-field">Nota interna<textarea id="note-${escapeHtml(application.id)}" maxlength="2000" rows="2" placeholder="Añade contexto o próximos pasos"></textarea></label><button class="primary small" onclick="saveApplicationUpdate('${encodeURIComponent(application.id)}')">Guardar seguimiento</button></div><details class="application-history"><summary>Historial y notas (${(application.activities || []).length})</summary><ul>${history || "<li>Sin actividad registrada.</li>"}</ul></details></li>`;
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
  const id = decodeURIComponent(encodedId);
  const appId = optionalAppId ? decodeURIComponent(optionalAppId) : null;

  try {
    const response = await apiRequest(`/api/documents/${encodeURIComponent(id)}`);
    const blob = await response.blob();
    const filename = decodeURIComponent(response.headers.get("X-Document-Name") || "documento");

    const dialog = document.getElementById("document-preview");
    const frame = document.getElementById("document-frame");
    const download = document.getElementById("document-download");
    const subtitle = document.getElementById("preview-subtitle");
    const splitPane = document.getElementById("split-evaluation-pane");
    const splitBody = document.querySelector(".split-preview-body");

    const oldUrl = dialog.dataset.objectUrl;
    if (oldUrl) URL.revokeObjectURL(oldUrl);

    const url = URL.createObjectURL(blob);
    dialog.dataset.objectUrl = url;
    if (appId) dialog.dataset.appId = appId;
    else delete dialog.dataset.appId;

    frame.src = url;
    frame.title = `Vista previa de ${filename}`;
    download.href = url;
    download.download = filename;
    download.textContent = `Descargar ${filename}`;

    // Find application if reviewing as Admin or Recruiter
    currentEvaluatingApp = null;
    if (user.role !== "candidato") {
      let app = null;

      // 1. Try finding in pipelineApplicationsCache
      if (appId) {
        app = (pipelineApplicationsCache || []).find((a) => a.id === appId);
      }
      if (!app) {
        app = (pipelineApplicationsCache || []).find((a) => a.resumeId === id);
      }

      // 2. Try finding in vacanciesCache
      if (!app && vacanciesCache) {
        for (const v of vacanciesCache) {
          if (v.applications) {
            const found = v.applications.find((a) => a.resumeId === id || a.id === appId);
            if (found) {
              app = { ...found, vacancyTitle: v.title, vacancyId: v.id };
              break;
            }
          }
        }
      }

      // 3. Fallback: query backend API directly if still not found
      if (!app) {
        try {
          const appsRes = await apiRequest("/api/applications");
          const appsData = await appsRes.json();
          pipelineApplicationsCache = appsData.items || [];
          if (appId) app = pipelineApplicationsCache.find((a) => a.id === appId);
          if (!app) app = pipelineApplicationsCache.find((a) => a.resumeId === id);
        } catch (fetchErr) {
          console.warn("No se pudo cargar la lista general de postulaciones:", fetchErr);
        }
      }

      if (app) {
        currentEvaluatingApp = app;
        dialog.dataset.appId = app.id;
        if (splitPane) splitPane.style.display = "flex";
        if (splitBody) splitBody.classList.remove("no-eval");
        if (subtitle) subtitle.textContent = `Expediente: ${app.name} · ${app.vacancyTitle}`;
        setupSplitEvaluationPanel(app);
      } else {
        if (splitPane) splitPane.style.display = "none";
        if (splitBody) splitBody.classList.add("no-eval");
        if (subtitle) subtitle.textContent = filename;
      }
    } else {
      if (splitPane) splitPane.style.display = "none";
      if (splitBody) splitBody.classList.add("no-eval");
      if (subtitle) subtitle.textContent = filename;
    }

    dialog.showModal();
  } catch (error) {
    console.error("No se pudo abrir el documento:", error);
    showMessage(error.message, true);
  }
}

function setupSplitEvaluationPanel(app) {
  document.getElementById("eval-candidate-name").textContent = app.name;
  document.getElementById("eval-candidate-vacancy").textContent = "" + (app.vacancyTitle || "Vacante");

  const avatar = document.getElementById("eval-candidate-avatar");
  if (avatar) {
    avatar.textContent = app.name
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
      if (act.note && act.note.includes("⭐")) {
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

  // Auto-display and execute AI evaluation for real-time assessment
  if (app.id) {
    runAiScreening();
  } else {
    if (aiResults) aiResults.style.display = "none";
    if (runAiBtn) runAiBtn.textContent = "Ejecutar Análisis";
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
    const starStr = "★".repeat(currentCandidateRating);
    const ratingPrefix = `[Calificación: ${starStr} (${currentCandidateRating}/5)]`;
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
   KANBAN PIPELINE FUNCTIONS
   ========================================================================== */

function renderPipelineView() {
  const vacancyOptions = vacanciesCache
    .map(
      (v) =>
        `<option value="${escapeHtml(v.id)}" ${currentPipelineVacancyId === v.id ? "selected" : ""}>${escapeHtml(v.title)} (${(v.applications || []).length} postulantes)</option>`
    )
    .join("");

  return `
    <div class="head">
      <small>PROCESO DE CONTRATACIÓN</small>
      <h1>Pipeline Interactivo (Kanban)</h1>
      <p>Arrastra y suelta a los candidatos entre las columnas para avanzar o cambiar su etapa en tiempo real.</p>
    </div>

    <div class="kanban-wrapper">
      <div class="kanban-controls">
        <div class="kanban-filters">
          <label style="font-weight: 600; font-size: 13px; color: var(--text);">
            Vacante:
            <select id="pipeline-vacancy-select" onchange="changePipelineVacancy(this.value)">
              <option value="">Todas las vacantes</option>
              ${vacancyOptions}
            </select>
          </label>

          <input
            type="text"
            id="pipeline-search"
            placeholder="Buscar candidato por nombre, correo o ciudad..."
            value="${escapeHtml(pipelineSearchQuery)}"
            oninput="filterPipelineCards(this.value)"
          />
        </div>

        <div class="kanban-stats-pill" id="pipeline-total-stats">
          Total candidatos: <b>${pipelineApplicationsCache.length}</b>
        </div>
      </div>

      <div id="kanban-board-container">
        ${renderPipelineBoardOnly()}
      </div>
    </div>
  `;
}

function renderPipelineBoardOnly() {
  const stages = [
    { key: "recibida", title: "Recibidas", icon: "" },
    { key: "en_revision", title: "En revisión", icon: "" },
    { key: "entrevista", title: "Entrevista", icon: "" },
    { key: "oferta", title: "Oferta", icon: "" },
    { key: "rechazada", title: "Rechazada", icon: "" },
  ];

  const q = pipelineSearchQuery.trim().toLowerCase();
  const filteredApps = q
    ? pipelineApplicationsCache.filter(
        (app) =>
          app.name.toLowerCase().includes(q) ||
          app.email.toLowerCase().includes(q) ||
          (app.location && app.location.toLowerCase().includes(q))
      )
    : pipelineApplicationsCache;

  return `
    <div class="kanban-board">
      ${stages.map((stage) => renderKanbanColumn(stage.key, stage.title, stage.icon, filteredApps)).join("")}
    </div>
  `;
}

function renderKanbanColumn(stageKey, stageTitle, stageIcon, applications) {
  const columnApps = applications.filter((app) => app.status === stageKey);

  return `
    <div
      class="kanban-column stage-${stageKey}"
      data-stage="${stageKey}"
      ondragover="kanbanDragOver(event)"
      ondragleave="kanbanDragLeave(event)"
      ondrop="kanbanDrop(event, '${stageKey}')"
    >
      <div class="kanban-col-header">
        <h3 class="kanban-col-title">
          <span>${stageIcon}</span>
          <span>${stageTitle}</span>
        </h3>
        <span class="kanban-count">${columnApps.length}</span>
      </div>

      <div class="kanban-cards-list" id="col-list-${stageKey}">
        ${
          columnApps.length
            ? columnApps.map(renderKanbanCard).join("")
            : '<div class="kanban-empty-state">Sin candidatos en esta etapa</div>'
        }
      </div>
    </div>
  `;
}

function renderKanbanCard(app) {
  const details = [
    app.phone && `Teléfono: ${escapeHtml(app.phone)}`,
    app.location && `Ubicación: ${escapeHtml(app.location)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const resumeBtn = app.resumeId
    ? `<button class="kanban-action-btn primary-btn" type="button" onclick=\"event.stopPropagation(); viewDocument('${encodeURIComponent(app.resumeId)}', '${encodeURIComponent(app.id)}')\">Ver CV</button>`
    : "";

  return `
    <div
      class="kanban-card"
      draggable="true"
      id="kcard-${escapeHtml(app.id)}"
      ondragstart="kanbanDragStart(event, '${escapeHtml(app.id)}')"
      ondragend="kanbanDragEnd(event, '${escapeHtml(app.id)}')"
      onclick="openApplicationDetailDialog('${escapeHtml(app.id)}')"
    >
      <div class="kanban-card-top" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 6px;">
        <h4 class="kanban-card-name" style="margin: 0;">${escapeHtml(app.name)}</h4>
        ${app.aiScore ? `<span class="kanban-ai-pill ${app.aiScore >= 80 ? "score-high" : app.aiScore >= 60 ? "score-med" : "score-low"}">★ Match: ${app.aiScore}%</span>` : `<button class="kanban-ai-quick-btn" type="button" onclick="event.stopPropagation(); triggerDirectAi('${escapeHtml(app.id)}')">Analizar IA</button>`}
      </div>
      <p class="kanban-card-email">${escapeHtml(app.email)}</p>

      <span class="kanban-card-badge" title="${escapeHtml(app.vacancyTitle)}">
        ${escapeHtml(app.vacancyTitle)}
      </span>

      ${details ? `<div class="kanban-card-details">${details}</div>` : ""}

      <div class="kanban-card-actions" onclick="event.stopPropagation()">
        ${resumeBtn}

        <button
          class="kanban-action-btn"
          type="button"
          onclick="openApplicationDetailDialog('${escapeHtml(app.id)}')"
          title="Ver notas y detalles"
        >
          Seguimiento
        </button>

        <select
          class="kanban-card-stage-select"
          title="Cambio rápido de etapa"
          onchange="moveApplicationStageDirect('${escapeHtml(app.id)}', this.value)"
        >
          ${["recibida", "en_revision", "entrevista", "oferta", "rechazada"]
            .map(
              (stage) =>
                `<option value="${stage}" ${app.status === stage ? "selected" : ""}>${statusLabel(stage)}</option>`
            )
            .join("")}
        </select>
      </div>
    </div>
  `;
}

async function changePipelineVacancy(vacancyId) {
  currentPipelineVacancyId = vacancyId;
  try {
    const appsRes = await (
      await apiRequest("/api/applications" + (currentPipelineVacancyId ? `?vacancy_id=${encodeURIComponent(currentPipelineVacancyId)}` : ""))
    ).json();
    pipelineApplicationsCache = appsRes.items;
    const stats = document.getElementById("pipeline-total-stats");
    if (stats) stats.innerHTML = `Total candidatos: <b>${pipelineApplicationsCache.length}</b>`;
    const container = document.getElementById("kanban-board-container");
    if (container) container.innerHTML = renderPipelineBoardOnly();
  } catch (err) {
    console.error("Error al filtrar vacante:", err);
  }
}

function filterPipelineCards(query) {
  pipelineSearchQuery = query;
  const container = document.getElementById("kanban-board-container");
  if (container) container.innerHTML = renderPipelineBoardOnly();
}

/* Drag and Drop event handlers */
function kanbanDragStart(e, id) {
  draggedAppId = id;
  e.dataTransfer.setData("text/plain", id);
  e.dataTransfer.effectAllowed = "move";
  const card = document.getElementById(`kcard-${id}`);
  if (card) {
    setTimeout(() => card.classList.add("is-dragging"), 0);
  }
}

function kanbanDragEnd(e, id) {
  const card = document.getElementById(`kcard-${id}`);
  if (card) card.classList.remove("is-dragging");
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
  if (!app) return;

  if (app.status === targetStage) return;

  await applyApplicationStageChange(app, targetStage);
}

async function moveApplicationStageDirect(id, targetStage) {
  const app = pipelineApplicationsCache.find((item) => item.id === id);
  if (!app || app.status === targetStage) return;
  await applyApplicationStageChange(app, targetStage);
}

async function applyApplicationStageChange(app, targetStage) {
  const oldStage = app.status;
  app.status = targetStage; // Optimistic update

  const container = document.getElementById("kanban-board-container");
  if (container) container.innerHTML = renderPipelineBoardOnly();

  try {
    const response = await apiRequest(`/api/applications/${encodeURIComponent(app.id)}`, {
      method: "PATCH",
      body: { status: targetStage },
    });
    const result = await response.json();
    showKanbanToast(`${escapeHtml(app.name)} movido a: ${statusLabel(targetStage)}`);
  } catch (error) {
    console.error("Error al actualizar etapa:", error);
    app.status = oldStage; // Revert
    if (container) container.innerHTML = renderPipelineBoardOnly();
    showKanbanToast("" + (error.message || "No se pudo cambiar la etapa"), true);
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
  if (!confirm("¿Estás seguro de que deseas eliminar permanentemente esta postulación de la plataforma?")) return;

  try {
    await apiRequest(`/api/applications/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    pipelineApplicationsCache = (pipelineApplicationsCache || []).filter((item) => item.id !== id);
    closeApplicationDetailDialog();
    showKanbanToast("Postulación eliminada exitosamente.");
    const container = document.getElementById("kanban-board-container");
    if (container) container.innerHTML = renderPipelineBoardOnly();
    const stats = document.getElementById("pipeline-total-stats");
    if (stats) stats.innerHTML = `Total candidatos: <b>${pipelineApplicationsCache.length}</b>`;
  } catch (error) {
    console.error("Error al eliminar postulación:", error);
    alert(error.message || "No se pudo eliminar la postulación.");
  }
}

/* Toast alert notification */
let toastTimeout = null;
function showKanbanToast(message, isError = false) {
  const toast = document.getElementById("kanban-toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.toggle("is-error", isError);
  toast.classList.add("show");

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove("show");
  }, 3500);
}

async function initializeDashboard() {
  try {
    user = await (await apiRequest("/api/auth/me")).json();
    document.getElementById("user").textContent = user.name;
    document.getElementById("user-role").textContent = label(user.role);
    document.getElementById("avatar").textContent = user.name
      .split(/\s+/)
      .map((name) => name[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
    const items =
      user.role === "candidato"
        ? [["home", "Inicio"], ["jobs", "Vacantes"], ["applications", "Mis postulaciones"], ["profile", "Mi perfil"], ["docs", "Documentos"]]
        : user.role === "reclutador"
          ? [["home", "Inicio"], ["pipeline", "Pipeline (Kanban)"], ["jobs", "Vacantes"], ["candidates", "Candidatos"]]
          : [["home", "Inicio"], ["pipeline", "Pipeline (Kanban)"], ["jobs", "Vacantes"], ["candidates", "Candidatos"], ["recruiters", "Reclutadores"]];
    nav.innerHTML = items
      .map(([page, title]) => `<button type="button" data-page="${page}" onclick="view('${page}')">${title}</button>`)
      .join("");

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
  if (!confirm(`¿Estás seguro de que deseas eliminar permanentemente la vacante "${title}" y todas sus postulaciones asociadas? Esta acción es irreversible.`)) {
    return;
  }

  try {
    await apiRequest(`/api/vacancies/${encodeURIComponent(id)}`, { method: "DELETE" });
    showKanbanToast(`Vacante "${title}" eliminada con éxito.`);
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

async function triggerAiScreening() {
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
    if (loading) {
      loading.style.display = "block";
      loading.innerHTML = '<span style="color: #b91c1c;">No se encontró la postulación asociada para este documento.</span>';
    }
    return;
  }

  if (runBtn) {
    runBtn.disabled = true;
    runBtn.textContent = "Analizando...";
  }
  if (loading) {
    loading.style.display = "block";
    loading.innerHTML = '<span>Procesando currículum y evaluando correlación técnica con la vacante...</span>';
  }
  if (results) results.style.display = "none";

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
  if (!confirm(`¿Estás seguro de que deseas eliminar permanentemente la cuenta de "${name}"? Esta acción borrará todas sus postulaciones, documentos y accesos.`)) return;
  try {
    await apiRequest(`/api/users/${encodeURIComponent(id)}`, { method: "DELETE" });
    const currentPage = nav.querySelector("button.active")?.dataset.page || "home";
    await view(currentPage);
    showKanbanToast(`Cuenta de ${name} eliminada con éxito.`);
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
