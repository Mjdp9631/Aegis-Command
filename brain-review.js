import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.AEGIS_CONFIG || {};
const supabase = config.supabaseUrl && config.supabaseAnonKey ? createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const $ = (selector) => document.querySelector(selector);
let trades = [];
let reviews = [];
let chainStep = 0;
let chainAnswers = [];
let chainTerminal = "";
let briefingSlide = 0;

const esc = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[character]));
const setup = (value) => { try { return JSON.parse(value || "[]").join(" + "); } catch { return value || "—"; } };
const tradeNumberMap = () => new Map([...trades].sort((a, b) => new Date(a.traded_at || a.created_at) - new Date(b.traded_at || b.created_at)).map((trade, index) => [trade.id, index + 1]));
const tradeLabel = (trade) => `#${String(tradeNumberMap().get(trade.id) || 0).padStart(3, "0")} · ${new Date(trade.traded_at || trade.created_at).toLocaleDateString()} · ${trade.pair || "Pair"} · ${setup(trade.setup)} · ${trade.outcome || trade.trade_status || "Open"}`;

const CHAIN = [
  { id: "condition", title: "01 — Condition", question: "Can you name the active market condition without forcing it?", source: "condition", choices: [{ label: "Range", next: true }, { label: "Trending range", next: true }, { label: "Trend", next: true }, { label: "Unclear / mixed", stop: "No trade. The condition is not clear enough to build from." }] },
  { id: "location", title: "02 — Location", question: "Is price at a valid location rather than the middle of the condition?", source: "location", choices: [{ label: "Yes — valid outer half, quarter, or qualified continuation", next: true }, { label: "No — middle / undefined location", stop: "No trade. Location does not give the condition an edge." }] },
  { id: "trigger", title: "03 — Arrival & confirmation", question: "Did price arrive with meaningful behavior and then give structural proof?", source: "trigger", choices: [{ label: "Yes — meaningful arrival and confirmed shift", next: true }, { label: "Arrival is grinding / insignificant", stop: "No trade. Arrival is not meaningful enough." }, { label: "No structural confirmation yet", stop: "Wait. A prediction is not confirmation." }] },
  { id: "execution", title: "04 — Execution", question: "Is the entry actually offered by the system, without chasing or improvising?", source: "execution", choices: [{ label: "Yes — valid entry variant is offered", next: true }, { label: "Entry was missed / price is extended", stop: "Pass. A missed entry is not permission to chase." }, { label: "No valid variant is offered", stop: "Wait for the system to offer an execution." }] },
  { id: "risk", title: "05 — Risk", question: "Can the stop, target, and risk all be defined before entering?", source: "risk", choices: [{ label: "Yes — structural stop, derived target, permitted risk", next: true }, { label: "No — stop, target, or risk is unclear", stop: "No trade. Governance must be defined before exposure." }] }
];

function renderChain() {
  const root = $("#brain-chain");
  if (!root) return;
  const history = chainAnswers.map((answer, index) => `<div class="brain-chain-answer"><span>${esc(CHAIN[index].title)}</span><strong>${esc(answer)}</strong></div>`).join("");
  const back = chainAnswers.length ? '<button type="button" class="brain-chain-back" data-chain-back>Back one step</button>' : "";
  if (chainStep >= CHAIN.length) {
    root.innerHTML = chainTerminal ? `${history}<article class="brain-chain-result stop"><p class="eyebrow">SYSTEM RESULT</p><h4>${esc(chainTerminal)}</h4><button type="button" data-brain-jump="${CHAIN[chainAnswers.length - 1].source}">Read the source rule</button>${back}</article>` : `${history}<article class="brain-chain-result pass"><p class="eyebrow">SYSTEM RESULT</p><h4>Candidate is structurally eligible for review.</h4><p>This is not an instruction to enter. Re-check the complete source rules, then execute only what is actually offered.</p><button type="button" data-brain-jump="risk">Read risk governance</button>${back}</article>`;
    return;
  }
  const step = CHAIN[chainStep];
  root.innerHTML = `${history}<article class="brain-chain-question"><p class="eyebrow">${esc(step.title)}</p><h4>${esc(step.question)}</h4><div class="brain-chain-options">${step.choices.map((choice, index) => `<button type="button" data-chain-choice="${index}">${esc(choice.label)}</button>`).join("")}</div><div class="brain-chain-actions"><button type="button" class="brain-chain-source" data-brain-jump="${step.source}">Open the source rule</button>${back}</div></article>`;
}

function renderReview(review) {
  const verdictClass = String(review.verdict || "").toLowerCase().replaceAll(" ", "-");
  const audit = (review.rule_audit || []).map((item) => `<article class="review-rule"><strong>${esc(item.rule)}</strong><span class="review-status ${esc(String(item.status || "").toLowerCase().replaceAll(" ", "-"))}">${esc(item.status)}</span><p>${esc(item.evidence)}</p><small>${esc(item.source_reference)}</small></article>`).join("");
  return `<article class="brain-review-card"><div class="brain-review-card-head"><div><p class="eyebrow blue-text">SYSTEM AUDIT</p><h3>${esc(review.process_grade || "Process review")}</h3></div><span class="review-verdict ${verdictClass}">${esc(review.verdict || "Pending")}</span></div><p>${esc(review.executive_summary || "No summary returned.")}</p><div class="review-columns"><div><h4>Observed evidence</h4><ul>${(review.observed_evidence || []).map((item) => `<li>${esc(item)}</li>`).join("") || "<li>No decisive evidence captured.</li>"}</ul></div><div><h4>Missing evidence</h4><ul>${(review.missing_evidence || []).map((item) => `<li>${esc(item)}</li>`).join("") || "<li>None identified.</li>"}</ul></div></div><div class="review-rules">${audit}</div><div class="thesis-compare"><h4>Thesis comparison</h4><p><b>Where it aligns:</b> ${(review.thesis_comparison?.matches || []).map(esc).join("; ") || "No alignment established."}</p><p><b>Correction:</b> ${esc(review.thesis_comparison?.correction || "No correction returned.")}</p></div><p class="review-focus"><b>Next review focus:</b> ${esc(review.next_review_focus || "Capture the full evidence chain.")}</p></article>`;
}

function renderHistory() {
  const list = $("#brain-review-history-list"); const count = $("#brain-review-count");
  if (!list || !count) return;
  count.textContent = `${reviews.length} REVIEW${reviews.length === 1 ? "" : "S"}`;
  list.innerHTML = reviews.length ? reviews.map((entry) => `<button class="brain-history-item" data-review-id="${entry.id}"><span>${esc(entry.review_payload?.verdict || "Review")}</span><strong>${esc(entry.trade_debriefs ? tradeLabel(entry.trade_debriefs) : "Trade review")}</strong><small>${new Date(entry.created_at).toLocaleString()}</small></button>`).join("") : "No AI reviews yet. Select a trade, provide the screenshots, then let the system audit it.";
}

async function loadReviewerData() {
  if (!supabase) return;
  const { data: sessionData } = await supabase.auth.getSession(); if (!sessionData.session) return;
  const [tradeResult, reviewResult] = await Promise.all([supabase.from("trade_debriefs").select("*").order("traded_at", { ascending: false }), supabase.from("trade_reviews").select("*, trade_debriefs(*)").order("created_at", { ascending: false }).limit(24)]);
  trades = tradeResult.data || []; reviews = reviewResult.data || [];
  const control = $("#brain-review-trade");
  if (control) control.innerHTML = '<option value="">Choose a journal trade number</option>' + trades.map((trade) => `<option value="${trade.id}">${esc(tradeLabel(trade))}</option>`).join("");
  renderHistory();
}

async function asDataUrl(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = reject; reader.onload = () => resolve(reader.result); reader.readAsDataURL(file); }); }
async function runReview(event) {
  event.preventDefault(); if (!supabase) return alert("Cloud connection is not configured.");
  const { data: sessionData } = await supabase.auth.getSession(); if (!sessionData.session) return alert("Sign in before requesting a trade review.");
  const trade = trades.find((item) => item.id === $("#brain-review-trade").value); const files = Array.from($("#brain-review-images").files || []);
  if (!trade || !files.length) return; if (files.length > 8) return alert("Use up to 8 screenshots for one audit.");
  const status = $("#brain-review-status"); const submit = $("#brain-review-submit"); submit.disabled = true; status.textContent = "Reading chart evidence against the Clarified Chaos FX system...";
  try {
    const screenshots = await Promise.all(files.map(asDataUrl));
    const response = await fetch("/api/trade-review", { method: "POST", headers: { "content-type":"application/json", authorization:`Bearer ${sessionData.session.access_token}` }, body: JSON.stringify({ trade, traderThesis: $("#brain-review-thesis").value.trim(), screenshots }) });
    const body = await response.json(); if (!response.ok) throw new Error(body.error || "The reviewer did not return an audit.");
    const insert = await supabase.from("trade_reviews").insert({ user_id: sessionData.session.user.id, trade_id: trade.id, trader_thesis: $("#brain-review-thesis").value.trim() || null, review_payload: body.review, screenshot_count: screenshots.length, course_version: "1.1" });
    if (insert.error) throw new Error(`The audit was completed but could not be saved: ${insert.error.message}`);
    status.textContent = "Audit complete. Stored in independent review history."; $("#brain-review-form").reset(); await loadReviewerData(); $("#brain-review-dialog").close(); $("#brain-review-history-list")?.scrollIntoView({ behavior:"smooth", block:"center" });
  } catch (error) { status.textContent = error.message || "The audit could not be completed."; } finally { submit.disabled = false; }
}

const sourceRefs = { condition: "1.4 Direction and Condition", location: "1.6 Location and the Three 50%s", trigger: "1.7 Arrival / Counter-Sequence", execution: "1.12 Entry Variants", risk: "3.3 Risk Principles" };
const BRIEFING = [
  { key:"condition", number:"01", title:"Condition", sub:"Read the operating environment first.", body:"The setup only has meaning inside a named condition: range, trending range, or trend. If the condition is not clear, there is no system decision yet.", cues:["Name it before looking for an entry","Unclear is a valid no-trade answer","Condition tells you what setups are permitted"] },
  { key:"location", number:"02", title:"Location", sub:"Edge begins where price sits inside the condition.", body:"A valid condition does not make every price acceptable. Identify the relevant 50% and wait for location rather than forcing a trade from the middle.", cues:["Middle is usually information-poor","Use the three 50%s","Location must support the direction"] },
  { key:"trigger", number:"03", title:"Arrival + confirmation", sub:"Let price show its hand before you commit.", body:"Meaningful arrival, candle timing, and structural shift turn a prediction into evidence. No shift means there is nothing to execute yet.", cues:["Arrival needs significance","A clean shift beats anticipation","T2 is confirmation, not decoration"] },
  { key:"execution", number:"04", title:"Execution", sub:"Take only what the system actually offers.", body:"An offered entry variant, structural stop, and derived target create the execution. A missed move is never permission to chase or improvise.", cues:["Choose the offered entry variant","The stop belongs to structure","Missed is not a setup"] },
  { key:"risk", number:"05", title:"Risk governance", sub:"Protect optionality before seeking outcome.", body:"Risk is part of the setup, not an afterthought. Size, stop, target, frequency, and psychology must be coherent before exposure is taken.", cues:["Risk must be permitted before entry","No-trade is a strategic decision","Quality matters more than frequency"] }
];
function sourceId(title) { const found = Object.entries(sourceRefs).find(([, reference]) => title.includes(reference)); return found ? `brain-source-${found[0]}` : ""; }
function inline(text) { return esc(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`(.+?)`/g, "<code>$1</code>"); }
function renderSourceBody(lines) {
  let html = ""; let list = []; const flush = () => { if (list.length) { html += `<ul>${list.map((item) => `<li>${inline(item)}</li>`).join("")}</ul>`; list = []; } };
  for (const raw of lines) {
    const line = raw.trim(); const image = line.match(/^!\[([^\]]*)\]\((assets\/[^)]+)\)/);
    if (image) { flush(); html += `<button class="brain-source-image" type="button" data-brain-image="brain/${esc(image[2])}" data-brain-caption="${esc(image[1])}"><img src="brain/${esc(image[2])}" alt="${esc(image[1])}" loading="lazy"><span>Click to enlarge</span></button>`; continue; }
    if (!line) { flush(); continue; }
    if (/^###\s/.test(line)) { flush(); html += `<h4>${inline(line.replace(/^###\s*/, ""))}</h4>`; continue; }
    if (/^####\s/.test(line)) { flush(); html += `<h5>${inline(line.replace(/^####\s*/, ""))}</h5>`; continue; }
    if (/^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line)) { list.push(line.replace(/^[-*]\s+|^\d+\.\s+/, "")); continue; }
    if (/^>\s?/.test(line)) { flush(); html += `<blockquote>${inline(line.replace(/^>\s?/, ""))}</blockquote>`; continue; }
    flush(); html += `<p>${inline(line)}</p>`;
  }
  flush(); return html;
}
function formatCourse(markdown) {
  const blocks = markdown.replace(/^---[\s\S]*?---\s*/, "").split(/^##\s+/m).filter(Boolean);
  return blocks.map((block, index) => { const lines = block.split(/\r?\n/); const title = lines.shift().trim(); const id = sourceId(title); return `<details class="brain-source-section" ${index === 0 ? "open" : ""} ${id ? `id="${id}"` : ""}><summary><span>${esc(title)}</span><b>Open notes</b></summary><div class="brain-source-notes">${renderSourceBody(lines)}</div></details>`; }).join("");
}
function ensureImageDialog() {
  if ($("#brain-image-dialog")) return;
  document.body.insertAdjacentHTML("beforeend", '<dialog id="brain-image-dialog" class="dialog-card brain-image-dialog"><button class="dialog-close" type="button" aria-label="Close">×</button><img id="brain-image-large" alt="Course reference" /><p id="brain-image-caption"></p></dialog>');
}
function ensureBriefingCss() {
  if (document.querySelector('link[href="brain-briefing.css"]')) return;
  document.head.insertAdjacentHTML("beforeend", '<link rel="stylesheet" href="brain-briefing.css">');
}
function renderBriefing() {
  const root = $("#brain-briefing"); if (!root) return;
  const slide = BRIEFING[briefingSlide];
  root.innerHTML = `<div class="brain-briefing-screen"><div class="brain-briefing-index">${BRIEFING.map((item, index) => `<button type="button" class="${index === briefingSlide ? "active" : ""}" data-briefing-slide="${index}">${item.number}</button>`).join("")}</div><div class="brain-briefing-copy"><p class="eyebrow">SYSTEM BRIEFING / ${slide.number} OF ${String(BRIEFING.length).padStart(2, "0")}</p><h3>${slide.title}</h3><h4>${slide.sub}</h4><p>${slide.body}</p><ul>${slide.cues.map((cue) => `<li>${cue}</li>`).join("")}</ul><button type="button" data-brain-jump="${slide.key}" class="brain-briefing-source">Open full source notes</button></div><div class="brain-briefing-visual"><div class="briefing-orbit"><span>${slide.number}</span></div><p>CCFX<br><b>${slide.title.toUpperCase()}</b></p><div class="briefing-bars"><i></i><i></i><i></i><i></i></div></div></div><div class="brain-briefing-controls"><button type="button" data-briefing-direction="-1">Previous</button><span>${slide.number} / ${String(BRIEFING.length).padStart(2, "0")}</span><button type="button" data-briefing-direction="1">Next</button></div>`;
}
function upgradeBrainDom() {
  const oldGrid = $(".brain-flow-grid");
  if (oldGrid && !$("#brain-chain")) oldGrid.outerHTML = '<div id="brain-chain" class="brain-chain"></div>';
  const chainHead = $(".brain-flow .panel-head");
  if (chainHead && !$("#brain-chain-reset")) chainHead.insertAdjacentHTML("beforeend", '<button id="brain-chain-reset" class="text-link" type="button">Restart chain</button>');
  const source = $("#brain-library-content");
  if (source) {
    $(".brain-summary")?.remove();
    source.insertAdjacentHTML("beforebegin", '<section class="brain-summary" id="brain-briefing"></section>');
  }
  const legacyGallery = $("#brain-visual-library");
  if (legacyGallery) legacyGallery.remove();
}
function openSource(key) { const target = $("#brain-source-" + key); if (target) { target.open = true; target.scrollIntoView({ behavior:"smooth", block:"start" }); } }
async function loadCourseLibrary() {
  try { const master = await fetch("brain/Clarified_Chaos_FX_AEGIS_Master_Brain.md").then((response) => response.text()); $("#brain-library-content").innerHTML = formatCourse(master); }
  catch { $("#brain-library-content").innerHTML = "The source library could not be loaded. Confirm the brain folder was uploaded with the deployment."; }
}
function init() {
  ensureBriefingCss();
  upgradeBrainDom();
  $("#open-trade-review")?.addEventListener("click", () => $("#brain-review-dialog").showModal());
  $("#brain-review-dialog .dialog-close")?.addEventListener("click", () => $("#brain-review-dialog").close());
  $("#brain-review-form")?.addEventListener("submit", runReview);
  $("#brain-chain-reset")?.addEventListener("click", () => { chainStep = 0; chainAnswers = []; chainTerminal = ""; renderChain(); });
  document.addEventListener("click", (event) => {
    const jump = event.target.closest("[data-brain-jump]"); if (jump) openSource(jump.dataset.brainJump);
    const choice = event.target.closest("[data-chain-choice]"); if (choice) { const selected = CHAIN[chainStep].choices[Number(choice.dataset.chainChoice)]; chainAnswers.push(selected.label); if (selected.stop) { chainTerminal = selected.stop; chainStep = CHAIN.length; renderChain(); return; } chainStep += 1; renderChain(); }
    if (event.target.closest("[data-chain-back]")) { chainAnswers.pop(); chainStep = Math.max(0, chainAnswers.length); chainTerminal = ""; renderChain(); }
    const slide = event.target.closest("[data-briefing-slide]"); if (slide) { briefingSlide = Number(slide.dataset.briefingSlide); renderBriefing(); }
    const direction = event.target.closest("[data-briefing-direction]"); if (direction) { briefingSlide = (briefingSlide + Number(direction.dataset.briefingDirection) + BRIEFING.length) % BRIEFING.length; renderBriefing(); }
    const history = event.target.closest("[data-review-id]"); if (history) { const review = reviews.find((entry) => entry.id === history.dataset.reviewId); if (review) $("#brain-review-history-list").innerHTML = renderReview(review.review_payload); }
    const image = event.target.closest("[data-brain-image]"); if (image) { ensureImageDialog(); $("#brain-image-large").src = image.dataset.brainImage; $("#brain-image-caption").textContent = image.dataset.brainCaption || "Course reference"; $("#brain-image-dialog").showModal(); }
    if (event.target.closest("#brain-image-dialog .dialog-close")) $("#brain-image-dialog").close();
  });
  ensureImageDialog(); renderChain(); renderBriefing(); loadCourseLibrary(); loadReviewerData(); supabase?.auth.onAuthStateChange(() => setTimeout(loadReviewerData, 50));
}
init();
