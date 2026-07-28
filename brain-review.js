import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.AEGIS_CONFIG || {};
const supabase = config.supabaseUrl && config.supabaseAnonKey ? createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const $ = (selector) => document.querySelector(selector);
let trades = [];
let reviews = [];

const esc = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[character]));
const setup = (value) => { try { return JSON.parse(value || "[]").join(" + "); } catch { return value || "—"; } };
const tradeLabel = (trade) => `${new Date(trade.traded_at || trade.created_at).toLocaleDateString()} · ${trade.pair || "Pair"} · ${setup(trade.setup)} · ${trade.outcome || trade.trade_status || "Open"}`;

function renderReview(review) {
  const verdictClass = String(review.verdict || "").toLowerCase().replaceAll(" ", "-");
  const audit = (review.rule_audit || []).map((item) => `<article class="review-rule"><strong>${esc(item.rule)}</strong><span class="review-status ${esc(String(item.status || "").toLowerCase().replaceAll(" ", "-"))}">${esc(item.status)}</span><p>${esc(item.evidence)}</p><small>${esc(item.source_reference)}</small></article>`).join("");
  return `<article class="brain-review-card"><div class="brain-review-card-head"><div><p class="eyebrow blue-text">SYSTEM AUDIT</p><h3>${esc(review.process_grade || "Process review")}</h3></div><span class="review-verdict ${verdictClass}">${esc(review.verdict || "Pending")}</span></div><p>${esc(review.executive_summary || "No summary returned.")}</p><div class="review-columns"><div><h4>Observed evidence</h4><ul>${(review.observed_evidence || []).map((item) => `<li>${esc(item)}</li>`).join("") || "<li>No decisive evidence captured.</li>"}</ul></div><div><h4>Missing evidence</h4><ul>${(review.missing_evidence || []).map((item) => `<li>${esc(item)}</li>`).join("") || "<li>None identified.</li>"}</ul></div></div><div class="review-rules">${audit}</div><div class="thesis-compare"><h4>Thesis comparison</h4><p><b>Where it aligns:</b> ${(review.thesis_comparison?.matches || []).map(esc).join("; ") || "No alignment established."}</p><p><b>Correction:</b> ${esc(review.thesis_comparison?.correction || "No correction returned.")}</p></div><p class="review-focus"><b>Next review focus:</b> ${esc(review.next_review_focus || "Capture the full evidence chain.")}</p></article>`;
}

function renderHistory() {
  const list = $("#brain-review-history-list");
  const count = $("#brain-review-count");
  if (!list || !count) return;
  count.textContent = `${reviews.length} REVIEW${reviews.length === 1 ? "" : "S"}`;
  list.innerHTML = reviews.length ? reviews.map((entry) => `<button class="brain-history-item" data-review-id="${entry.id}"><span>${esc(entry.review_payload?.verdict || "Review")}</span><strong>${esc(entry.trade_debriefs ? tradeLabel(entry.trade_debriefs) : "Trade review")}</strong><small>${new Date(entry.created_at).toLocaleString()}</small></button>`).join("") : "No AI reviews yet. Select a trade, provide the screenshots, then let the system audit it.";
}

async function loadReviewerData() {
  if (!supabase) return;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return;
  const [tradeResult, reviewResult] = await Promise.all([
    supabase.from("trade_debriefs").select("*").order("traded_at", { ascending: false }),
    supabase.from("trade_reviews").select("*, trade_debriefs(*)").order("created_at", { ascending: false }).limit(24)
  ]);
  trades = tradeResult.data || [];
  reviews = reviewResult.data || [];
  const control = $("#brain-review-trade");
  if (control) control.innerHTML = '<option value="">Choose a logged trade</option>' + trades.map((trade) => `<option value="${trade.id}">${esc(tradeLabel(trade))}</option>`).join("");
  renderHistory();
}

async function asDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

async function runReview(event) {
  event.preventDefault();
  if (!supabase) return alert("Cloud connection is not configured.");
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return alert("Sign in before requesting a trade review.");
  const trade = trades.find((item) => item.id === $("#brain-review-trade").value);
  const files = Array.from($("#brain-review-images").files || []);
  if (!trade || !files.length) return;
  if (files.length > 8) return alert("Use up to 8 screenshots for one audit.");
  const status = $("#brain-review-status");
  const submit = $("#brain-review-submit");
  submit.disabled = true;
  status.textContent = "Reading chart evidence against the Clarified Chaos FX system…";
  try {
    const screenshots = await Promise.all(files.map(asDataUrl));
    const response = await fetch("/api/trade-review", { method: "POST", headers: { "content-type":"application/json", authorization:`Bearer ${sessionData.session.access_token}` }, body: JSON.stringify({ trade, traderThesis: $("#brain-review-thesis").value.trim(), screenshots }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "The reviewer did not return an audit.");
    const insert = await supabase.from("trade_reviews").insert({ user_id: sessionData.session.user.id, trade_id: trade.id, trader_thesis: $("#brain-review-thesis").value.trim() || null, review_payload: body.review, screenshot_count: screenshots.length, course_version: "1.1" });
    if (insert.error) throw new Error(`The audit was completed but could not be saved: ${insert.error.message}`);
    status.textContent = "Audit complete. Stored in independent review history.";
    $("#brain-review-form").reset();
    await loadReviewerData();
    $("#brain-review-dialog").close();
    const library = $("#brain-review-history-list");
    library?.scrollIntoView({ behavior:"smooth", block:"center" });
  } catch (error) {
    status.textContent = error.message || "The audit could not be completed.";
  } finally { submit.disabled = false; }
}

function formatCourse(markdown) {
  const mapping = { "condition":"1.4 Direction and Condition", "location":"1.6 Location and the Three 50%s", "trigger":"1.7 Arrival / Counter-Sequence", "execution":"1.12 Entry Variants", "risk":"3. Risk Governance" };
  const headings = markdown.split(/\r?\n/).filter((line) => /^#{1,3}\s/.test(line));
  return headings.map((line) => {
    const text = line.replace(/^#+\s*/, "");
    const id = Object.entries(mapping).find(([, reference]) => text.includes(reference))?.[0] || "";
    return `<button class="brain-source-link" ${id ? `id="brain-source-${id}"` : ""}><span>${esc(text)}</span><b>Open source</b></button>`;
  }).join("");
}

async function loadCourseLibrary() {
  try {
    const [master, index] = await Promise.all([fetch("brain/Clarified_Chaos_FX_AEGIS_Master_Brain.md").then((response) => response.text()), fetch("brain/source_index.json").then((response) => response.json())]);
    $("#brain-library-content").innerHTML = formatCourse(master);
    const items = Array.isArray(index) ? index : (index.items || index.assets || []);
    $("#brain-visual-library").innerHTML = items.map((asset) => `<article><img src="brain/${esc(asset.relative_path || asset.path || asset.file || "")}" alt="${esc(asset.caption || asset.title || "Course reference")}" loading="lazy" /><p>${esc(asset.caption || asset.title || "Course reference")}</p><small>${esc((asset.concepts || []).join(" · "))}</small></article>`).join("");
  } catch { $("#brain-library-content").innerHTML = "The source library could not be loaded. Confirm the brain folder was uploaded with the deployment."; }
}

function init() {
  $("#open-trade-review")?.addEventListener("click", () => $("#brain-review-dialog").showModal());
  $("#brain-review-dialog .dialog-close")?.addEventListener("click", () => $("#brain-review-dialog").close());
  $("#brain-review-form")?.addEventListener("submit", runReview);
  document.addEventListener("click", (event) => {
    const jump = event.target.closest("[data-brain-jump]");
    if (jump) $("#brain-source-" + jump.dataset.brainJump)?.scrollIntoView({ behavior:"smooth", block:"center" });
    const history = event.target.closest("[data-review-id]");
    if (history) { const review = reviews.find((entry) => entry.id === history.dataset.reviewId); if (review) { const target = $("#brain-review-history-list"); target.innerHTML = renderReview(review.review_payload); } }
  });
  loadCourseLibrary();
  loadReviewerData();
  supabase?.auth.onAuthStateChange(() => setTimeout(loadReviewerData, 50));
}

init();
