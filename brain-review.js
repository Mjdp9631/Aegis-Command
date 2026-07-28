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
  ["brain-briefing.css", "brain-visuals.css"].forEach((file) => {
    if (!document.querySelector(`link[href="${file}"]`)) document.head.insertAdjacentHTML("beforeend", `<link rel="stylesheet" href="${file}">`);
  });
}
function briefingDiagram(key) {
  const frame = (body, caption) => `<svg viewBox="0 0 640 370" role="img" aria-label="${caption}"><defs><linearGradient id="blueFill" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#3aaaff" stop-opacity=".34"/><stop offset="1" stop-color="#3aaaff" stop-opacity=".01"/></linearGradient><filter id="glow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><rect x="1" y="1" width="638" height="368" rx="10" class="diagram-frame"/><g class="diagram-grid">${Array.from({ length: 8 }, (_, i) => `<path d="M${54 + i * 76} 36V330"/>`).join("")}${Array.from({ length: 5 }, (_, i) => `<path d="M38 ${58 + i * 62}H602"/>`).join("")}</g>${body}</svg>`;
  if (key === "condition") return frame(`<text x="38" y="31" class="diagram-label">ENVIRONMENT MAP / READ BEFORE ENTRY</text><rect x="52" y="65" width="180" height="235" rx="7" class="diagram-zone range"/><rect x="232" y="65" width="180" height="235" rx="7" class="diagram-zone transition"/><rect x="412" y="65" width="180" height="235" rx="7" class="diagram-zone trend"/><text x="104" y="99" class="diagram-title">RANGE</text><text x="263" y="99" class="diagram-title">TRANSITION</text><text x="470" y="99" class="diagram-title">TREND</text><path class="diagram-line blue" d="M64 210 L92 184 L120 226 L152 170 L182 205 L210 158 L240 190 L270 151 L300 177 L335 130 L370 156 L404 118 L435 130 L470 103 L510 120 L550 73 L579 93"/><circle class="diagram-pulse" cx="550" cy="73" r="8"/><text x="52" y="340" class="diagram-note">NAME THE CONDITION → PERMITTED SETUPS → EXECUTION</text>`, "Market condition map");
  if (key === "location") return frame(`<text x="38" y="31" class="diagram-label">LOCATION ENGINE / THE THREE 50%S</text><rect x="82" y="76" width="476" height="230" rx="8" class="diagram-window"/><rect x="82" y="76" width="238" height="230" class="diagram-half valid"/><rect x="320" y="76" width="119" height="230" class="diagram-half middle"/><path class="diagram-midline" d="M82 191H558"/><path class="diagram-line amber" d="M95 252 L150 235 L205 264 L259 201 L315 179 L367 153 L422 172 L492 104 L545 120"/><g class="diagram-callout"><circle cx="150" cy="235" r="10"/><text x="117" y="329">OUTER HALF</text></g><g class="diagram-callout blue"><circle cx="367" cy="153" r="10"/><text x="333" y="329">50% AREA</text></g><text x="95" y="107" class="diagram-title">LOWER DISCOUNT</text><text x="445" y="107" class="diagram-title">UPPER PREMIUM</text><text x="82" y="350" class="diagram-note">MIDDLE = INFORMATION. LOCATION = EDGE.</text>`, "Location and three fifties map");
  if (key === "trigger") return frame(`<text x="38" y="31" class="diagram-label">CONFIRMATION SEQUENCE / DO NOT ANTICIPATE</text><path class="diagram-flow" d="M122 188H232 M292 188H402 M462 188H535"/><g class="diagram-node"><circle cx="92" cy="188" r="47"/><text x="66" y="184">01</text><text x="54" y="210">ARRIVAL</text></g><g class="diagram-node amber"><circle cx="262" cy="188" r="47"/><text x="236" y="184">02</text><text x="215" y="210">REACTION</text></g><g class="diagram-node blue"><circle cx="432" cy="188" r="47"/><text x="406" y="184">03</text><text x="390" y="210">CONFIRM</text></g><path class="diagram-signal" d="M60 294 L95 270 L126 286 L158 236 L188 258 L222 211 L248 231"/><text x="54" y="340" class="diagram-note">ARRIVAL → MEANINGFUL RESPONSE → STRUCTURAL PROOF</text>`, "Arrival confirmation flow");
  if (key === "execution") return frame(`<text x="38" y="31" class="diagram-label">EXECUTION GEOMETRY / TAKE THE OFFERED ENTRY</text><path class="diagram-axis" d="M75 303H565 M75 65V303"/><path class="diagram-line blue" d="M90 247 L144 220 L188 239 L238 165 L285 190 L340 128 L392 147 L445 89 L530 111"/><path class="diagram-entry" d="M341 128V270"/><path class="diagram-stop" d="M341 128V234"/><path class="diagram-target" d="M341 128V84"/><circle class="diagram-pulse" cx="341" cy="128" r="9"/><text x="354" y="122" class="diagram-title">ENTRY</text><text x="354" y="88" class="diagram-target-text">DERIVED TARGET</text><text x="354" y="247" class="diagram-stop-text">STRUCTURAL STOP</text><rect x="450" y="205" width="102" height="63" rx="7" class="diagram-readout"/><text x="465" y="230" class="diagram-label">RISK: DEFINED</text><text x="465" y="251" class="diagram-title">NO CHASE</text>`, "Execution geometry chart");
  return frame(`<text x="38" y="31" class="diagram-label">RISK GOVERNANCE / PRESERVE OPTIONALITY</text><g transform="translate(238 185)"><circle r="104" class="diagram-ring"/><circle r="72" class="diagram-ring"/><circle r="40" class="diagram-ring"/><path class="diagram-radar" d="M0 -82 L70 -25 L48 62 L-45 55 L-72 -20Z"/><path class="diagram-spoke" d="M0 -105V105M-102 0H102M-72 -72L72 72M72 -72L-72 72"/></g><g class="diagram-risk-label"><text x="232" y="177">RISK</text><text x="218" y="202">DEFINED</text></g><text x="440" y="116" class="diagram-title">SIZE</text><text x="440" y="145" class="diagram-value">PERMITTED</text><text x="440" y="209" class="diagram-title">STOP</text><text x="440" y="238" class="diagram-value">STRUCTURAL</text><text x="440" y="302" class="diagram-title">TARGET</text><text x="440" y="331" class="diagram-value">DERIVED</text><text x="50" y="340" class="diagram-note">IF ONE VARIABLE IS UNCLEAR, CAPITAL STAYS PROTECTED.</text>`, "Risk governance radar");
}
function renderBriefing() {
  const root = $("#brain-briefing"); if (!root) return;
  const slide = BRIEFING[briefingSlide];
  root.innerHTML = `<div class="brain-briefing-screen"><div class="brain-briefing-index">${BRIEFING.map((item, index) => `<button type="button" class="${index === briefingSlide ? "active" : ""}" data-briefing-slide="${index}">${item.number}</button>`).join("")}</div><div class="brain-briefing-copy"><p class="eyebrow">SYSTEM BRIEFING / ${slide.number} OF ${String(BRIEFING.length).padStart(2, "0")}</p><h3>${slide.title}</h3><h4>${slide.sub}</h4><p>${slide.body}</p><ul>${slide.cues.map((cue) => `<li>${cue}</li>`).join("")}</ul><button type="button" data-brain-jump="${slide.key}" class="brain-briefing-source">Open full source notes</button></div><div class="brain-briefing-visual"><div class="briefing-diagram">${briefingDiagram(slide.key)}</div><p>CCFX / <b>${slide.title.toUpperCase()}</b></p><div class="briefing-bars"><i></i><i></i><i></i><i></i><i></i></div></div></div><div class="brain-briefing-controls"><button type="button" data-briefing-direction="-1">Previous</button><span>${slide.number} / ${String(BRIEFING.length).padStart(2, "0")}</span><button type="button" data-briefing-direction="1">Next</button></div>`;
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
