import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.AEGIS_CONFIG || {};
const supabase = config.supabaseUrl && config.supabaseAnonKey ? createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const $ = (selector) => document.querySelector(selector);
let trades = [];
let reviews = [];
let corrections = [];
let chainStep = 0;
let chainAnswers = [];
let chainTerminal = "";
let briefingSlide = 0;
let lastDeletedReview = null;
let deleteUndoTimer = null;
let phaseZeroAnswers = [];
let phaseZeroTerminal = "";
const EVIDENCE_BUCKET = "trade-review-evidence";

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

function phaseZeroState() {
  return Object.fromEntries(phaseZeroAnswers.map((answer) => [answer.id, answer.value]));
}

function phaseZeroYesNo(id, title, question, pass, fail) {
  return { id, title, question, choices: [{ label: pass, value: true }, { label: fail, value: false, stop: `No trade. ${fail}.` }] };
}

function typeThreeStep(prefix, title, context) {
  const state = phaseZeroState();
  const directionId = `${prefix}Direction`;
  const takeId = `${prefix}TakeExtreme`;
  const breakId = `${prefix}BreakOpposing`;
  const pullbackId = `${prefix}Pullback50`;
  if (!state[directionId]) return {
    id: directionId, title, question: `What is the expected direction for this ${context}?`,
    choices: [{ label: "Bullish", value: "bullish" }, { label: "Bearish", value: "bearish" }]
  };
  const bullish = state[directionId] === "bullish";
  if (state[takeId] === undefined) return phaseZeroYesNo(takeId, `${title} - first break`, `Did price first take the prior ${bullish ? "high" : "low"}?`, `Yes - prior ${bullish ? "high" : "low"} taken`, `No prior ${bullish ? "high" : "low"} take`);
  if (state[breakId] === undefined) return phaseZeroYesNo(breakId, `${title} - opposing break`, `Did it immediately break the previous ${bullish ? "low" : "high"}?`, `Yes - previous ${bullish ? "low" : "high"} broken`, `No immediate break of the previous ${bullish ? "low" : "high"}`);
  if (state[pullbackId] === undefined) return phaseZeroYesNo(pullbackId, `${title} - 50% pullback`, "Did price pull back to 50% of that structure-breaking impulse?", "Yes - 50% pullback reached", "No 50% pullback");
  return null;
}

function phaseZeroStep() {
  const state = phaseZeroState();
  if (!state.condition) return {
    id: "condition", title: "01 — Condition", question: "What market condition is active?",
    choices: [
      { label: "Ranging", value: "ranging" },
      { label: "Trending range", value: "trending-range" },
      { label: "Trending", value: "trending" },
      { label: "Unclear", value: "unclear", stop: "No trade. Condition is not clear enough to define a model." },
    ]
  };
  if (state.condition === "ranging") {
    if (state.rangeEdge === undefined) return phaseZeroYesNo("rangeEdge", "02 — Range location", "Is price at an edge of the established range?", "Yes — range extreme", "No — middle of range");
    const typeThree = typeThreeStep("range", "03 — Type 3 confirmation", "range reversal"); if (typeThree) return typeThree;
    if (state.rangeRoom === undefined) return phaseZeroYesNo("rangeRoom", "04 — Target and room", "Is there enough room to target the middle of the range with reasonable R:R?", "Yes — midpoint target is viable", "No reasonable room to midpoint");
  }
  if (state.condition === "trending") {
    if (state.trendPullback === undefined) return phaseZeroYesNo("trendPullback", "02 — Pullback depth", "Is this a continuation after a pullback deeper than 50% of the prior extension?", "Yes — 50%+ pullback", "No — too extended / shallow");
    const typeThree = typeThreeStep("trend", "03 — Type 3 confirmation", "trend continuation"); if (typeThree) return typeThree;
    if (state.trendRoom === undefined) return phaseZeroYesNo("trendRoom", "04 — Target and room", "Is there enough room for a reasonable R:R target before opposing structure?", "Yes — room is available", "No reasonable R:R room");
  }
  if (state.condition === "trending-range") {
    if (!state.model) return {
      id: "model", title: "02 — Model", question: "Which setup is price offering inside the trending range?",
      choices: [
        { label: "Reversal at a range extreme", value: "reversal" },
        { label: "Continuation in the pullback zone", value: "continuation" },
        { label: "Neither model is present", value: "none", stop: "No trade. The trending range is not offering one of the two defined models." },
      ]
    };
    if (state.model === "reversal") {
      if (state.reversalExtension === undefined) return phaseZeroYesNo("reversalExtension", "03 — Reversal location", "Did price extend above the previous high (bullish) or below the previous low (bearish)?", "Yes — prior structure was exceeded", "No meaningful extension beyond prior structure");
      const typeThree = typeThreeStep("reversal", "04 — Type 3 confirmation", "trending-range reversal"); if (typeThree) return typeThree;
      if (state.reversalRoom === undefined) return phaseZeroYesNo("reversalRoom", "05 — Target and room", "Can the target sit at 50% of the extension that exceeded prior structure with reasonable R:R?", "Yes — extension 50% target is viable", "No reasonable room to the 50% target");
    }
    if (state.model === "continuation") {
      if (state.continuationZone === undefined) return phaseZeroYesNo("continuationZone", "03 — Continuation location", "Is price between the 50% and 75% pullback of the prior extension?", "Yes — 50–75% pullback zone", "No — outside the defined pullback zone");
      const typeThree = typeThreeStep("continuation", "04 — Type 3 confirmation", "trending-range continuation"); if (typeThree) return typeThree;
      if (state.continuationRoom === undefined) return phaseZeroYesNo("continuationRoom", "05 — Target and room", "Is there enough room for a reasonable R:R target before opposing structure?", "Yes — room is available", "No reasonable R:R room");
    }
  }
  return null;
}

function renderPhaseZeroChecklist() {
  const root = $("#phase-zero-checklist");
  if (!root) return;
  const history = phaseZeroAnswers.map((answer) => `<div class="brain-chain-answer"><span>${esc(answer.title)}</span><strong>${esc(answer.label)}</strong></div>`).join("");
  const back = phaseZeroAnswers.length ? '<button type="button" class="brain-chain-back" data-phase0-back>Back one step</button>' : "";
  const step = phaseZeroStep();
  if (phaseZeroTerminal) {
    root.innerHTML = `${history}<article class="brain-chain-result stop"><p class="eyebrow">PHASE 0 RESULT</p><h4>${esc(phaseZeroTerminal)}</h4><p>Do not force an entry. Wait for the defined condition, Type 3 shift, and viable target to align.</p>${back}</article>`;
    return;
  }
  if (!step) {
    root.innerHTML = `${history}<article class="brain-chain-result pass"><p class="eyebrow">PHASE 0 RESULT</p><h4>Defined model is eligible for execution review.</h4><p>Target is condition-derived. Re-check risk and position size before exposure; this checklist never authorizes a trade by itself.</p>${back}</article>`;
    return;
  }
  root.innerHTML = `${history}<article class="brain-chain-question"><p class="eyebrow">${esc(step.title)}</p><h4>${esc(step.question)}</h4><div class="brain-chain-options">${step.choices.map((choice, index) => `<button type="button" data-phase0-choice="${index}">${esc(choice.label)}</button>`).join("")}</div><div class="brain-chain-actions">${back}</div></article>`;
}

function renderPhaseZeroPlaybook() {
  const root = $("#phase-zero-playbook");
  if (!root) return;
  root.innerHTML = `<div class="phase-zero-playbook-head"><div><p class="eyebrow amber">PHASE 0 / TRADING EXECUTION PLAYBOOK</p><h3>Condition decides the model.</h3><p>Read-only canonical rules. The checklist below applies the same rules without improvisation.</p></div><button class="primary compact" type="button" data-phase0-start>Run pre-trade checklist</button></div><div class="phase-zero-models"><article><span>01 / RANGING</span><h4>Reversal at the edge</h4><p>Wait for price at a range extreme and a Type 3 lower-timeframe shift. Target the middle of the range.</p><small>Invalid if price is in the middle, there is no shift, or the midpoint does not offer reasonable R:R.</small></article><article><span>02 / TRENDING</span><h4>Continuation after a real pullback</h4><p>Use continuation only after a pullback deeper than 50% of the prior extension and a Type 3 lower-timeframe shift.</p><small>Invalid if price is too trendy with no pullback, no shift appears, or opposing structure leaves insufficient R:R.</small></article><article><span>03 / TRENDING RANGE</span><h4>Two allowed models</h4><p><b>Reversal:</b> extension beyond prior high/low, then Type 3 shift; target 50% of that extension. <b>Continuation:</b> Type 3 shift in the 50–75% pullback of the prior extension.</p><small>Use only the offered model. No extension, no shift, or no room means no trade.</small></article></div><div class="phase-zero-invalidations"><b>Hard no-trade gates</b><span>Too trendy with no pullback</span><span>No Type 3 shift</span><span>No reasonable R:R to the defined target</span></div>`;
  root.querySelector(".phase-zero-playbook-head")?.insertAdjacentHTML("afterend", '<div class="phase-zero-type-three"><b>Type 3 - required sequence</b><span><strong>Bullish:</strong> take a prior high, immediately break the previous low, then pull back to 50% of that impulse.</span><span><strong>Bearish:</strong> take a prior low, immediately break the previous high, then pull back to 50% of that impulse.</span></div>');
}

function renderReview(review, entry = null) {
  const verdictClass = String(review.verdict || "").toLowerCase().replaceAll(" ", "-");
  const audit = (review.rule_audit || []).map((item) => `<article class="review-rule"><strong>${esc(item.rule)}</strong><span class="review-status ${esc(String(item.status || "").toLowerCase().replaceAll(" ", "-"))}">${esc(item.status)}</span><p>${esc(item.evidence)}</p><small>${esc(item.source_reference)}</small></article>`).join("");
  const scenario = review.blind_scenario || review.independent_pre_trade_read;
  const scenarioMarkup = scenario?.scenario_action ? `<div class="brain-scenario-readout"><h4>BLIND AI SCENARIO</h4><p><b>${esc(scenario.scenario_action)}</b> · ${esc(scenario.scenario_bias || "No directional bias established.")}</p><p>${esc(scenario.scenario_reason || "No scenario rationale returned.")}</p><small>Simulated PnL is tracked after review against the logged result; it never changes the blind call.</small></div>` : "";
  const evidenceButton = entry?.evidence_saved && Array.isArray(entry.evidence_paths) && entry.evidence_paths.length ? `<button type="button" class="secondary compact" data-open-review-evidence="${entry.id}">Open saved screenshots</button>` : "";
  const deleteButton = entry?.id ? `<button type="button" class="danger compact" data-delete-review="${entry.id}">Delete review</button>` : "";
  const reviewCorrections = entry?.id ? corrections.filter((item) => item.trade_review_id === entry.id) : [];
  const correctionMarkup = reviewCorrections.length ? `<div class="review-corrections"><h4>Director corrections</h4>${reviewCorrections.map((item) => `<article><b>${esc(item.correction_area)}</b><p>${esc(item.correction)}</p>${item.chart_evidence ? `<small>Chart evidence: ${esc(item.chart_evidence)}</small>` : ""}</article>`).join("")}</div>` : "";
  const correctionButton = entry?.id ? `<button type="button" class="secondary compact" data-correct-review="${entry.id}">Correct this review</button>` : "";
  return `<article class="brain-review-card"><div class="brain-review-card-head"><div><p class="eyebrow blue-text">SYSTEM AUDIT</p><h3>${esc(review.process_grade || "Process review")}</h3></div><span class="review-verdict ${verdictClass}">${esc(review.verdict || "Pending")}</span></div><p>${esc(review.executive_summary || "No summary returned.")}</p>${scenarioMarkup}<div class="review-columns"><div><h4>Observed evidence</h4><ul>${(review.observed_evidence || []).map((item) => `<li>${esc(item)}</li>`).join("") || "<li>No decisive evidence captured.</li>"}</ul></div><div><h4>Missing evidence</h4><ul>${(review.missing_evidence || []).map((item) => `<li>${esc(item)}</li>`).join("") || "<li>None identified.</li>"}</ul></div></div><div class="review-rules">${audit}</div><div class="thesis-compare"><h4>Thesis comparison</h4><p><b>Where it aligns:</b> ${(review.thesis_comparison?.matches || []).map(esc).join("; ") || "No alignment established."}</p><p><b>Correction:</b> ${esc(review.thesis_comparison?.correction || "No correction returned.")}</p></div><p class="review-focus"><b>Next review focus:</b> ${esc(review.next_review_focus || "Review the full evidence chain.")}</p>${correctionMarkup}<div class="brain-history-actions">${correctionButton}${evidenceButton}${deleteButton}</div></article>`;
}

function renderHistory() {
  const list = $("#brain-review-history-list"); const count = $("#brain-review-count");
  if (!list || !count) return;
  count.textContent = `${reviews.length} REVIEW${reviews.length === 1 ? "" : "S"}`;
  list.innerHTML = reviews.length ? reviews.map((entry) => `<button class="brain-history-item" data-review-id="${entry.id}"><span>${esc(entry.review_payload?.verdict || "Review")}</span><strong>${esc(entry.trade_debriefs ? tradeLabel(entry.trade_debriefs) : "Trade review")}</strong><small>${new Date(entry.created_at).toLocaleString()}</small></button>`).join("") : "No AI reviews yet. Select a trade and provide one post-trade chart image per timeframe.";
}

async function loadReviewerData() {
  if (!supabase) return;
  const { data: sessionData } = await supabase.auth.getSession(); if (!sessionData.session) return;
  const [tradeResult, reviewResult, scenarioResult, correctionResult] = await Promise.all([supabase.from("trade_debriefs").select("*").order("traded_at", { ascending: false }), supabase.from("trade_reviews").select("*, trade_debriefs(*)").order("created_at", { ascending: false }).limit(24), supabase.from("ai_trade_scenarios").select("*").order("created_at", { ascending: false }).limit(100), supabase.from("trade_review_corrections").select("*").order("created_at", { ascending: false }).limit(100)]);
  trades = tradeResult.data || []; reviews = reviewResult.data || []; corrections = correctionResult.error ? [] : (correctionResult.data || []);
  renderScenarioSummary(scenarioResult.error ? [] : (scenarioResult.data || []));
  const control = $("#brain-review-trade");
  if (control) control.innerHTML = '<option value="">Choose a journal trade number</option>' + trades.map((trade) => `<option value="${trade.id}">${esc(tradeLabel(trade))}</option>`).join("");
  syncTheoreticalReason();
  renderHistory();
}

function ensureScenarioSummary() {
  if ($("#brain-scenario-summary")) return;
  const history = $(".brain-review-history");
  if (!history) return;
  history.insertAdjacentHTML("afterend", '<section class="brain-scenario-summary panel" id="brain-scenario-summary"><div><p class="eyebrow blue-text">BLIND AI LEDGER</p><h3>Scenario performance</h3></div><div class="brain-scenario-metrics"><article><span>AI PNL</span><strong id="brain-ai-pnl">0R</strong></article><article><span>SCENARIOS</span><strong id="brain-ai-scenarios">0</strong></article><article><span>WIN / LOSS / BE</span><strong id="brain-ai-record">0 / 0 / 0</strong></article></div><small>The AI account records what its blind pre-entry call would have earned or lost after the complete post-trade review. Misses and wrong calls remain in the ledger.</small></section>');
}

function renderScenarioSummary(scenarios) {
  ensureScenarioSummary();
  const pnl = scenarios.reduce((sum, row) => sum + Number(row.simulated_r_multiple || 0), 0);
  const wins = scenarios.filter((row) => row.scenario_result === "correct_win").length;
  const losses = scenarios.filter((row) => row.scenario_result === "wrong_loss").length;
  const breakeven = scenarios.filter((row) => row.scenario_result === "break_even").length;
  if ($("#brain-ai-pnl")) $("#brain-ai-pnl").textContent = `${pnl >= 0 ? "+" : ""}${pnl.toFixed(2).replace(/\.00$/, "")}R`;
  if ($("#brain-ai-scenarios")) $("#brain-ai-scenarios").textContent = String(scenarios.length);
  if ($("#brain-ai-record")) $("#brain-ai-record").textContent = `${wins} / ${losses} / ${breakeven}`;
}

function ensureTheoreticalReasonField() {
  if ($("#brain-no-entry-wrap")) return;
  const tradeControl = $("#brain-review-trade");
  if (!tradeControl) return;
  tradeControl.closest("label")?.insertAdjacentHTML("afterend", '<label id="brain-no-entry-wrap" hidden>Why was this theoretical trade not entered?<textarea id="brain-no-entry-reason" rows="3" placeholder="e.g. It did not reach my Entry-50, or the price action was not clean enough."></textarea><small>Saved with this review only. It gives context but never changes the independent audit.</small></label>');
}

function ensureSaveEvidenceChoice() {
  if ($("#brain-review-save-evidence")) return;
  const evidence = $(".brain-evidence-grid");
  if (!evidence) return;
  evidence.insertAdjacentHTML("afterend", '<label class="brain-save-evidence"><input id="brain-review-save-evidence" type="checkbox" /> Save these screenshots privately with this review <small>Optional. When off, the screenshots are discarded after the audit; the written audit still saves.</small></label>');
}

function normalizeAutomaticEvidenceUi() {
  const evidence = $(".brain-evidence-grid");
  if (!evidence) return;
  evidence.innerHTML = '<legend>Post-trade chart snapshots — one per timeframe</legend><p>Capture one image per timeframe after the trade. The AI first reads only the pre-entry portion of these same images, then performs a complete post-trade review. No separate pre-chart or post-chart upload is required.</p><div class="brain-evidence-columns"><section><h3>Automatic two-pass analysis</h3><label>4H <input data-review-frame="chart_4h" type="file" accept="image/png,image/jpeg,image/webp" required /></label><label>1H <input data-review-frame="chart_1h" type="file" accept="image/png,image/jpeg,image/webp" required /></label><label>15m <input data-review-frame="chart_15m" type="file" accept="image/png,image/jpeg,image/webp" required /></label><label>5m <input data-review-frame="chart_5m" type="file" accept="image/png,image/jpeg,image/webp" required /></label><label>1m <input data-review-frame="chart_1m" type="file" accept="image/png,image/jpeg,image/webp" required /></label></section><section><h3>Bias protection</h3><p class="body-copy">The blind pass cannot use post-entry candles, outcome, management, or your explanation. It records what it would have done, even if that call would have lost. The full pass then reviews everything after entry.</p><p class="body-copy">If you dismiss optional post-entry commentary, the blind scenario is unchanged.</p></section></div><small>Images are used for this audit and are not retained unless an existing evidence-retention option is enabled.</small>';
}

function syncTheoreticalReason() {
  ensureTheoreticalReasonField();
  const selected = trades.find((item) => item.id === $("#brain-review-trade")?.value);
  const wrap = $("#brain-no-entry-wrap"); const reason = $("#brain-no-entry-reason");
  if (!wrap || !reason) return;
  wrap.hidden = !isTheoretical(selected);
  if (wrap.hidden) reason.value = "";
}

function syncViolationReason() {
  const wrap = $("#brain-review-violation-wrap"); const field = $("#brain-review-violation");
  if (!wrap || !field) return;
  wrap.hidden = $("#brain-review-followed")?.value !== "No";
  if (wrap.hidden) field.value = "";
}

async function compressImage(file) {
  const source = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const image = new Image();
      image.onerror = reject;
      image.onload = () => resolve(image);
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
  const scale = Math.min(1, 1280 / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.72);
}

function dataUrlToBlob(dataUrl) {
  const [header, payload] = String(dataUrl).split(",");
  const mime = header.match(/data:(.*?);base64/i)?.[1] || "image/jpeg";
  const bytes = Uint8Array.from(atob(payload), (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}

async function uploadEvidence(screenshots, userId, tradeId) {
  const basePath = `${userId}/${tradeId}/${crypto.randomUUID()}`;
  const stored = [];
  try {
    for (const [frame, dataUrl] of Object.entries(screenshots)) {
      const path = `${basePath}/${frame}.jpg`;
      const { error } = await supabase.storage.from(EVIDENCE_BUCKET).upload(path, dataUrlToBlob(dataUrl), { contentType: "image/jpeg", upsert: false });
      if (error) throw error;
      stored.push({ frame, path });
    }
    return stored;
  } catch (error) {
    if (stored.length) await supabase.storage.from(EVIDENCE_BUCKET).remove(stored.map((item) => item.path));
    throw new Error(`The audit completed, but private screenshot storage failed: ${error.message}`);
  }
}

function evidencePaths(entry) {
  return (entry?.evidence_paths || []).map((item) => typeof item === "string" ? item : item.path).filter(Boolean);
}

async function openSavedEvidence(entry) {
  const paths = evidencePaths(entry);
  if (!paths.length) return alert("No screenshots were saved with this review.");
  const { data, error } = await supabase.storage.from(EVIDENCE_BUCKET).createSignedUrls(paths, 3600);
  if (error) return alert(`Could not open saved screenshots: ${error.message}`);
  ensureEvidenceDialog();
  const labels = (entry.evidence_paths || []).map((item, index) => typeof item === "object" ? item.frame : paths[index].split("/").pop().replace(/\.jpg$/i, ""));
  $("#brain-saved-evidence-grid").innerHTML = data.map((item, index) => `<button type="button" class="brain-saved-evidence" data-brain-image-url="${esc(item.signedUrl)}" data-brain-caption="${esc(labels[index].replaceAll("_", " ").toUpperCase())}"><img src="${esc(item.signedUrl)}" alt="${esc(labels[index])}"><span>${esc(labels[index].replaceAll("_", " ").toUpperCase())}</span></button>`).join("");
  $("#brain-evidence-dialog").showModal();
}

function showUndoDelete() {
  let notice = $("#brain-delete-undo");
  if (!notice) {
    document.body.insertAdjacentHTML("beforeend", '<div id="brain-delete-undo" class="brain-delete-undo" role="status">Review deleted. <button type="button" data-undo-review-delete>Undo</button></div>');
    notice = $("#brain-delete-undo");
  }
  notice.hidden = false;
  clearTimeout(deleteUndoTimer);
  deleteUndoTimer = setTimeout(async () => {
    notice.hidden = true;
    const paths = evidencePaths(lastDeletedReview);
    if (paths.length) await supabase.storage.from(EVIDENCE_BUCKET).remove(paths);
    lastDeletedReview = null;
  }, 15000);
}

async function deleteReview(entry) {
  if (!entry || !confirm("Delete this saved AI review? You can undo for 15 seconds.")) return;
  const { error } = await supabase.from("trade_reviews").delete().eq("id", entry.id);
  if (error) return alert(`Could not delete the review: ${error.message}`);
  lastDeletedReview = entry;
  reviews = reviews.filter((item) => item.id !== entry.id);
  renderHistory();
  showUndoDelete();
}

async function undoDeleteReview() {
  if (!lastDeletedReview) return;
  const entry = lastDeletedReview;
  const { trade_debriefs, ...reviewRecord } = entry;
  const { error } = await supabase.from("trade_reviews").insert(reviewRecord);
  if (error) return alert(`Could not restore the review: ${error.message}`);
  lastDeletedReview = null;
  clearTimeout(deleteUndoTimer);
  $("#brain-delete-undo")?.setAttribute("hidden", "");
  await loadReviewerData();
}

function openCorrectionDialog(entry) {
  const trade = trades.find((item) => item.id === entry.trade_id);
  const dialog = document.createElement("dialog");
  dialog.innerHTML = `<form class="dialog-card mastery-form review-correction-form"><button class="dialog-close" type="button">×</button><p class="eyebrow amber">AI REVIEW CALIBRATION</p><h2>Correct the audit.</h2><p class="body-copy">The original review stays unchanged. This labeled correction is used to re-check the same visual pattern in future reviews.</p><label>Area<select name="correction_area"><option>Stop placement</option><option>Entry model</option><option>Both</option><option>Condition</option><option>Location</option><option>Confirmation</option><option>Other</option></select></label><label>What did the review get wrong?<textarea name="correction" required placeholder="Example: The stop was below the relevant low, and the chart showed a valid Type 3 entry."></textarea></label><label>Chart evidence <span class="field-optional">optional</span><textarea name="chart_evidence" placeholder="Describe the visible level, marker, or candle sequence that proves the correction."></textarea></label><button class="primary" type="submit">Save correction</button></form>`;
  document.body.append(dialog);
  dialog.querySelector(".dialog-close").onclick = () => { dialog.close(); dialog.remove(); };
  dialog.querySelector("form").onsubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const { data: sessionData } = await supabase.auth.getSession();
    const { error } = await supabase.from("trade_review_corrections").insert({ user_id: sessionData.session.user.id, trade_review_id: entry.id, trade_id: entry.trade_id || trade?.id || null, correction_area: String(form.get("correction_area")), correction: String(form.get("correction")).trim(), chart_evidence: String(form.get("chart_evidence") || "").trim() || null });
    if (error) return alert(`Correction could not be saved: ${error.message}`);
    dialog.close(); dialog.remove(); await loadReviewerData(); $("#brain-review-history-list").innerHTML = renderReview(entry.review_payload, entry);
  };
  dialog.showModal();
}

function reviewWriteup() {
  return {
    thesis: $("#brain-review-thesis")?.value.trim() || "",
    followed_system: $("#brain-review-followed")?.value || "",
    rule_violation: $("#brain-review-violation")?.value.trim() || "",
    went_well: $("#brain-review-went-well")?.value.trim() || "",
    would_change: $("#brain-review-change")?.value.trim() || "",
    management_notes: $("#brain-review-management")?.value.trim() || ""
  };
}
async function runReview(event) {
  event.preventDefault(); if (!supabase) return alert("Cloud connection is not configured.");
  const { data: sessionData } = await supabase.auth.getSession(); if (!sessionData.session) return alert("Sign in before requesting a trade review.");
  const trade = trades.find((item) => item.id === $("#brain-review-trade").value);
  const evidenceControls = Array.from(document.querySelectorAll("[data-review-frame]"));
  const missing = evidenceControls.filter((input) => !input.files?.[0]).map((input) => input.dataset.reviewFrame.replace("chart_", "").toUpperCase());
  if (!trade) return alert("Choose a journal trade number first.");
  if (missing.length) return alert("Add every required frame before the audit: " + missing.join(", ") + ".");
  const status = $("#brain-review-status"); const submit = $("#brain-review-submit"); submit.disabled = true; status.textContent = "Reading chart evidence against the Clarified Chaos FX system...";
  try {
    const screenshots = Object.fromEntries(await Promise.all(evidenceControls.map(async (input) => [input.dataset.reviewFrame, await compressImage(input.files[0])])));
    const noEntryReason = isTheoretical(trade) ? $("#brain-no-entry-reason").value.trim() : "";
    const writeup = reviewWriteup();
    const priorCorrections = corrections.slice(0, 40).map((item) => ({ trade_id: item.trade_id || null, same_trade: item.trade_id === trade.id, area: item.correction_area, correction: item.correction, chart_evidence: item.chart_evidence || null }));
    const response = await fetch("/api/trade-review", { method: "POST", headers: { "content-type":"application/json", authorization:`Bearer ${sessionData.session.access_token}` }, body: JSON.stringify({ trade, noEntryReason, writeup, screenshots, priorCorrections }) });
    const body = await response.json(); if (!response.ok) throw new Error(body.error || "The reviewer did not return an audit.");
    const scenario = body.scenario || {};
    const actualR = Number(trade.r_multiple || 0);
    const actualPnl = Number(trade.pnl_percent || 0);
    const wouldEnter = scenario.scenario_action === "Would enter";
    const simulatedR = wouldEnter ? actualR : 0;
    const simulatedPnl = wouldEnter ? actualPnl : 0;
    const scenarioResult = wouldEnter ? (actualR > 0 ? "correct_win" : actualR < 0 ? "wrong_loss" : "break_even") : scenario.scenario_action === "Would pass" ? (actualR < 0 ? "avoided_loss" : actualR > 0 ? "missed_winner" : "no_position") : "no_position";
    const reviewPayload = { ...body.review, blind_scenario: scenario, scenario_result: scenarioResult, simulated_r_multiple: simulatedR, simulated_pnl_percent: simulatedPnl, input_context: { writeup, evidence_frames: Object.keys(screenshots), evidence_retained: false, post_trade_commentary_dismissed: !Object.values(writeup).some(Boolean) } };
    const insert = await supabase.from("trade_reviews").insert({ user_id: sessionData.session.user.id, trade_id: trade.id, trader_thesis: writeup.thesis || null, no_entry_reason: noEntryReason || null, review_payload: reviewPayload, screenshot_count: Object.keys(screenshots).length, evidence_saved: false, evidence_paths: [], course_version: "1.3" });
    if (insert.error) throw new Error(`The audit was completed but could not be saved: ${insert.error.message}`);
    const scenarioInsert = await supabase.from("ai_trade_scenarios").insert({ user_id: sessionData.session.user.id, trade_id: trade.id, scenario_payload: scenario, scenario_action: scenario.scenario_action || "Insufficient evidence", simulated_r_multiple: simulatedR, simulated_pnl_percent: simulatedPnl, actual_r_multiple: actualR, actual_pnl_percent: actualPnl, scenario_result: scenarioResult, screenshot_count: Object.keys(screenshots).length });
    if (scenarioInsert.error) console.warn("AI scenario ledger is unavailable until migration 051 is applied.", scenarioInsert.error.message);
    status.textContent = "Blind scenario recorded. Full post-trade review saved."; $("#brain-review-form").reset(); await loadReviewerData(); $("#brain-review-dialog").close(); $("#brain-review-history-list")?.scrollIntoView({ behavior:"smooth", block:"center" });
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
function ensureEvidenceDialog() {
  if ($("#brain-evidence-dialog")) return;
  document.body.insertAdjacentHTML("beforeend", '<dialog id="brain-evidence-dialog" class="dialog-card brain-evidence-dialog"><button class="dialog-close" type="button" aria-label="Close">×</button><p class="eyebrow blue-text">PRIVATE REVIEW EVIDENCE</p><h2>Saved chart screenshots</h2><div id="brain-saved-evidence-grid" class="brain-saved-evidence-grid"></div></dialog>');
}
function ensureBriefingCss() {
  ["brain-briefing.css", "brain-visuals.css", "brain-visual-accent.css", "brain-scenario.css"].forEach((file) => {
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
  if (oldGrid && !$("#phase-zero-checklist")) oldGrid.outerHTML = '<div id="phase-zero-checklist" class="brain-chain"></div>';
  const chainHead = $(".brain-flow .panel-head");
  if (chainHead) {
    chainHead.querySelector(".eyebrow").textContent = "PHASE 0 PRE-TRADE CHECKLIST";
    chainHead.querySelector("h3").textContent = "Prove the offered model.";
    if (!$("#phase-zero-reset")) chainHead.insertAdjacentHTML("beforeend", '<button id="phase-zero-reset" class="text-link" type="button">Restart checklist</button>');
  }
  const source = $("#brain-library-content");
  if (source) {
    $(".brain-summary")?.remove();
    if (!$("#phase-zero-playbook")) source.insertAdjacentHTML("beforebegin", '<section class="brain-summary phase-zero-playbook" id="phase-zero-playbook"></section>');
    source.closest(".brain-library")?.querySelector(".eyebrow").textContent = "SUPPORTING COURSE REFERENCE";
    source.closest(".brain-library")?.querySelector("h3").textContent = "Supplemental source notes";
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
  normalizeAutomaticEvidenceUi();
  ensureScenarioSummary();
  $("#open-trade-review")?.addEventListener("click", () => $("#brain-review-dialog").showModal());
  $("#brain-review-dialog .dialog-close")?.addEventListener("click", () => $("#brain-review-dialog").close());
  $("#brain-review-form")?.addEventListener("submit", runReview);
  $("#brain-review-trade")?.addEventListener("change", syncTheoreticalReason);
  $("#brain-review-followed")?.addEventListener("change", syncViolationReason);
  $("#phase-zero-reset")?.addEventListener("click", () => { phaseZeroAnswers = []; phaseZeroTerminal = ""; renderPhaseZeroChecklist(); });
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-phase0-start]")) { $("#phase-zero-checklist")?.scrollIntoView({ behavior:"smooth", block:"center" }); return; }
    const phaseZeroChoice = event.target.closest("[data-phase0-choice]");
    if (phaseZeroChoice) {
      const step = phaseZeroStep();
      const choice = step?.choices[Number(phaseZeroChoice.dataset.phase0Choice)];
      if (!choice) return;
      phaseZeroAnswers.push({ id: step.id, title: step.title, label: choice.label, value: choice.value });
      if (choice.stop) phaseZeroTerminal = choice.stop;
      renderPhaseZeroChecklist();
      return;
    }
    if (event.target.closest("[data-phase0-back]")) { phaseZeroAnswers.pop(); phaseZeroTerminal = ""; renderPhaseZeroChecklist(); return; }
    const jump = event.target.closest("[data-brain-jump]"); if (jump) openSource(jump.dataset.brainJump);
    const choice = event.target.closest("[data-chain-choice]"); if (choice) { const selected = CHAIN[chainStep].choices[Number(choice.dataset.chainChoice)]; chainAnswers.push(selected.label); if (selected.stop) { chainTerminal = selected.stop; chainStep = CHAIN.length; renderChain(); return; } chainStep += 1; renderChain(); }
    if (event.target.closest("[data-chain-back]")) { chainAnswers.pop(); chainStep = Math.max(0, chainAnswers.length); chainTerminal = ""; renderChain(); }
    const slide = event.target.closest("[data-briefing-slide]"); if (slide) { briefingSlide = Number(slide.dataset.briefingSlide); renderBriefing(); }
    const direction = event.target.closest("[data-briefing-direction]"); if (direction) { briefingSlide = (briefingSlide + Number(direction.dataset.briefingDirection) + BRIEFING.length) % BRIEFING.length; renderBriefing(); }
    const history = event.target.closest("[data-review-id]"); if (history) { const review = reviews.find((entry) => entry.id === history.dataset.reviewId); if (review) $("#brain-review-history-list").innerHTML = renderReview(review.review_payload, review); }
    const correction = event.target.closest("[data-correct-review]"); if (correction) { const review = reviews.find((entry) => entry.id === correction.dataset.correctReview); if (review) openCorrectionDialog(review); }
    const evidence = event.target.closest("[data-open-review-evidence]"); if (evidence) { const review = reviews.find((entry) => entry.id === evidence.dataset.openReviewEvidence); if (review) openSavedEvidence(review); }
    const deleteReviewButton = event.target.closest("[data-delete-review]"); if (deleteReviewButton) { const review = reviews.find((entry) => entry.id === deleteReviewButton.dataset.deleteReview); deleteReview(review); }
    if (event.target.closest("[data-undo-review-delete]")) undoDeleteReview();
    const image = event.target.closest("[data-brain-image],[data-brain-image-url]"); if (image) { ensureImageDialog(); $("#brain-image-large").src = image.dataset.brainImageUrl || image.dataset.brainImage; $("#brain-image-caption").textContent = image.dataset.brainCaption || "Course reference"; $("#brain-image-dialog").showModal(); }
    if (event.target.closest("#brain-image-dialog .dialog-close")) $("#brain-image-dialog").close();
    if (event.target.closest("#brain-evidence-dialog .dialog-close")) $("#brain-evidence-dialog").close();
  });
  ensureImageDialog(); syncViolationReason(); renderPhaseZeroPlaybook(); renderPhaseZeroChecklist(); loadCourseLibrary(); loadReviewerData(); supabase?.auth.onAuthStateChange((event) => { if (event === "INITIAL_SESSION") return; setTimeout(loadReviewerData, 50); });
}
init();
