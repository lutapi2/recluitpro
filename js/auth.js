async function csrfToken() {
  const response = await fetch("/api/auth/csrf", { credentials: "same-origin" });
  if (!response.ok) throw new Error("No se pudo iniciar una solicitud segura.");
  const result = await response.json();
  return result.csrfToken;
}

async function resendVerification() {
  const input = document.getElementById("verification-email") || document.getElementById("email");
  const message = document.getElementById("verification-message") || document.getElementById("email-notice");
  if (!input.reportValidity()) return;

  try {
    const csrf = await csrfToken();
    const response = await fetch("/api/auth/verification/resend", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
      body: JSON.stringify({ email: input.value.trim().toLowerCase() }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || "No se pudo reenviar el enlace.");
    message.textContent = result.message;
    message.classList.remove("is-error");
  } catch (requestError) {
    console.error("No se pudo reenviar la verificación:", requestError);
    message.textContent = requestError.message || "No se pudo conectar con el servidor.";
    message.classList.add("is-error");
  }
}

async function login() {
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  if (!emailInput.reportValidity() || !passwordInput.reportValidity()) return;

  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;
  const error = document.getElementById("error");
  error.classList.remove("show");

  const loginBtn = document.getElementById("login-btn");
  const loader = document.getElementById("auth-loader");
  const progressBar = document.getElementById("auth-progress-fill");
  const statusText = document.getElementById("auth-status-text");
  const subTip = document.getElementById("auth-sub-tip");

  // Activar estado de carga elegante
  if (loginBtn) {
    loginBtn.disabled = true;
    loginBtn.style.opacity = "0.6";
    loginBtn.textContent = "Verificando acceso...";
  }
  if (loader) loader.style.display = "block";
  if (progressBar) {
    progressBar.classList.remove("success");
    progressBar.style.width = "18%";
  }
  if (statusText) {
    statusText.classList.remove("success");
    statusText.textContent = "Iniciando verificación segura...";
  }
  if (subTip) subTip.style.display = "none";

  // Mensajes dinámicos que rotan mientras el servidor procesa
  const messages = [
    "🔐 Verificando credenciales con cifrado seguro...",
    "⚡ Conectando con la base de datos de RecruitPro...",
    "🚀 Despertando servicios en la nube...",
    "✨ Casi listo, preparando tu espacio de trabajo..."
  ];
  let msgIndex = 0;
  let progressVal = 18;

  const messageInterval = setInterval(() => {
    msgIndex = (msgIndex + 1) % messages.length;
    if (statusText) statusText.textContent = messages[msgIndex];
  }, 2400);

  const progressInterval = setInterval(() => {
    if (progressVal < 92) {
      progressVal += Math.floor(Math.random() * 8) + 4;
      if (progressBar) progressBar.style.width = `${Math.min(92, progressVal)}%`;
    }
  }, 600);

  // Tip amigable si el servidor tarda más de 4.5 segundos
  const tipTimeout = setTimeout(() => {
    if (subTip) subTip.style.display = "block";
  }, 4500);

  try {
    const csrf = await csrfToken();
    const response = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrf,
      },
      body: JSON.stringify({ email, password }),
    });

    clearInterval(messageInterval);
    clearInterval(progressInterval);
    clearTimeout(tipTimeout);

    if (!response.ok) {
      if (loader) loader.style.display = "none";
      if (loginBtn) {
        loginBtn.disabled = false;
        loginBtn.style.opacity = "1";
        loginBtn.textContent = "Iniciar sesión";
      }
      const result = await response.json();
      error.textContent = Array.isArray(result.detail)
        ? result.detail.map((item) => item.msg).join(" ")
        : result.detail || "No se pudo iniciar sesión.";
      error.classList.add("show");
      return;
    }

    // Éxito: Completar la barra al 100% en verde con mensaje de bienvenida
    if (progressBar) {
      progressBar.classList.add("success");
      progressBar.style.width = "100%";
    }
    if (statusText) {
      statusText.classList.add("success");
      statusText.textContent = "✓ ¡Acceso autorizado! Entrando a RecruitPro...";
    }

    setTimeout(() => {
      location.href = "dashboard.html";
    }, 450);
  } catch (requestError) {
    clearInterval(messageInterval);
    clearInterval(progressInterval);
    clearTimeout(tipTimeout);

    if (loader) loader.style.display = "none";
    if (loginBtn) {
      loginBtn.disabled = false;
      loginBtn.style.opacity = "1";
      loginBtn.textContent = "Iniciar sesión";
    }

    console.error("No se pudo iniciar sesión:", requestError);
    error.textContent = "No se pudo conectar con el servidor. Inténtalo de nuevo.";
    error.classList.add("show");
  }
}

function togglePassword() {
  const input = document.getElementById("password");
  input.type = input.type === "password" ? "text" : "password";
}
