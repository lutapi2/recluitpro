document.getElementById("recovery-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.getElementById("recovery-email").value.trim().toLowerCase();
  const message = document.getElementById("recovery-message");
  let apiBase = "/api";
  try {
    let csrfResponse = await fetch(`${apiBase}/auth/csrf`, { credentials: "same-origin" });
    if (csrfResponse.status === 404) {
      apiBase = "/api/index.php";
      csrfResponse = await fetch(`${apiBase}/auth/csrf`, { credentials: "same-origin" });
    }
    if (!csrfResponse.ok) throw new Error("No se pudo iniciar una solicitud segura.");
    const { csrfToken } = await csrfResponse.json();
    let response = await fetch(`${apiBase}/auth/password-reset`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
      body: JSON.stringify({ email }),
    });
    if (response.status === 404 && apiBase === "/api") {
      apiBase = "/api/index.php";
      response = await fetch(`${apiBase}/auth/password-reset`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ email }),
      });
    }
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || "No se pudo solicitar la recuperación.");
    message.textContent = result.message;
    message.classList.remove("is-error");
  } catch (error) {
    console.error("No se pudo solicitar la recuperación:", error);
    message.textContent = error.message;
    message.classList.add("is-error");
  }
});
