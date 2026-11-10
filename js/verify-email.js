async function verifyEmail() {
  const token = new URLSearchParams(location.search).get("token");
  const message = document.getElementById("verification-result");
  const button = document.getElementById("verify-button");
  if (!token) {
    message.textContent = "El enlace de verificación no contiene un token.";
    message.classList.add("is-error");
    button.disabled = true;
    return;
  }

  button.disabled = true;
  let apiBase = "/api";
  try {
    let csrfResponse = await fetch(`${apiBase}/auth/csrf`, { credentials: "same-origin" });
    if (csrfResponse.status === 404) {
      apiBase = "/api/index.php";
      csrfResponse = await fetch(`${apiBase}/auth/csrf`, { credentials: "same-origin" });
    }
    if (!csrfResponse.ok) throw new Error("No se pudo iniciar una solicitud segura.");
    const { csrfToken } = await csrfResponse.json();
    let response = await fetch(`${apiBase}/auth/verify-email`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
      body: JSON.stringify({ token }),
    });
    if (response.status === 404 && apiBase === "/api") {
      apiBase = "/api/index.php";
      response = await fetch(`${apiBase}/auth/verify-email`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ token }),
      });
    }
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || "No se pudo verificar el correo.");
    location.href = "dashboard.html";
  } catch (error) {
    console.error("No se pudo verificar el correo:", error);
    message.textContent = error.message;
    message.classList.add("is-error");
    button.disabled = false;
  }
}
