async function csrfToken() {
  const response = await fetch("/api/auth/csrf", { credentials: "same-origin" });
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

  try {
    const response = await fetch("/api/auth/register", {
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

    const result = await response.json();
    if (!response.ok) {
      message.textContent = Array.isArray(result.detail)
        ? result.detail.map((item) => item.msg).join(" ")
        : result.detail || "No se pudo crear la cuenta.";
      message.classList.add("show");
      return;
    }

    // Acceso directo e inmediato al panel
    location.href = "dashboard.html";
  } catch (requestError) {
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
