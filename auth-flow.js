import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.AEGIS_CONFIG || {};
const supabase = config.supabaseUrl && config.supabaseAnonKey
  ? createClient(config.supabaseUrl, config.supabaseAnonKey)
  : null;
const username = String(config.loginUsername || "matin").trim();
const loginEmail = String(config.loginEmail || "").trim();
let manualAccessGranted = false;

const dialog = () => document.querySelector("#auth-dialog");
const form = () => dialog()?.querySelector("form");

function message(target, text) {
  const element = document.querySelector(target);
  if (element) element.textContent = text;
}

function ensureGate() {
  if (document.querySelector("#aegis-auth-gate")) return;
  document.body.insertAdjacentHTML("beforeend", `
    <section id="aegis-auth-gate" aria-label="AEGIS Command sign in">
      <form class="auth-gate-card" novalidate>
        <p class="auth-gate-eyebrow">AEGIS COMMAND // SECURE ACCESS</p>
        <h1>Welcome, sir.</h1>
        <p>Input credentials to enter the command center.</p>
        <label>Username <input id="gate-username" required autocomplete="username" value="${username}" /></label>
        <label>Password <input id="gate-password" required type="password" minlength="8" autocomplete="current-password" placeholder="••••••••" /></label>
        <p id="gate-message" class="auth-gate-message" role="status"></p>
        <button class="primary" id="gate-sign-in" type="submit">Enter command center</button>
      </form>
    </section>`);
}

function syncGate(session) {
  ensureGate();
  const authorizedSession = session && manualAccessGranted ? session : null;
  window.AEGIS_AUTH_RESOLVED = true;
  window.AEGIS_AUTH_SESSION = authorizedSession;
  // Keep the gate in place while the private dashboard prepares its first
  // useful frame. Removing it immediately made the login feel like a browser
  // freeze even though the same startup work was already underway.
  document.body.classList.add("requires-auth");
  if (authorizedSession) message("#gate-message", "Opening command center…");
  window.dispatchEvent(new CustomEvent("aegis:auth-ready", { detail: { session: authorizedSession } }));
}

function renderAccessForm(session) {
  const target = form();
  if (!target) return;
  target.innerHTML = `
    <button class="dialog-close" type="button" aria-label="Close">×</button>
    <p class="eyebrow blue-text">ACCOUNT ACCESS</p>
    <h2>Set your password.</h2>
    <p class="auth-copy">Your direct login name is <strong>${username}</strong>. Set this once while you are signed in; future access will require only your username and password.</p>
    <label>New password <input id="auth-password" required type="password" minlength="8" autocomplete="new-password" placeholder="At least 8 characters" /></label>
    <p id="auth-message" class="auth-message"></p>
    <button class="primary" id="save-password" type="button">Save password</button>`;
}

async function getSession() {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

async function openAccountAccess() {
  if (!supabase) return alert("Secure access will activate after the Supabase connection is added.");
  const session = await getSession();
  if (!session) return;
  renderAccessForm(session);
  dialog()?.showModal();
}

async function signOut() {
  const session = await getSession();
  if (!session || !window.confirm("Sign out of AEGIS Command?")) return;
  manualAccessGranted = false;
  const { error } = await supabase.auth.signOut();
  if (error) return alert(error.message);
}

async function signIn(submittedUsername, password) {
  if (!loginEmail) return "Login email is not configured yet.";
  if (submittedUsername.trim().toLowerCase() !== username.toLowerCase()) return "Credentials not recognized.";
  const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
  if (!error && data?.session) {
    manualAccessGranted = true;
    syncGate(data.session);
  }
  return error?.message || "";
}

document.addEventListener("submit", async (event) => {
  if (!event.target.matches(".auth-gate-card")) return;
  event.preventDefault();
  const submittedUsername = document.querySelector("#gate-username")?.value || "";
  const password = document.querySelector("#gate-password")?.value || "";
  if (!submittedUsername || password.length < 8) return message("#gate-message", "Enter your username and password.");
  message("#gate-message", "Verifying credentials…");
  const error = await signIn(submittedUsername, password);
  if (error) return message("#gate-message", error);
  message("#gate-message", "Access granted.");
}, { capture: true });

document.addEventListener("click", async (event) => {
  const authButton = event.target.closest("#auth-button");
  const signOutButton = event.target.closest("#auth-signout");
  const close = event.target.closest("#auth-dialog .dialog-close");
  const savePassword = event.target.closest("#save-password");

  if (authButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return openAccountAccess();
  }
  if (signOutButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return signOut();
  }
  if (close) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return dialog()?.close();
  }
  if (!savePassword) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  const password = document.querySelector("#auth-password")?.value || "";
  if (password.length < 8) return message("#auth-message", "Use a password with at least 8 characters.");
  message("#auth-message", "Saving password…");
  const { error } = await supabase.auth.updateUser({ password });
  message("#auth-message", error ? error.message : "Password saved. Direct login is now active.");
}, { capture: true });

window.AEGIS_AUTH_RESOLVED = false;
window.AEGIS_AUTH_SESSION = null;
ensureGate();
window.addEventListener("aegis:operations-ready", () => {
  if (window.AEGIS_AUTH_SESSION) document.body.classList.remove("requires-auth");
});
if (supabase) {
  // A saved browser session must never bypass the command-center lock screen.
  // Clear this device's stale token and wait for a deliberate password sign-in.
  supabase.auth.signOut({ scope: "local" }).finally(() => syncGate(null));
  supabase.auth.onAuthStateChange((_event, session) => syncGate(session));
} else {
  syncGate(null);
}
