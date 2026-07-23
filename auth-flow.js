import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.AEGIS_CONFIG || {};
const supabase = config.supabaseUrl && config.supabaseAnonKey
  ? createClient(config.supabaseUrl, config.supabaseAnonKey)
  : null;

const dialog = () => document.querySelector("#auth-dialog");
const form = () => dialog()?.querySelector("form");

function message(text) {
  const target = document.querySelector("#auth-message");
  if (target) target.textContent = text;
}

function renderAccessForm(session) {
  const target = form();
  if (!target) return;

  if (session) {
    target.innerHTML = `
      <button class="dialog-close" type="button" aria-label="Close">×</button>
      <p class="eyebrow blue-text">ACCOUNT ACCESS</p>
      <h2>Set your password.</h2>
      <p class="auth-copy">You are signed in as ${session.user.email}. Create a password once; every future login is direct.</p>
      <label>Password <input id="auth-password" required type="password" minlength="8" autocomplete="new-password" placeholder="At least 8 characters" /></label>
      <p id="auth-message" class="auth-message"></p>
      <button class="primary" id="save-password" type="button">Save password</button>`;
    return;
  }

  target.innerHTML = `
    <button class="dialog-close" type="button" aria-label="Close">×</button>
    <p class="eyebrow blue-text">ACCOUNT ACCESS</p>
    <h2>Sign in to AEGIS.</h2>
    <p class="auth-copy">Use your email as your username and the password you set. No magic links.</p>
    <label>Username / email <input id="auth-email" required type="email" autocomplete="username" placeholder="you@example.com" /></label>
    <label>Password <input id="auth-password" required type="password" autocomplete="current-password" placeholder="Your password" /></label>
    <p id="auth-message" class="auth-message"></p>
    <button class="primary" id="sign-in-password" type="button">Sign in</button>`;
}

async function getSession() {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

async function openAccountAccess() {
  if (!supabase) return alert("Secure access will activate after the Supabase connection is added.");
  renderAccessForm(await getSession());
  dialog()?.showModal();
}

async function signOut() {
  const session = await getSession();
  if (!session || !window.confirm(`Sign out of AEGIS Command for ${session.user.email}?`)) return;
  const { error } = await supabase.auth.signOut();
  if (error) return alert(error.message);
  window.location.reload();
}

document.addEventListener("click", async (event) => {
  const authButton = event.target.closest("#auth-button");
  const signOutButton = event.target.closest("#auth-signout");
  const close = event.target.closest("#auth-dialog .dialog-close");
  const signIn = event.target.closest("#sign-in-password");
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
  if (!signIn && !savePassword) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  if (!supabase) return message("Supabase is not connected yet.");

  const password = document.querySelector("#auth-password")?.value || "";
  if (password.length < 8) return message("Use a password with at least 8 characters.");

  if (savePassword) {
    message("Saving password…");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return message(error.message);
    message("Password saved. You can now sign in directly.");
    return;
  }

  const email = document.querySelector("#auth-email")?.value.trim();
  if (!email) return message("Enter your email address first.");
  message("Signing in…");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return message(error.message);
  dialog()?.close();
  window.location.reload();
}, { capture: true });
