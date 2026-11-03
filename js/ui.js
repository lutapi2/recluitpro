/* ==========================================================================
   RecruitPro · ui.js
   Componentes base reutilizables (sin dependencias obligatorias).
   Usa Lucide si está cargado; si no, los iconos se omiten sin romper nada.
   Expone window.ui
   ========================================================================== */
(function () {
  "use strict";

  const esc = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Iconos ---------- */
  function icon(name, cls = "") {
    return `<i data-lucide="${esc(name)}" class="rp-icon ${esc(cls)}" aria-hidden="true"></i>`;
  }
  function refreshIcons(root) {
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons({ attrs: { "stroke-width": 2 }, root: root || document });
    }
  }

  /* ---------- Button ---------- */
  function button({ label = "", variant = "primary", size = "", iconName = "", onClick = "", type = "button", ariaLabel = "", attrs = "" } = {}) {
    const cls = ["rp-btn", `rp-btn--${variant}`, size && `rp-btn--${size}`, !label && "rp-btn--icon"].filter(Boolean).join(" ");
    const aria = ariaLabel || (!label ? "Acción" : "");
    return `<button type="${type}" class="${cls}" ${onClick ? `onclick="${onClick}"` : ""} ${aria ? `aria-label="${esc(aria)}"` : ""} ${attrs}>${iconName ? icon(iconName) : ""}${label ? `<span>${esc(label)}</span>` : ""}</button>`;
  }
  function setBusy(btn, busy) {
    if (!btn) return;
    btn.setAttribute("aria-busy", busy ? "true" : "false");
    btn.disabled = !!busy;
  }

  /* Ripple global en botones primarios */
  document.addEventListener("pointerdown", (e) => {
    const btn = e.target.closest(".rp-btn--primary, button.primary");
    if (!btn || reducedMotion()) return;
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const span = document.createElement("span");
    span.className = "rp-ripple";
    span.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - rect.left - size / 2}px;top:${e.clientY - rect.top - size / 2}px`;
    if (getComputedStyle(btn).position === "static") btn.style.position = "relative";
    btn.style.overflow = "hidden";
    btn.appendChild(span);
    setTimeout(() => span.remove(), 550);
  });

  /* ---------- Avatar (color determinístico por nombre) ---------- */
  const PALETTE = [
    ["#dbeafe", "#1d4ed8"], ["#dcfce7", "#15803d"], ["#ede9fe", "#6d28d9"], ["#ffedd5", "#c2410c"],
    ["#fce7f3", "#be185d"], ["#cffafe", "#0e7490"], ["#fef9c3", "#a16207"], ["#ccfbf1", "#0f766e"],
  ];
  function initials(name) {
    const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    return parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2);
  }
  function avatar(name, size = 36) {
    let hash = 0;
    const str = String(name || "");
    for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) | 0;
    const [bg, fg] = PALETTE[Math.abs(hash) % PALETTE.length];
    return `<span class="rp-avatar" style="width:${size}px;height:${size}px;background:${bg};color:${fg};font-size:${Math.round(size * 0.38)}px" title="${esc(name)}" aria-hidden="true">${esc(initials(name))}</span>`;
  }

  /* ---------- Badge ---------- */
  function badge(text, tone = "", iconName = "") {
    return `<span class="rp-badge ${tone ? `rp-badge--${tone}` : ""}">${iconName ? icon(iconName, "rp-icon-sm") : ""}${esc(text)}</span>`;
  }

  /* ---------- ProgressRing ---------- */
  function progressRing(value, size = 36, stroke = 4) {
    const v = Math.max(0, Math.min(100, Number(value) || 0));
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const color = v > 80 ? "var(--rp-success)" : v >= 50 ? "var(--rp-warning)" : "var(--rp-danger)";
    return `<span class="rp-ring" role="img" aria-label="Compatibilidad ${v}%" style="width:${size}px;height:${size}px">
      <svg width="${size}" height="${size}"><circle class="rp-ring__track" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"/>
      <circle class="rp-ring__bar" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - v / 100)}"/></svg>
      <span class="rp-ring__label">${v}</span></span>`;
  }

  /* ---------- Skeleton / EmptyState ---------- */
  function skeleton(w = "100%", h = 14, radius = "") {
    return `<span class="rp-skeleton" style="width:${w};height:${typeof h === "number" ? h + "px" : h};${radius ? `border-radius:${radius}` : ""}"></span>`;
  }
  function emptyState({ iconName = "inbox", title = "", text = "", action = "", compact = false } = {}) {
    if (compact) return `<div class="rp-empty rp-empty--compact">${icon(iconName, "rp-icon-sm")}<span>${esc(title)}</span></div>`;
    return `<div class="rp-empty"><span class="rp-empty__icon">${icon(iconName)}</span>${title ? `<p class="rp-empty__title">${esc(title)}</p>` : ""}${text ? `<p class="rp-empty__text">${esc(text)}</p>` : ""}${action}</div>`;
  }

  /* ---------- Toast (con acción opcional, p. ej. Deshacer) ---------- */
  function region() {
    let el = document.getElementById("rp-toast-region");
    if (!el) {
      el = document.createElement("div");
      el.id = "rp-toast-region";
      el.className = "rp-toast-region";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      document.body.appendChild(el);
    }
    return el;
  }
  function toast(message, { type = "success", actionLabel = "", onAction = null, duration = 3000 } = {}) {
    const el = document.createElement("div");
    el.className = `rp-toast rp-toast--${type}`;
    el.innerHTML = `${icon(type === "error" ? "alert-circle" : type === "info" ? "info" : "check-circle-2")}<span class="rp-toast__msg">${esc(message)}</span>${actionLabel ? `<button type="button" class="rp-toast__action">${esc(actionLabel)}</button>` : ""}`;
    region().appendChild(el);
    refreshIcons(el);
    const close = () => {
      if (!el.isConnected) return;
      el.classList.add("is-leaving");
      setTimeout(() => el.remove(), 160);
    };
    if (actionLabel && onAction) {
      el.querySelector(".rp-toast__action").addEventListener("click", () => { onAction(); close(); });
    }
    setTimeout(close, actionLabel ? Math.max(duration, 5000) : duration);
    return close;
  }

  /* ---------- Confirm (reemplaza window.confirm) ---------- */
  function confirmDialog({ title = "¿Confirmar acción?", text = "", confirmLabel = "Confirmar", cancelLabel = "Cancelar", danger = false } = {}) {
    return new Promise((resolve) => {
      const dlg = document.createElement("dialog");
      dlg.className = "rp-modal";
      dlg.setAttribute("aria-labelledby", "rp-confirm-title");
      dlg.innerHTML = `<div class="rp-modal__body"><h2 class="rp-modal__title" id="rp-confirm-title">${esc(title)}</h2>${text ? `<p class="rp-modal__text">${esc(text)}</p>` : ""}</div>
        <div class="rp-modal__footer"><button type="button" class="rp-btn rp-btn--secondary" data-v="0">${esc(cancelLabel)}</button>
        <button type="button" class="rp-btn ${danger ? "rp-btn--danger" : "rp-btn--primary"}" data-v="1">${esc(confirmLabel)}</button></div>`;
      document.body.appendChild(dlg);
      const done = (v) => { dlg.close(); dlg.remove(); resolve(v); };
      dlg.addEventListener("click", (e) => {
        const b = e.target.closest("[data-v]");
        if (b) done(b.dataset.v === "1");
        else if (e.target === dlg) done(false);
      });
      dlg.addEventListener("cancel", (e) => { e.preventDefault(); done(false); });
      dlg.showModal();
      dlg.querySelector('[data-v="1"]').focus();
    });
  }

  /* ---------- Menu contextual (⋯) ---------- */
  let openMenu = null;
  function closeMenu() {
    if (openMenu) { openMenu.remove(); openMenu = null; }
  }
  /** items: [{label, icon, onSelect, danger}] | {separator:true} | {heading:'...'} */
  function menu(anchor, items) {
    closeMenu();
    const el = document.createElement("div");
    el.className = "rp-menu";
    el.setAttribute("role", "menu");
    el.innerHTML = items.map((it, i) => {
      if (it.separator) return '<div class="rp-menu__sep" role="separator"></div>';
      if (it.heading) return `<div class="rp-menu__label">${esc(it.heading)}</div>`;
      return `<button type="button" role="menuitem" class="rp-menu__item ${it.danger ? "rp-menu__item--danger" : ""}" data-i="${i}">${it.icon ? icon(it.icon, "rp-icon-sm") : ""}${esc(it.label)}</button>`;
    }).join("");
    document.body.appendChild(el);
    refreshIcons(el);
    const r = anchor.getBoundingClientRect();
    const left = Math.min(r.right - el.offsetWidth, window.innerWidth - el.offsetWidth - 8);
    const top = r.bottom + 6 + el.offsetHeight > window.innerHeight ? r.top - el.offsetHeight - 6 : r.bottom + 6;
    el.style.left = `${Math.max(8, left)}px`;
    el.style.top = `${Math.max(8, top)}px`;
    el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-i]");
      if (!b) return;
      const item = items[Number(b.dataset.i)];
      closeMenu();
      item.onSelect && item.onSelect();
    });
    el.addEventListener("keydown", (e) => {
      const btns = [...el.querySelectorAll(".rp-menu__item")];
      const idx = btns.indexOf(document.activeElement);
      if (e.key === "ArrowDown") { e.preventDefault(); btns[(idx + 1) % btns.length].focus(); }
      if (e.key === "ArrowUp") { e.preventDefault(); btns[(idx - 1 + btns.length) % btns.length].focus(); }
      if (e.key === "Escape") { closeMenu(); anchor.focus(); }
    });
    openMenu = el;
    const first = el.querySelector(".rp-menu__item");
    first && first.focus();
  }
  document.addEventListener("pointerdown", (e) => {
    if (openMenu && !openMenu.contains(e.target)) closeMenu();
  });
  window.addEventListener("resize", closeMenu);
  window.addEventListener("scroll", closeMenu, true);

  /* ---------- CountUp ---------- */
  function countUp(el, to, duration = 800) {
    const target = Number(to) || 0;
    if (!el) return;
    if (reducedMotion() || target === 0) { el.textContent = target.toLocaleString("es"); return; }
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / duration);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))).toLocaleString("es");
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ---------- Tema claro / oscuro ---------- */
  const THEME_KEY = "recruitpro_theme";
  const theme = {
    get() {
      return localStorage.getItem(THEME_KEY) || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    },
    apply(value, animate = false) {
      const root = document.documentElement;
      if (animate && !reducedMotion()) {
        root.classList.add("theme-transition");
        setTimeout(() => root.classList.remove("theme-transition"), 350);
      }
      root.setAttribute("data-theme", value);
      document.querySelectorAll("[data-theme-toggle]").forEach((b) => {
        b.setAttribute("aria-label", value === "dark" ? "Activar modo claro" : "Activar modo oscuro");
        b.innerHTML = icon(value === "dark" ? "sun" : "moon");
      });
      refreshIcons();
    },
    toggle() {
      const next = theme.get() === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_KEY, next);
      theme.apply(next, true);
    },
  };

  /* ---------- Announce (Accesibilidad para lectores de pantalla) ---------- */
  function announce(message) {
    let el = document.getElementById("rp-live-announcer");
    if (!el) {
      el = document.createElement("div");
      el.id = "rp-live-announcer";
      el.className = "sr-only";
      el.setAttribute("aria-live", "polite");
      el.setAttribute("aria-atomic", "true");
      document.body.appendChild(el);
    }
    el.textContent = "";
    setTimeout(() => { el.textContent = String(message || ""); }, 60);
  }

  window.ui = {
    esc, icon, refreshIcons, button, setBusy, avatar, initials, badge, progressRing,
    skeleton, emptyState, toast, confirm: confirmDialog, menu, closeMenu, countUp, theme, reducedMotion, announce,
  };
})();
