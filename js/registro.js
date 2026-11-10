let apiBase = "/api";

async function csrfToken() {
  let response = await fetch(`${apiBase}/auth/csrf`, { credentials: "same-origin" });
  if (response.status === 404 && apiBase === "/api") {
    apiBase = "/api/index.php";
    response = await fetch(`${apiBase}/auth/csrf`, { credentials: "same-origin" });
  }
  if (!response.ok) throw new Error("No se pudo iniciar una solicitud segura.");
  return (await response.json()).csrfToken;
}

async function register() {
  const nameInput = document.getElementById("name");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const consent = document.getElementById("privacy-consent");
  if (
    !nameInput.reportValidity() ||
    !emailInput.reportValidity() ||
    !passwordInput.reportValidity() ||
    !consent.reportValidity()
  ) return;

  const message = document.getElementById("error");
  message.classList.remove("show");

  const registerBtn = document.getElementById("register-btn");
  const loader = document.getElementById("auth-loader");
  const progressBar = document.getElementById("auth-progress-fill");
  const statusText = document.getElementById("auth-status-text");
  const subTip = document.getElementById("auth-sub-tip");

  if (registerBtn) {
    registerBtn.disabled = true;
    registerBtn.style.opacity = "0.6";
    registerBtn.textContent = "Creando cuenta...";
  }
  if (loader) loader.style.display = "block";
  if (progressBar) {
    progressBar.classList.remove("success");
    progressBar.style.width = "18%";
  }
  if (statusText) {
    statusText.classList.remove("success");
    statusText.textContent = "Registrando tu perfil...";
  }
  if (subTip) subTip.style.display = "none";

  const messages = [
    "Creando tu espacio en RecruitPro...",
    "Cifrando credenciales de seguridad...",
    "Inicializando base de datos...",
    "Casi listo, preparando tu panel de control..."
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

  const tipTimeout = setTimeout(() => {
    if (subTip) subTip.style.display = "block";
  }, 4500);

  try {
    let response = await fetch(`${apiBase}/auth/register`, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": await csrfToken(),
      },
      body: JSON.stringify({
        name: nameInput.value.trim(),
        email: emailInput.value.trim().toLowerCase(),
        password: passwordInput.value,
        privacy_consent: consent.checked,
      }),
    });

    if (response.status === 404 && apiBase === "/api") {
      apiBase = "/api/index.php";
      response = await fetch(`${apiBase}/auth/register`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": await csrfToken(),
        },
        body: JSON.stringify({
          name: nameInput.value.trim(),
          email: emailInput.value.trim().toLowerCase(),
          password: passwordInput.value,
          privacy_consent: consent.checked,
        }),
      });
    }

    clearInterval(messageInterval);
    clearInterval(progressInterval);
    clearTimeout(tipTimeout);

    const result = await response.json();
    if (!response.ok) {
      if (loader) loader.style.display = "none";
      if (registerBtn) {
        registerBtn.disabled = false;
        registerBtn.style.opacity = "1";
        registerBtn.textContent = "Crear cuenta";
      }
      message.textContent = Array.isArray(result.detail)
        ? result.detail.map((item) => item.msg).join(" ")
        : result.detail || "No se pudo crear la cuenta.";
      message.classList.add("show");
      return;
    }

    if (progressBar) {
      progressBar.classList.add("success");
      progressBar.style.width = "100%";
    }
    if (statusText) {
      statusText.classList.add("success");
      statusText.textContent = "¡Cuenta creada con éxito! Entrando...";
    }

    // Acceso directo e inmediato al panel
    setTimeout(() => {
      location.href = "dashboard.html";
    }, 450);
  } catch (requestError) {
    clearInterval(messageInterval);
    clearInterval(progressInterval);
    clearTimeout(tipTimeout);

    if (loader) loader.style.display = "none";
    if (registerBtn) {
      registerBtn.disabled = false;
      registerBtn.style.opacity = "1";
      registerBtn.textContent = "Crear cuenta";
    }

    console.error("No se pudo completar el registro:", requestError);
    message.textContent = requestError.message || "No se pudo conectar con el servidor. Inténtalo de nuevo.";
    message.classList.add("show");
  }
}

async function resendVerification() {
  const email = document.getElementById("email").value.trim().toLowerCase();
  const message = document.getElementById("email-notice");
  try {
    const response = await fetch("/api/auth/verification/resend", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": await csrfToken(),
      },
      body: JSON.stringify({ email }),
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

async function loadPrivacyNotice() {
  try {
    const response = await fetch("/api/privacy");
    if (!response.ok) throw new Error("No se pudo cargar el aviso de privacidad.");
    const privacy = await response.json();
    document.getElementById("privacy-notice").textContent = privacy.notice;
  } catch (error) {
    console.error("No se pudo cargar el aviso de privacidad:", error);
    document.getElementById("privacy-notice").textContent =
      "Consulta el aviso de privacidad antes de crear tu cuenta.";
  }
}

loadPrivacyNotice();
