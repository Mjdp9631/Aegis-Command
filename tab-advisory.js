import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.AEGIS_CONFIG || {};
const supabase = config.supabaseUrl && config.supabaseAnonKey ? createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const $ = (selector) => document.querySelector(selector);
let currentSectionAdvice = null;

const messages = {
  detective: ["The useful answer is inside the filtered evidence. Keep looking until the edge is specific.", "Do not allow one result to rewrite a well-kept record."],
  missions: ["Priority is a decision to leave other things undone for now.", "One proper objective is worth more than five noble intentions."],
  enterprise: ["Assets compound when they are shipped, measured, and improved.", "Build something useful enough that you would be proud to attach your name to it."],
  recovery: ["Recovery data is mission intelligence. Respect it before making the next call.", "There is no prize for rushing a foundation, sir."],
  mastery: ["Learning becomes leverage only when it is captured and used.", "Take the lesson with you, sir. Knowledge is meant to improve the next decision."],
  character: ["Your character sheet is simply the evidence made visible.", "Keep the promises small enough to keep, then keep them without drama."]
};

function advisoryMarkup([jarvis, alfred], label = "JARVIS / ALFRED PROTOCOL") {
  return `<section class="panel tab-advisory"><p class="eyebrow">${label}</p><div class="protocol-line"><p>&ldquo;${jarvis}&rdquo;</p><span>- JARVIS</span></div><div class="protocol-line"><p>&ldquo;${alfred}&rdquo;</p><span>- ALFRED</span></div></section>`;
}

function renderFooters(sectionAdvice = null) {
  if (sectionAdvice) currentSectionAdvice = sectionAdvice;
  Object.entries(messages).forEach(([view, message]) => {
    const target = $(`#${view}`);
    if (!target) return;
    const savedAdvice = currentSectionAdvice?.[view];
    const advice = savedAdvice ? [savedAdvice.jarvis, savedAdvice.alfred] : message;
    if (view === "character") {
      const note = target.querySelector(".evidence-note");
      if (note && savedAdvice) note.innerHTML = `<p class="eyebrow">JARVIS / ALFRED PROTOCOL</p><div class="protocol-line"><p>&ldquo;${savedAdvice.jarvis}&rdquo;</p><span>- JARVIS</span></div><div class="protocol-line"><p>&ldquo;${savedAdvice.alfred}&rdquo;</p><span>- ALFRED</span></div>`;
      return;
    }
    const existing = target.querySelector(":scope > .tab-advisory");
    if (!existing) target.insertAdjacentHTML("beforeend", advisoryMarkup(advice));
    else if (sectionAdvice?.[view]) existing.outerHTML = advisoryMarkup(advice);
  });
}

function styleCommandBriefing() {
  const briefing = $(".intel-strip");
  const text = $("#briefing-text");
  if (!briefing || !text || briefing.dataset.dualFormat === "true") return;
  const original = text.textContent.trim();
  const copy = briefing.querySelector("div");
  if (!copy) return;
  briefing.classList.add("tab-advisory", "command-briefing");
  copy.innerHTML = `<div class="signal-primary"><p class="eyebrow">COMMAND DAILY SIGNAL</p><div class="protocol-line"><p id="briefing-text">${original}</p><span>- JARVIS</span></div><div class="protocol-line alfred-signal"><p>Keep the standard simple, sir: complete the next clear action before entertaining the next one.</p><span>- ALFRED</span></div></div><div class="signal-columns"><article><span>MARKET TONE</span><b id="signal-market-tone">AWAITING DATA</b></article><article><span>OPPORTUNITY WINDOW</span><b id="signal-window">AWAITING PLAN</b></article><article><span>FOCUS AREAS</span><b id="signal-focus">AWAITING MISSION</b></article><article><span>RISK POSTURE</span><b id="signal-risk">AWAITING REVIEW</b></article></div>`;
  briefing.dataset.dualFormat = "true";
}

styleCommandBriefing();
renderFooters();
async function loadSectionAdvice() {
  if (!supabase) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  const { data } = await supabase.from("ai_advisories").select("payload").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (data?.payload?.sections) renderFooters(data.payload.sections);
}

window.addEventListener("aegis:advisory-updated", (event) => renderFooters(event.detail?.sections));
if (supabase) {
  supabase.auth.getSession().then(loadSectionAdvice);
  supabase.auth.onAuthStateChange((_event, session) => { if (session) setTimeout(loadSectionAdvice, 120); });
}
window.addEventListener("load", () => { styleCommandBriefing(); renderFooters(); }, { once: true });
