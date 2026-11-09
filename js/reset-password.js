document.getElementById("reset-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const token = new URLSearchParams(location.search).get("token");
  const newPassword = document.getElementById("new-password").value;
  const message = document.getElementById("reset-message");
  if (!token) {
    message.textContent = "El enlace de recuperación no contiene un token.";
    message.classList.add("is-error");
    return;
  }
  try {
    const csrfResponse = await fetch("/api/auth/csrf", { credentials: "same-origin" });
    if (!csrfResponse.ok) throw new Error("No se pudo iniciar una solicitud segura.");
    const { csrfToken } = await csrfResponse.json();
    const response = await fetch("/api/auth/password-reset/confirm", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
      body: JSON.stringify({ token, new_password: newPassword }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || "No se pudo actualizar la contraseña.");
    message.textContent = result.message;
    message.classList.remove("is-error");
    event.currentTarget.reset();
  } catch (error) {
    console.error("No se pudo restablecer la contraseña:", error);
    message.textContent = error.message;
    message.classList.add("is-error");
  }
});
