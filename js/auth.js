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
  const statusCard = document.getElementById("auth-status-card");
  const statusTitle = document.getElementById("auth-status-title");
  const statusSubtitle = document.getElementById("auth-status-subtitle");
  const progressBar = document.getElementById("auth-bottom-progress-bar");

  // Fase 1: Verificando (Cero redundancia)
  if (loginBtn) {
    loginBtn.disabled = true;
    loginBtn.style.opacity = "0.7";
    loginBtn.textContent = "Autenticando...";
  }

  if (statusCard) {
    statusCard.classList.remove("success");
    statusCard.style.display = "flex";
  }
  if (statusTitle) statusTitle.textContent = "Verificando credenciales...";
  if (statusSubtitle) statusSubtitle.textContent = "Conectando con el servidor seguro...";
  if (progressBar) progressBar.style.width = "20%";

  let progressVal = 20;
  const progressInterval = setInterval(() => {
    if (progressVal < 86) {
      progressVal += Math.floor(Math.random() * 8) + 4;
      if (progressBar) progressBar.style.width = `${Math.min(86, progressVal)}%`;
    }
  }, 400);

  // Mensaje discreto si el servidor en la nube demora en arrancar
  const serverWakeupTimeout = setTimeout(() => {
    if (statusSubtitle) {
      statusSubtitle.textContent = "Activando servidor en la nube... ¡Ya casi!";
    }
  }, 3500);

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

    clearInterval(progressInterval);
    clearTimeout(serverWakeupTimeout);

    if (!response.ok) {
      if (statusCard) statusCard.style.display = "none";
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

    // Fase 2: Éxito sincronizado (Linear / Stripe style)
    if (loginBtn) {
      loginBtn.textContent = "Sesión iniciada";
      loginBtn.disabled = true;
      loginBtn.style.opacity = "0.7";
    }

    if (statusCard) statusCard.classList.add("success");
    if (statusTitle) statusTitle.textContent = "Acceso autorizado";
    if (statusSubtitle) statusSubtitle.textContent = "Preparando tu espacio en RecruitPro...";
    if (progressBar) progressBar.style.width = "100%";

    setTimeout(() => {
      location.href = "dashboard.html";
    }, 450);
  } catch (requestError) {
    clearInterval(progressInterval);
    clearTimeout(serverWakeupTimeout);

    if (statusCard) statusCard.style.display = "none";
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
