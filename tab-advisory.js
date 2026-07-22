const $ = (selector) => document.querySelector(selector);

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

function renderFooters() {
  Object.entries(messages).forEach(([view, message]) => {
    // Character Systems owns its evidence-note protocol; adding a second footer duplicates it.
    if (view === "character") return;
    const target = $(`#${view}`);
    if (target && !target.querySelector(":scope > .tab-advisory")) target.insertAdjacentHTML("beforeend", advisoryMarkup(message));
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
  copy.innerHTML = `<p class="eyebrow">COMMAND DAILY SIGNAL</p><div class="protocol-line"><p id="briefing-text">${original}</p><span>- JARVIS</span></div><div class="protocol-line"><p>&ldquo;Close the day with the same discipline you brought to its beginning, sir.&rdquo;</p><span>- ALFRED</span></div>`;
  briefing.dataset.dualFormat = "true";
}

styleCommandBriefing();
renderFooters();
new MutationObserver(() => renderFooters()).observe(document.body, { childList: true, subtree: true });
