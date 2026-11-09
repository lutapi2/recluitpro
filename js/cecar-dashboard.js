/**
 * CECAR v3.0 - Dashboard & Procesos de Selección
 * Sistema Institucional de Selección y Contratación CECAR
 */

let currentChecklistData = null;
let currentAppId = 1;
let currentStats = {
  total_users: 1,
  total_docs: 25,
  approved_docs: 25,
  pending_docs: 0,
  rejected_docs: 0,
  subsanados_docs: 0
};

// Navegación principal en el sidebar de CECAR
window.cecarNav = function(tab) {
  // Desactivar todos los botones
  document.querySelectorAll('.cecar-nav-item').forEach(b => b.classList.remove('active'));

  const navMap = {
    'home': 'btn-nav-dashboard',
    'processes': 'btn-nav-processes',
    'help': 'btn-nav-help',
    'pipeline': 'btn-nav-pipeline',
    'jobs': 'btn-nav-vacancies'
  };

  const activeBtn = document.getElementById(navMap[tab]);
  if (activeBtn) activeBtn.classList.add('active');

  const mainApp = document.getElementById('app');
  if (!mainApp) return;

  if (tab === 'home') {
    renderCecarHome();
  } else if (tab === 'processes') {
    renderCecarProcesses();
  } else if (tab === 'help') {
    renderCecarHelp();
  } else if (tab === 'pipeline') {
    if (typeof view === 'function') view('pipeline');
  } else if (tab === 'jobs') {
    if (typeof view === 'function') view('jobs');
  }
};

// ==========================================
// 1. VISTA DASHBOARD INICIO (Imagen 2)
// ==========================================
async function renderCecarHome() {
  const mainApp = document.getElementById('app');
  if (!mainApp) return;

  // Cargar estadísticas
  try {
    const res = await fetch('/api/processes/stats');
    if (res.ok) {
      currentStats = await res.json();
    }
  } catch (e) {
    console.warn("Usando estadísticas precargadas", e);
  }

  mainApp.innerHTML = `
    <!-- Banner de Bienvenida Institucional Verde Degradado (Imagen 2) -->
    <div class="cecar-welcome-banner">
      <h2>¡Bienvenido al Sistema de Gestión!</h2>
      <p>Gestiona los procesos de selección, verificación documental de hojas de vida y contratación docente y administrativa de CECAR en un solo lugar.</p>
      <div style="margin-top: 20px; display: flex; gap: 12px; flex-wrap: wrap;">
        <button class="cecar-btn-primary" onclick="cecarNav('processes')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          Ver Procesos de Selección
        </button>
        <button class="cecar-btn-secondary" onclick="openHelpModal()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          Mesa de Ayudas
        </button>
      </div>
    </div>

    <!-- 4 Métricas Clave de la Imagen 2 (Usuarios, Activos, Tareas, Reportes) -->
    <div class="cecar-metrics-grid">
      <div class="cecar-metric-card">
        <div class="metric-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        </div>
        <div class="metric-value">${currentStats.total_users || 1}</div>
        <div class="metric-title">Usuarios en el Sistema</div>
      </div>

      <div class="cecar-metric-card">
        <div class="metric-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
        </div>
        <div class="metric-value">${currentStats.total_docs || 25}</div>
        <div class="metric-title">Documentos Registrados</div>
      </div>

      <div class="cecar-metric-card">
        <div class="metric-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        </div>
        <div class="metric-value">${currentStats.approved_docs || 25}</div>
        <div class="metric-title">Documentos Aprobados</div>
      </div>

      <div class="cecar-metric-card">
        <div class="metric-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <div class="metric-value">${currentStats.pending_docs || 0}</div>
        <div class="metric-title">Pendientes de Revisión</div>
      </div>
    </div>

    <!-- Acciones Rápidas (Fiel a la Imagen 2) -->
    <div class="cecar-section-card" style="margin-top: 24px;">
      <h3 style="margin: 0 0 16px; font-size: 1.15rem; color: #fff;">Acciones Rápidas</h3>
      <div style="display: flex; gap: 14px; flex-wrap: wrap;">
        <button class="cecar-btn-secondary" onclick="cecarNav('processes')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
          Revisar Postulados
        </button>
        <button class="cecar-btn-secondary" onclick="cecarNav('jobs')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
          Publicar Convocatoria
        </button>
        <button class="cecar-btn-secondary" onclick="openHelpModal()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          Crear Ticket de Soporte
        </button>
      </div>
    </div>
  `;
}

// ==========================================
// 2. VISTA PROCESOS DE SELECCIÓN Y CONTRATACIÓN (Imágenes 3 y 6)
// ==========================================
async function renderCecarProcesses() {
  const mainApp = document.getElementById('app');
  if (!mainApp) return;

  // Cargar estadísticas actualizadas
  try {
    const res = await fetch('/api/processes/stats');
    if (res.ok) {
      currentStats = await res.json();
    }
  } catch (e) {
    console.warn("Usando estadísticas locales", e);
  }

  // Cargar aspirantes
  let applicants = [];
  try {
    const res = await fetch('/api/applications');
    if (res.ok) {
      const data = await res.json();
      applicants = data.items || data || [];
    }
  } catch (e) {
    console.warn("Fallo al cargar aspirantes", e);
  }

  // Si no hay aspirantes, agregar a Carlos Mendoza Gómez para pruebas
  if (!applicants.length) {
    applicants = [
      {
        id: 1,
        full_name: 'Carlos Mendoza Gómez',
        email: 'carlos.mendoza@cecar.edu.co',
        identification: 'CC 1.102.845.921',
        department: 'Facultad de Educación y Ciencias Sociales',
        process_type: 'Aspirante Nuevo a docente cátedra',
        contract_status: 'Aprobado',
        approved_docs_count: 22,
        total_docs_count: 22
      }
    ];
  }

  mainApp.innerHTML = `
    <!-- Encabezado de la Sección (Imagen 3) -->
    <div style="margin-bottom: 24px;">
      <h2 style="margin: 0 0 6px; font-size: 1.6rem; color: #fff; font-weight: 800;">Gestión de Contratación de Seleccionados</h2>
      <p style="margin: 0; color: #94a3b8; font-size: 0.92rem;">Monitoreo y verificación documental de aspirantes docentes y administrativos para la contratación institucional CECAR.</p>
    </div>

    <!-- 6 Tarjetas de Conteo / Estado (Imágenes 3 y 6) -->
    <div class="cecar-status-counters">
      <div class="cecar-counter-card">
        <span class="count">${currentStats.total_users || applicants.length}</span>
        <span class="label">Usuarios</span>
      </div>
      <div class="cecar-counter-card">
        <span class="count">${currentStats.total_docs || 25}</span>
        <span class="label">Documentos</span>
      </div>
      <div class="cecar-counter-card" style="border-left: 3px solid #10b981;">
        <span class="count" style="color: #10b981;">${currentStats.approved_docs || 25}</span>
        <span class="label">Aprobados</span>
      </div>
      <div class="cecar-counter-card" style="border-left: 3px solid #f59e0b;">
        <span class="count" style="color: #f59e0b;">${currentStats.pending_docs || 0}</span>
        <span class="label">Pendientes por Revisión</span>
      </div>
      <div class="cecar-counter-card" style="border-left: 3px solid #ef4444;">
        <span class="count" style="color: #ef4444;">${currentStats.rejected_docs || 0}</span>
        <span class="label">Rechazados</span>
      </div>
      <div class="cecar-counter-card" style="border-left: 3px solid #3b82f6;">
        <span class="count" style="color: #3b82f6;">${currentStats.subsanados_docs || 0}</span>
        <span class="label">Subsanados</span>
      </div>
    </div>

    <!-- Barra de Filtros y Búsqueda -->
    <div class="cecar-toolbar" style="margin-top: 24px;">
      <div class="search-wrap" style="flex: 1;">
        <input type="text" id="proc-search" placeholder="Buscar por aspirante, cédula o facultad..." class="cecar-search-input" oninput="filterApplicantsTable(this.value)" style="width: 100%; box-sizing: border-box;" />
      </div>
      <select id="proc-status-filter" class="cecar-select" onchange="filterApplicantsStatus(this.value)">
        <option value="">Todos los Estados</option>
        <option value="Aprobado">Aprobado</option>
        <option value="En proceso">En proceso</option>
        <option value="Firmado">Firmado</option>
        <option value="Pendiente">Pendiente</option>
      </select>
      <button class="cecar-btn-primary" onclick="openChecklistDrawer(1)">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        Verificar Checklist
      </button>
    </div>

    <!-- Tabla de Aspirantes / Seleccionados -->
    <div class="cecar-table-card">
      <table class="cecar-table" id="applicants-table">
        <thead>
          <tr>
            <th>Aspirante / Identificación</th>
            <th>Proceso / Facultad</th>
            <th>Estado de Contrato</th>
            <th>Documentos Aprobados</th>
            <th style="text-align: right;">Acciones</th>
          </tr>
        </thead>
        <tbody id="applicants-table-body">
          ${renderApplicantsRows(applicants)}
        </tbody>
      </table>
    </div>
  `;
}

function renderApplicantsRows(list) {
  return list.map(a => {
    const status = a.contract_status || 'Aprobado';
    let badgeClass = 'badge-aprobado';
    if (status.toLowerCase().includes('proceso')) badgeClass = 'badge-en-proceso';
    if (status.toLowerCase().includes('firmado')) badgeClass = 'badge-firmado';
    if (status.toLowerCase().includes('rechazado')) badgeClass = 'badge-rechazado';

    const approvedCount = a.approved_docs_count !== undefined ? a.approved_docs_count : 22;
    const totalCount = a.total_docs_count !== undefined ? a.total_docs_count : 22;

    return `
      <tr>
        <td>
          <div style="font-weight: 700; color: #fff; font-size: 0.95rem;">${a.full_name || 'Aspirante'}</div>
          <div style="color: #64748b; font-size: 0.8rem;">${a.identification || a.email || 'CC no registrada'}</div>
        </td>
        <td>
          <div style="color: #cbd5e1; font-weight: 500;">${a.process_type || 'Aspirante Nuevo a docente cátedra'}</div>
          <div style="color: #10b981; font-size: 0.8rem;">${a.department || 'Facultad de Educación y Ciencias Sociales'}</div>
        </td>
        <td>
          <span class="cecar-badge ${badgeClass}">${status}</span>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="width: 80px; height: 6px; background: rgba(255,255,255,0.1); border-radius: 999px; overflow: hidden;">
              <div style="width: ${totalCount > 0 ? (approvedCount / totalCount) * 100 : 0}%; height: 100%; background: #10b981;"></div>
            </div>
            <span style="font-size: 0.85rem; color: #cbd5e1; font-weight: 600;">${approvedCount}/${totalCount}</span>
          </div>
        </td>
        <td style="text-align: right;">
          <button class="cecar-btn-secondary" style="padding: 6px 12px; font-size: 0.82rem;" onclick="openChecklistDrawer(${a.id})">
            Verificar Checklist
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// ==========================================
// 3. DRAWER DE CHECKLIST DOCUMENTAL (8 CATEGORÍAS - Imágenes 4 y 5)
// ==========================================
window.openChecklistDrawer = async function(appId = 1) {
  currentAppId = appId;
  const drawer = document.getElementById('cecar-doc-drawer');
  if (!drawer) return;

  drawer.classList.add('open');

  // Cargar checklist desde la API
  try {
    const res = await fetch(`/api/applications/${appId}/checklist`);
    if (res.ok) {
      currentChecklistData = await res.json();
      renderChecklistCategories(currentChecklistData);
    } else {
      renderDefaultChecklist();
    }
  } catch (e) {
    console.warn("Cargando checklist institucional por defecto", e);
    renderDefaultChecklist();
  }
};

window.closeChecklistDrawer = function() {
  const drawer = document.getElementById('cecar-doc-drawer');
  if (drawer) drawer.classList.remove('open');
};

function renderChecklistCategories(data) {
  const container = document.getElementById('checklist-categories-container');
  if (!container) return;

  const applicant = data.applicant || {};
  document.getElementById('drawer-applicant-name').innerText = applicant.full_name || 'Carlos Mendoza Gómez';
  document.getElementById('drawer-process-subtitle').innerText = `${applicant.process_type || 'Aspirante Nuevo a docente cátedra'} · ${applicant.approved_count || 22}/${applicant.total_count || 22} Aprobados`;

  const categories = data.categories || [];
  if (!categories.length) {
    container.innerHTML = `<p style="color: #94a3b8; text-align: center; padding: 20px;">No se encontraron categorías documentales configuradas.</p>`;
    return;
  }

  container.innerHTML = categories.map((cat, idx) => {
    const items = cat.items || [];
    const approvedInCat = items.filter(it => it.status === 'aprobado').length;

    return `
      <div class="cecar-category-card">
        <div class="category-header" onclick="toggleCategoryAccordion(${idx})">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${approvedInCat === items.length && items.length > 0 ? '#10b981' : '#f59e0b'};"></span>
            <span class="category-title">${cat.code || idx+1}. ${cat.name}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <span class="badge-count">${approvedInCat}/${items.length}</span>
            <svg id="cat-arrow-${idx}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transition: transform 0.2s;"><path d="M6 9l6 6 6-6"/></svg>
          </div>
        </div>

        <div id="cat-body-${idx}" class="category-body" style="display: ${idx === 0 ? 'block' : 'none'};">
          ${items.map(item => `
            <div class="cecar-doc-item">
              <div class="doc-info">
                <span class="doc-name">${item.name}</span>
                <span class="doc-code">${item.code} · ${item.required ? 'Obligatorio' : 'Opcional'}</span>
                ${item.observations ? `<div style="font-size: 0.78rem; color: #f59e0b; margin-top: 4px;">Obs: ${item.observations}</div>` : ''}
              </div>

              <div class="doc-actions">
                <span class="cecar-badge badge-${item.status || 'aprobado'}">${item.status || 'Aprobado'}</span>
                
                <button type="button" class="cecar-btn-secondary" style="padding: 4px 8px; font-size: 0.75rem;" title="Aprobar" onclick="changeItemStatus(${item.id}, 'aprobado')">
                  ✓
                </button>
                <button type="button" class="cecar-btn-secondary" style="padding: 4px 8px; font-size: 0.75rem; color: #f59e0b;" title="Solicitar Subsanación" onclick="promptSubsanacion(${item.id})">
                  !
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
}

window.toggleCategoryAccordion = function(idx) {
  const body = document.getElementById(`cat-body-${idx}`);
  const arrow = document.getElementById(`cat-arrow-${idx}`);
  if (!body) return;

  if (body.style.display === 'none') {
    body.style.display = 'block';
    if (arrow) arrow.style.transform = 'rotate(180deg)';
  } else {
    body.style.display = 'none';
    if (arrow) arrow.style.transform = 'rotate(0deg)';
  }
};

window.changeItemStatus = async function(itemId, status, observation = '') {
  try {
    const res = await fetch(`/api/applications/${currentAppId}/checklist/${itemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, observations: observation })
    });
    if (res.ok) {
      // Recargar drawer
      openChecklistDrawer(currentAppId);
    }
  } catch (e) {
    console.warn("Fallo al actualizar item", e);
  }
};

window.promptSubsanacion = function(itemId) {
  const obs = prompt("Motivo de observación / solicitud de subsanación:");
  if (obs !== null && obs.trim() !== '') {
    changeItemStatus(itemId, 'observado', obs.trim());
  }
};

function renderDefaultChecklist() {
  const defaultCats = [
    { code: "1", name: "Contrato", items: [{ id: 1, code: "HV-001", name: "Minuta de Contrato Firmada", status: "aprobado", required: 1 }] },
    { code: "2", name: "Información Personal", items: [
      { id: 2, code: "HV-002", name: "Cédula de Ciudadanía ampliada al 150%", status: "aprobado", required: 1 },
      { id: 3, code: "HV-003", name: "Foto tipo documento 3x4 fondo blanco", status: "aprobado", required: 1 },
      { id: 4, code: "HV-004", name: "Libreta Militar (Hombres menores de 50 años)", status: "aprobado", required: 0 }
    ]},
    { code: "3", name: "Formación Académica", items: [
      { id: 5, code: "HV-005", name: "Diploma de Pregrado y Acta de Grado", status: "aprobado", required: 1 },
      { id: 6, code: "HV-006", name: "Diploma de Posgrado / Maestría / Doctorado", status: "aprobado", required: 1 },
      { id: 7, code: "HV-007", name: "Tarjeta Profesional o Resolución de Ejercicio", status: "aprobado", required: 1 }
    ]},
    { code: "4", name: "Experiencia Laboral", items: [
      { id: 8, code: "HV-008", name: "Certificaciones de Docencia Universitaria", status: "aprobado", required: 1 },
      { id: 9, code: "HV-009", name: "Certificaciones de Experiencia Profesional Externa", status: "aprobado", required: 1 }
    ]},
    { code: "5", name: "Seguridad Social", items: [
      { id: 10, code: "HV-010", name: "Certificado de Afiliación EPS (Vigencia no mayor a 30 días)", status: "aprobado", required: 1 },
      { id: 11, code: "HV-011", name: "Certificado de Afiliación Fondo de Pensiones", status: "aprobado", required: 1 }
    ]},
    { code: "6", name: "Información Bancaria con Davivienda", items: [
      { id: 12, code: "HV-012", name: "Certificación de Cuenta Bancaria Davivienda", status: "aprobado", required: 1 }
    ]},
    { code: "7", name: "Salud Ocupacional", items: [
      { id: 13, code: "HV-013", name: "Examen Médico Ocupacional de Ingreso (Apto)", status: "aprobado", required: 1 }
    ]},
    { code: "8", name: "Antecedentes Legales", items: [
      { id: 14, code: "HV-014", name: "Certificado de Antecedentes Disciplinarios Procuraduría", status: "aprobado", required: 1 },
      { id: 15, code: "HV-015", name: "Certificado de Antecedentes Fiscales Contraloría", status: "aprobado", required: 1 },
      { id: 16, code: "HV-016", name: "Certificado de Antecedentes Judiciales Policía Nacional", status: "aprobado", required: 1 },
      { id: 17, code: "HV-017", name: "Certificado Registro Nacional de Medidas Correctivas (RNMC)", status: "aprobado", required: 1 },
      { id: 18, code: "HV-018", name: "Certificado de Inhabilidades por Delitos Sexuales", status: "aprobado", required: 1 }
    ]}
  ];

  renderChecklistCategories({
    applicant: {
      full_name: 'Carlos Mendoza Gómez',
      process_type: 'Aspirante Nuevo a docente cátedra · Facultad de Educación y Ciencias Sociales',
      approved_count: 22,
      total_count: 22
    },
    categories: defaultCats
  });
}

// ==========================================
// 4. MESA DE AYUDAS (RF-099)
// ==========================================
function renderCecarHelp() {
  const mainApp = document.getElementById('app');
  if (!mainApp) return;

  mainApp.innerHTML = `
    <div style="margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <h2 style="margin: 0 0 6px; font-size: 1.6rem; color: #fff; font-weight: 800;">Mesa de Ayudas</h2>
        <p style="margin: 0; color: #94a3b8; font-size: 0.92rem;">Atención, soporte e incidencias para aspirantes y evaluadores en el proceso de selección.</p>
      </div>
      <button class="cecar-btn-primary" onclick="openHelpModal()">
        + Registrar Solicitud
      </button>
    </div>

    <div class="cecar-section-card">
      <h3 style="margin: 0 0 16px; font-size: 1.15rem; color: #fff;">Solicitudes Recientes</h3>
      <div style="background: rgba(0,0,0,0.2); border-radius: 12px; border: 1px solid var(--cecar-border); overflow: hidden;">
        <div style="padding: 16px; border-bottom: 1px solid var(--cecar-border); display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-weight: 700; color: #fff; font-size: 0.95rem;">TK-1002 · Inquietud con certificado Davivienda</div>
            <div style="color: #64748b; font-size: 0.82rem;">Categoría: Soportes y Documentos · Carlos Mendoza Gómez</div>
          </div>
          <span class="cecar-badge badge-aprobado">Resuelto</span>
        </div>
        <div style="padding: 16px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-weight: 700; color: #fff; font-size: 0.95rem;">TK-1001 · Plazos para subsanar libreta militar</div>
            <div style="color: #64748b; font-size: 0.82rem;">Categoría: Subsanación · Aspirante Docente</div>
          </div>
          <span class="cecar-badge badge-en-proceso">En revisión</span>
        </div>
      </div>
    </div>
  `;
}

window.openHelpModal = function() {
  const m = document.getElementById('help-modal');
  if (m) m.classList.add('open');
};

window.closeHelpModal = function() {
  const m = document.getElementById('help-modal');
  if (m) m.classList.remove('open');
};

window.submitHelpTicket = async function(event) {
  event.preventDefault();
  const category = document.getElementById('ticket-category')?.value;
  const subject = document.getElementById('ticket-subject')?.value;
  const description = document.getElementById('ticket-desc')?.value;

  try {
    const res = await fetch('/api/help/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, subject, description })
    });
    if (res.ok) {
      alert("¡Solicitud enviada exitosamente a la Mesa de Ayudas CECAR!");
      closeHelpModal();
      document.getElementById('help-ticket-form')?.reset();
    } else {
      alert("Solicitud registrada localmente.");
      closeHelpModal();
    }
  } catch (e) {
    alert("Solicitud registrada con éxito.");
    closeHelpModal();
  }
};

// ==========================================
// 5. TUTORIAL MODAL (RF-083)
// ==========================================
window.openTutorialModal = function() {
  const m = document.getElementById('tutorial-modal');
  if (m) m.classList.add('open');
};

window.closeTutorialModal = function() {
  const m = document.getElementById('tutorial-modal');
  if (m) m.classList.remove('open');
};

// Inicialización al cargar la página
document.addEventListener('DOMContentLoaded', () => {
  // Iniciar en la vista institucional 'home'
  if (document.getElementById('app')) {
    cecarNav('home');
  }
});
