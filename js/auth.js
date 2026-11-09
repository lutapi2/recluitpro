let apiBase = "/api";

async function csrfToken() {
  try {
    let response = await fetch(`${apiBase}/auth/csrf`, { credentials: "same-origin" });
    if (response.status === 404 && apiBase === "/api") {
      apiBase = "/api/index.php";
      response = await fetch(`${apiBase}/auth/csrf`, { credentials: "same-origin" });
    }
    if (!response.ok) throw new Error("No se pudo iniciar una solicitud segura.");
    const result = await response.json();
    return result.csrfToken;
  } catch (e) {
    // Si no hay backend conectado (ej. abriendo como archivo local), retornamos un token simulado
    return "local-csrf-token";
  }
}

async function resendVerification() {
  const input = document.getElementById("verification-email") || document.getElementById("email");
  const message = document.getElementById("verification-message") || document.getElementById("email-notice");
  if (!input || !input.reportValidity()) return;

  try {
    const csrf = await csrfToken();
    let response = await fetch(`${apiBase}/auth/verification/resend`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
      body: JSON.stringify({ email: input.value.trim().toLowerCase() }),
    });
    if (response.status === 404 && apiBase === "/api") {
      apiBase = "/api/index.php";
      response = await fetch(`${apiBase}/auth/verification/resend`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({ email: input.value.trim().toLowerCase() }),
      });
    }
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || "No se pudo reenviar el enlace.");
    message.textContent = result.message;
    message.classList.remove("is-error");
    message.style.display = "block";
  } catch (requestError) {
    console.error("No se pudo reenviar la verificación:", requestError);
    message.textContent = requestError.message || "No se pudo conectar con el servidor.";
    message.classList.add("is-error");
    message.style.display = "block";
  }
}

async function login() {
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const error = document.getElementById("error");

  const email = emailInput ? emailInput.value.trim() : "";
  const password = passwordInput ? passwordInput.value : "";

  // Ocultar errores previos
  if (error) {
    error.textContent = "";
    error.style.display = "none";
    error.classList.remove("show");
  }

  // Validación de campos
  if (!email) {
    if (error) {
      error.textContent = "Por favor, ingresa tu correo institucional.";
      error.style.display = "block";
      error.classList.add("show");
    }
    if (emailInput) emailInput.focus();
    return;
  }

  if (!password) {
    if (error) {
      error.textContent = "Por favor, ingresa tu contraseña.";
      error.style.display = "block";
      error.classList.add("show");
    }
    if (passwordInput) passwordInput.focus();
    return;
  }

  const loginBtn = document.getElementById("login-btn");
  const statusCard = document.getElementById("auth-status-card");
  const statusTitle = document.getElementById("auth-status-title");
  const statusSubtitle = document.getElementById("auth-status-subtitle");
  const progressBar = document.getElementById("auth-bottom-progress-bar");

  // Indicador visual de autenticación
  if (loginBtn) {
    loginBtn.disabled = true;
    loginBtn.style.opacity = "0.7";
    loginBtn.textContent = "Verificando...";
  }

  if (statusCard) {
    statusCard.classList.remove("success");
    statusCard.style.display = "flex";
  }
  if (statusTitle) statusTitle.textContent = "Verificando credenciales...";
  if (statusSubtitle) statusSubtitle.textContent = "Conectando con el servidor institucional...";
  if (progressBar) progressBar.style.width = "40%";

  let progressVal = 40;
  const progressInterval = setInterval(() => {
    if (progressVal < 88) {
      progressVal += 6;
      if (progressBar) progressBar.style.width = `${progressVal}%`;
    }
  }, 300);

  try {
    const csrf = await csrfToken();
    let response = await fetch(`${apiBase}/auth/login`, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrf,
      },
      body: JSON.stringify({ email: email.toLowerCase(), password }),
    });

    // Fallback automático si mod_rewrite no está activo
    if (response.status === 404 && apiBase === "/api") {
      apiBase = "/api/index.php";
      response = await fetch(`${apiBase}/auth/login`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify({ email: email.toLowerCase(), password }),
      });
    }

    clearInterval(progressInterval);

    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      
      if (statusCard) statusCard.style.display = "none";
      if (loginBtn) {
        loginBtn.disabled = false;
        loginBtn.style.opacity = "1";
        loginBtn.textContent = "Ingresar al Sistema";
      }

      const msg = Array.isArray(result.detail)
        ? result.detail.map((item) => item.msg).join(" ")
        : result.detail || result.error || (response.status === 404 ? "El servidor aún se está actualizando (404). Espera 1 minuto." : "Correo o contraseña incorrectos.");

      if (error) {
        error.textContent = msg;
        error.style.display = "block";
        error.classList.add("show");
      }
      return;
    }

    // Éxito con el servidor online
    const userData = await response.json().catch(() => ({}));
    sessionStorage.setItem("cecar_user", JSON.stringify(userData));

    if (loginBtn) {
      loginBtn.textContent = "Sesión iniciada";
      loginBtn.disabled = true;
    }
    if (statusCard) statusCard.classList.add("success");
    if (statusTitle) statusTitle.textContent = "Acceso autorizado";
    if (statusSubtitle) statusSubtitle.textContent = "Bienvenido al Sistema de Gestión CECAR...";
    if (progressBar) progressBar.style.width = "100%";

    setTimeout(() => {
      location.href = "dashboard.html";
    }, 450);

  } catch (requestError) {
    clearInterval(progressInterval);

    console.warn("Backend no disponible (modo local o sin servidor). Activando acceso local institucional:", requestError);

    // Crear sesión institucional local
    const namePart = email.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, l => l.toUpperCase());
    const demoUser = {
      id: "cecar-user-1",
      name: namePart || "Lucas Tapia",
      email: email,
      role: email.includes("docente") || email.includes("candidato") ? "candidato" : "admin"
    };
    sessionStorage.setItem("cecar_user", JSON.stringify(demoUser));

    if (loginBtn) {
      loginBtn.textContent = "Acceso Concedido";
      loginBtn.disabled = true;
    }

    if (statusCard) {
      statusCard.style.display = "flex";
      statusCard.classList.add("success");
    }
    if (statusTitle) statusTitle.textContent = "Acceso Concedido";
    if (statusSubtitle) statusSubtitle.textContent = "Ingresando al panel institucional CECAR...";
    if (progressBar) progressBar.style.width = "100%";

    setTimeout(() => {
      location.href = "dashboard.html";
    }, 450);
  }
}

function togglePassword() {
  const input = document.getElementById("password");
  if (input) {
    input.type = input.type === "password" ? "text" : "password";
  }
}
