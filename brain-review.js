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

const isTheoretical = (trade) => String(trade?.account || "").trim().toLowerCase() === "theoretical";

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
  syncTheoreticalReason();
  renderHistory();
}

function ensureTheoreticalReasonField() {
  if ($("#brain-no-entry-wrap")) return;
  const tradeControl = $("#brain-review-trade");
  if (!tradeControl) return;
  tradeControl.closest("label")?.insertAdjacentHTML("afterend", '<label id="brain-no-entry-wrap" hidden>Why was this theoretical trade not entered?<textarea id="brain-no-entry-reason" rows="3" placeholder="e.g. It did not reach my Entry-50, or the price action was not clean enough."></textarea><small>Saved with this review only. It gives context but never changes the independent audit.</small></label>');
}

function syncTheoreticalReason() {
  ensureTheoreticalReasonField();
  const selected = trades.find((item) => item.id === $("#brain-review-trade")?.value);
  const wrap = $("#brain-no-entry-wrap"); const reason = $("#brain-no-entry-reason");
  if (!wrap || !reason) return;
  wrap.hidden = !isTheoretical(selected);
  if (wrap.hidden) reason.value = "";
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
    const noEntryReason = isTheoretical(trade) ? $("#brain-no-entry-reason").value.trim() : "";
    const response = await fetch("/api/trade-review", { method: "POST", headers: { "content-type":"application/json", authorization:`Bearer ${sessionData.session.access_token}` }, body: JSON.stringify({ trade, noEntryReason, traderThesis: $("#brain-review-thesis").value.trim(), screenshots }) });
    const body = await response.json(); if (!response.ok) throw new Error(body.error || "The reviewer did not return an audit.");
    const insert = await supabase.from("trade_reviews").insert({ user_id: sessionData.session.user.id, trade_id: trade.id, trader_thesis: $("#brain-review-thesis").value.trim() || null, no_entry_reason: noEntryReason || null, review_payload: body.review, screenshot_count: screenshots.length, course_version: "1.1" });
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
  ["brain-briefing.css", "brain-visuals.css", "brain-visual-accent.css"].forEach((file) => {
    if (!document.querySelector(`link[href="${file}"]`)) document.head.insertAdjacentHTML("beforeend", `<link rel="stylesheet" href="${file}">`);
  });
}
function briefingDiagram(key) {
  const frame = (body, caption) => `<svg viewBox="0 0 640 370" role="img" aria-label="${caption}"><defs><linearGradient id="blueFill" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#3aaaff" stop-opacity=".34"/><stop offset="1" stop-color="#3aaaff" stop-opacity=".01"/></linearGradient><filter id="glow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><rect x="1" y="1" width="638" height="368" rx="10" class="diagram-frame"/><g class="diagram-grid">${Array.from({ length: 8 }, (_, i) => `<path d="M${54 + i * 76} 36V330"/>`).join("")}${Array.from({ length: 5 }, (_, i) => `<path d="M38 ${58 + i * 62}H602"/>`).join("")}</g>${body}</svg>`;
  if (key === "condition") return frame(`<text x="38" y="31" class="diagram-label">CONDITION MAP / DIRECTION IS SEPARATE</text><g class="condition-card"><rect x="38" y="55" width="132" height="112" rx="8"/><text x="49" y="76" class="diagram-title">RANGE</text><path class="diagram-line amber" d="M50 130L70 105L91 139L113 90L137 132L158 100"/><path class="condition-bound" d="M48 91H160M48 144H160"/><text x="48" y="158" class="diagram-small">EXTREME → BALANCE</text></g><g class="condition-card"><rect x="186" y="55" width="132" height="112" rx="8"/><text x="197" y="76" class="diagram-title">BULL TR</text><path class="diagram-line blue" d="M198 137L220 116L239 125L260 91L281 103L306 75"/><text x="197" y="158" class="diagram-small">50–75% / PRO-DIR</text></g><g class="condition-card"><rect x="334" y="55" width="132" height="112" rx="8"/><text x="345" y="76" class="diagram-title">BEAR TR</text><path class="diagram-line amber" d="M346 81L367 103L387 95L409 132L430 121L455 150"/><text x="345" y="158" class="diagram-small">50–75% / PRO-DIR</text></g><g class="condition-card"><rect x="482" y="55" width="120" height="112" rx="8"/><text x="494" y="76" class="diagram-title">TREND</text><path class="diagram-line blue" d="M494 137L514 116L531 123L548 95L565 104L588 72"/><text x="494" y="158" class="diagram-small">&lt;50% / 25% CONT.</text></g><path class="diagram-divider" d="M38 184H602"/><text x="38" y="204" class="diagram-label">BEARISH CBR / SWEEP → LOW BREAK → REVERSAL</text><path class="diagram-line amber" d="M68 310L121 277L171 291L226 246L280 270L330 231"/><path class="diagram-sweep" d="M330 231L350 214L370 235"/><text x="430" y="220" class="diagram-small">HIGH SWEPT</text><path class="diagram-level" d="M68 291H282"/><text x="76" y="282" class="diagram-small">RELEVANT PRIOR LOW</text><path class="diagram-line red" d="M370 235L414 262L458 284L506 307L555 326"/><path class="diagram-shift" d="M506 307V332"/><text x="390" y="346" class="diagram-stop-text">LOW BROKEN → BEARISH STRUCTURE</text><text x="38" y="366" class="diagram-note">CONFIRMED BEARISH REVERSAL: HIGH SWEPT, RELEVANT LOW BROKEN, THEN DIRECTION CONTINUES DOWN.</text>`, "Range, bullish and bearish trending range, trend, and bearish CBR condition map");
  if (key === "location") return frame(`<text x="38" y="31" class="diagram-label">ENTRY-50 / MEASURE THE STRUCTURE-BREAKING IMPULSE</text><path class="diagram-axis" d="M67 309H586 M67 65V309"/><path class="diagram-line blue" d="M84 277L141 252L192 270L246 229L304 104L364 142L419 185L471 162L535 204"/><circle class="diagram-anchor" cx="246" cy="229" r="7"/><circle class="diagram-anchor" cx="304" cy="104" r="7"/><text x="174" y="252" class="diagram-title">IMPULSE LOW</text><text x="312" y="94" class="diagram-title">IMPULSE HIGH</text><path class="diagram-fib" d="M246 166H304"/><path class="diagram-fib-guide" d="M275 104V229"/><rect x="244" y="158" width="62" height="16" rx="4" class="diagram-entry-zone"/><text x="315" y="172" class="diagram-target-text">ENTRY-50 / 50%</text><path class="diagram-line amber" d="M304 104L285 139L275 166L291 151"/><circle class="diagram-pulse" cx="275" cy="166" r="7"/><text x="348" y="196" class="diagram-small">RETRACEMENT INTO ENTRY-50</text><g class="diagram-bracket"><path d="M84 294V303H246V294"/><text x="91" y="331">AOI-50 = BROADER MOVE / LOCATION</text></g><g class="diagram-bracket amber"><path d="M304 213V224H535V213"/><text x="375" y="248">TARGET-50 = EXPECTED DESTINATION</text></g><text x="67" y="351" class="diagram-note">LOW → HIGH → 50% OF THAT IMPULSE = ENTRY REFERENCE. DO NOT MERGE WITH AOI OR TARGET.</text>`, "Entry fifty drawn from impulse low and impulse high");
  if (key === "trigger") return frame(`<text x="38" y="31" class="diagram-label">STRUCTURAL SHIFT / COURSE MODEL: HIGH TAKEN → RELEVANT LOW BROKEN</text><path class="diagram-line blue" d="M68 250L120 212L166 233L220 173L271 198L329 126L378 164"/><text x="69" y="273" class="diagram-small">BULLISH STRUCTURE: HIGHER HIGHS / HIGHER LOWS</text><path class="diagram-level" d="M69 233H271"/><text x="77" y="226" class="diagram-title">RELEVANT PRIOR LOW</text><path class="diagram-sweep" d="M329 126L350 104L371 130"/><text x="299" y="92" class="diagram-target-text">PRIOR HIGH TAKEN</text><path class="diagram-line amber" d="M378 164L408 185L442 161L475 210L512 244L561 277"/><path class="diagram-break" d="M512 244V294"/><text x="475" y="306" class="diagram-stop-text">DECISIVE BREAK BELOW PRIOR LOW</text><rect x="83" y="319" width="142" height="25" rx="4" class="diagram-check"><title>Initial Structure</title></rect><text x="101" y="336" class="diagram-small">1. STRUCTURE</text><rect x="250" y="319" width="142" height="25" rx="4" class="diagram-check"><title>Sweep</title></rect><text x="281" y="336" class="diagram-small">2. SWEEP</text><rect x="417" y="319" width="142" height="25" rx="4" class="diagram-check good"><title>Shift</title></rect><text x="440" y="336" class="diagram-small">3. SHIFT</text>`, "Bearish structural shift demonstrated from course rules");
  if (key === "execution") return frame(`<text x="38" y="31" class="diagram-label">ONE VALID LONG MODEL / THREE WAYS TO EXECUTE THE SAME STRUCTURE</text><path class="diagram-axis" d="M57 304H588 M57 60V304"/><path class="diagram-line blue" d="M73 249L128 222L180 240L234 189L287 116L338 154L387 205L447 174L521 92L576 114"/><path class="diagram-level" d="M73 240H287"/><text x="78" y="233" class="diagram-small">PRIOR HIGH / SHIFT LEVEL</text><path class="diagram-fib-guide" d="M287 116V205"/><path class="diagram-fib" d="M250 160H324"/><text x="226" y="151" class="diagram-target-text">ENTRY-50</text><circle class="diagram-pulse" cx="287" cy="160" r="7"/><path class="diagram-entry" d="M447 174V229"/><text x="457" y="193" class="diagram-target-text">REFINED BREAKOUT</text><path class="diagram-warning" d="M521 92l14 24h-28z"/><text x="492" y="77" class="diagram-stop-text">MARKET: ONLY IF RETRACE UNLIKELY</text><path class="diagram-stop" d="M287 160V276"/><text x="296" y="274" class="diagram-stop-text">STRUCTURAL STOP</text><path class="diagram-target" d="M287 160V82"/><text x="297" y="82" class="diagram-target-text">CONDITION-DERIVED TARGET</text><g class="diagram-exec-key"><rect x="375" y="238" width="187" height="49" rx="6"/><text x="387" y="258">1. ENTRY-50: LARGE SHIFT / BETTER GEOMETRY</text><text x="387" y="277">2. BREAKOUT: SMALL, CLEAN + EXPANDING</text></g><text x="57" y="345" class="diagram-note">MISSED ENTRY IS NOT PERMISSION TO CHASE. STOP → RISK → SIZE HAPPENS BEFORE EXPOSURE.</text>`, "Single valid structure showing entry fifty, refined breakout, and market entry conditions");
  return frame(`<text x="38" y="31" class="diagram-label">RISK GOVERNANCE / CORRECT ORDER OF OPERATIONS</text><path class="diagram-process" d="M84 177H208M270 177H394M456 177H561"/><g class="diagram-process-node"><circle cx="54" cy="177" r="31"/><text x="35" y="181">01</text><text x="18" y="229">INVALIDATION</text></g><g class="diagram-process-node amber"><circle cx="239" cy="177" r="31"/><text x="220" y="181">02</text><text x="204" y="229">STOP + ROOM</text></g><g class="diagram-process-node blue"><circle cx="425" cy="177" r="31"/><text x="406" y="181">03</text><text x="389" y="229">RISK LIMIT</text></g><g class="diagram-process-node good"><circle cx="592" cy="177" r="31"/><text x="573" y="181">04</text><text x="554" y="229">POSITION SIZE</text></g><path class="diagram-divider" d="M40 273H600"/><g class="risk-gate"><rect x="60" y="289" width="146" height="32" rx="5"/><text x="73" y="310">STRUCTURE DEFINED?</text></g><g class="risk-gate"><rect x="246" y="289" width="146" height="32" rx="5"/><text x="258" y="310">RISK PERMITTED?</text></g><g class="risk-gate"><rect x="432" y="289" width="146" height="32" rx="5"/><text x="445" y="310">TARGET DERIVED?</text></g><text x="38" y="350" class="diagram-note">ANY UNKNOWN VARIABLE = NO EXPOSURE. CAPITAL PRESERVES OPTIONALITY.</text>`, "Risk governance sequence from invalidation to position size");
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
  $("#brain-review-trade")?.addEventListener("change", syncTheoreticalReason);
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
