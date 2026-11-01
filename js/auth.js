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

    if (!response.ok) {
      const result = await response.json();
      error.textContent = Array.isArray(result.detail)
        ? result.detail.map((item) => item.msg).join(" ")
        : result.detail || "No se pudo iniciar sesión.";
      error.classList.add("show");
      return;
    }

    location.href = "dashboard.html";
  } catch (requestError) {
    console.error("No se pudo iniciar sesión:", requestError);
    error.textContent = "No se pudo conectar con el servidor. Inténtalo de nuevo.";
    error.classList.add("show");
  }
}

function togglePassword() {
  const input = document.getElementById("password");
  input.type = input.type === "password" ? "text" : "password";
}
