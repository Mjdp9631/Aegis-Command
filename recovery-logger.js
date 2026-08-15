import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.AEGIS_CONFIG || {};
const $ = (selector) => document.querySelector(selector);
const easternDateKey = (value = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);

function setStatus(message) {
  const status = $("#recovery-save-status");
  if (status) status.textContent = message;
}

function renderLatestRecovery(log) {
  const state = $("#recovery-state");
  const summary = $("#recovery-summary");
  if (!state || !summary) return;
  state.textContent = log.rehab_completed ? "DONE" : "LOGGED";
  summary.innerHTML = `<div><span>Pain level</span><b>${log.pain}/10</b></div><div><span>Swelling</span><b>${log.swelling}/10</b></div><div><span>Prescribed rehab</span><b>${log.rehab_completed ? "Complete" : "Pending"}</b></div>`;
}

function bindRecoveryLogger() {
  const form = $("#recovery-dialog form");
  if (!form || window.AEGIS_RECOVERY_LOGGER_READY === true) return;
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    setStatus("Recovery logging is unavailable until the secure connection is configured.");
    return;
  }

  const client = createClient(config.supabaseUrl, config.supabaseAnonKey);
  window.AEGIS_RECOVERY_LOGGER_READY = true;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const saveButton = $("#save-recovery");
    const pain = Number($("#recovery-pain").value);
    const swelling = Number($("#recovery-swelling").value);
    const logged_on = $("#recovery-logged-on").value || easternDateKey();
    if (!Number.isInteger(pain) || !Number.isInteger(swelling) || pain < 0 || pain > 10 || swelling < 0 || swelling > 10 || !logged_on) {
      setStatus("Enter pain and swelling from 0 to 10 before saving.");
      return;
    }
    if (saveButton) saveButton.disabled = true;
    setStatus("Saving recovery report…");
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError || !sessionData?.session) {
      if (saveButton) saveButton.disabled = false;
      setStatus("Your sign-in expired. Refresh the page, then sign in again.");
      return;
    }
    const { data, error } = await client.from("recovery_logs").insert({
      user_id: sessionData.session.user.id,
      logged_on,
      pain,
      swelling,
      rehab_completed: $("#recovery-rehab").checked,
      notes: $("#recovery-notes").value.trim(),
    }).select().single();
    if (saveButton) saveButton.disabled = false;
    if (error) {
      setStatus(`Could not save: ${error.message}`);
      return;
    }
    renderLatestRecovery(data);
    $("#recovery-notes").value = "";
    setStatus("Saved.");
    $("#recovery-dialog")?.close();
    window.dispatchEvent(new CustomEvent("aegis:data-changed", { detail: { source: "recovery" } }));
  });
}

bindRecoveryLogger();
