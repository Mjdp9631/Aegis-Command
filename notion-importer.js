import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
let JSZip;

const config = window.AEGIS_CONFIG || {};
const supabase = config.supabaseUrl && config.supabaseAnonKey ? createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const $ = (selector) => document.querySelector(selector);
let pendingTrades = [];

function parseCsv(text) {
  const rows = [], row = []; let cell = "", quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index], next = text[index + 1];
    if (character === '"' && quoted && next === '"') { cell += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(cell); if (row.some((value) => value !== "")) rows.push([...row]); row.length = 0; cell = "";
    } else cell += character;
  }
  row.push(cell); if (row.some((value) => value !== "")) rows.push(row);
  const [headers, ...data] = rows;
  return data.map((values) => Object.fromEntries(headers.map((header, index) => [header.trim(), (values[index] || "").trim()])));
}

async function csvFromFile(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes[0] !== 80 || bytes[1] !== 75) return new TextDecoder().decode(buffer);
  JSZip ||= (await import("https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm")).default;
  const outer = await JSZip.loadAsync(buffer);
  let entry = Object.values(outer.files).find((item) => !item.dir && item.name.toLowerCase().endsWith(".csv"));
  if (entry) return entry.async("string");
  const nested = Object.values(outer.files).find((item) => !item.dir);
  if (!nested) throw new Error("No CSV was found in this export.");
  const inner = await JSZip.loadAsync(await nested.async("arraybuffer"));
  entry = Object.values(inner.files).find((item) => !item.dir && item.name.toLowerCase().endsWith(".csv"));
  if (!entry) throw new Error("No Journal CSV was found inside the export.");
  return entry.async("string");
}

function number(value) { const parsed = Number(String(value || "").replace(/[%R,]/g, "").trim()); return Number.isFinite(parsed) ? parsed : null; }
function outcome(row) { if (row.Win) return row.Win; if (row.Loss) return row.Loss; if (row["B/E"]) return "B/E"; return null; }
function parseTime(value) { const parsed = new Date(String(value || "").replace(/\s*\([^)]*\)/, "")); return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString(); }
function splitChoices(value) { return String(value || "").split(",").map((item) => item.trim()).filter(Boolean); }
function mapTrade(row) {
  const result = outcome(row);
  return {
    pair: row.Pair || "Unknown",
    setup: JSON.stringify(splitChoices(row.Setup)),
    trade_type: row.Type || null,
    market_condition: row["Market Condition"] || null,
    cb_hour: row["CB Hour"] || null,
    r_multiple: number(row.R),
    pnl_percent: number(row["PnL %"]),
    outcome: result,
    trade_status: result ? "Closed" : "Open",
    execution_grade: ["A", "B", "C", "D"].includes(row["Execution Grade"]) ? row["Execution Grade"] : "A",
    mae_30m: number(row["MAE 30m"]),
    mfe_30m: number(row["MFE 30m"]),
    position: row.Position || null,
    account: row.Account || null,
    trade_day: row.Day || null,
    trade_month: row.Month || null,
    session_time: row["Session Time"] || null,
    entry_timeframe: row["Entry TF"] || null,
    wick: row.Wick || null,
    traded_at: parseTime(row.Time)
  };
}

function buildImporter() {
  const button = document.createElement("button");
  button.className = "text-button import-journal";
  button.textContent = "Import Notion journal";
  $(".trade-panel .panel-head").appendChild(button);
  const dialog = document.createElement("dialog");
  dialog.id = "notion-import-dialog";
  dialog.innerHTML = '<form method="dialog" class="dialog-card"><button class="dialog-close" type="button" aria-label="Close">×</button><p class="eyebrow blue-text">NOTION TRANSFER</p><h2>Import trade history.</h2><p class="auth-copy">Choose your Notion export. AEGIS will preview the count before it imports anything.</p><label>Journal export <input id="notion-journal-file" type="file" accept=".csv,.zip" required /></label><p id="notion-import-status" class="auth-message"></p><button class="primary" id="preview-notion-import" value="default">Preview import</button><button class="primary import-confirm" id="confirm-notion-import" type="button" hidden>Import trades</button></form>';
  document.body.appendChild(dialog);
  dialog.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
  button.addEventListener("click", () => dialog.showModal());
  $("#preview-notion-import").addEventListener("click", async (event) => {
    const file = $("#notion-journal-file").files[0];
    if (!file) return event.preventDefault();
    event.preventDefault();
    const status = $("#notion-import-status"); status.textContent = "Reading Journal export…";
    try {
      const rows = parseCsv(await csvFromFile(file)).filter((row) => row.Pair || row.Time);
      pendingTrades = rows.map(mapTrade);
      status.textContent = `${pendingTrades.length} trades ready. Review the count, then confirm import.`;
      $("#confirm-notion-import").hidden = false;
      $("#confirm-notion-import").textContent = `Import ${pendingTrades.length} trades`;
    } catch (error) { status.textContent = error.message; }
  });
  $("#confirm-notion-import").addEventListener("click", async () => {
    const status = $("#notion-import-status");
    if (!pendingTrades.length || !supabase) return;
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) { status.textContent = "Sign in before importing."; return; }
    status.textContent = "Checking existing trade logs…";
    const { data: existing, error: existingError } = await supabase.from("trade_debriefs").select("pair,traded_at,r_multiple");
    if (existingError) { status.textContent = existingError.message; return; }
    const key = (trade) => `${trade.pair}|${trade.traded_at}|${trade.r_multiple ?? ""}`;
    const existingKeys = new Set((existing || []).map(key));
    const imports = pendingTrades.filter((trade) => !existingKeys.has(key(trade)));
    if (!imports.length) { status.textContent = "Those trades are already in AEGIS."; return; }
    status.textContent = `Importing ${imports.length} trades…`;
    const { error } = await supabase.from("trade_debriefs").insert(imports);
    if (error) { status.textContent = error.message; return; }
    status.textContent = `${imports.length} trades imported successfully.`;
    pendingTrades = [];
    $("#confirm-notion-import").hidden = true;
  });
}

if (supabase) {
  const mountImporter = () => { if (window.AEGIS_ACTIVE_VIEW === "detective") buildImporter(); };
  if (!window.AEGIS_ACTIVE_VIEW || window.AEGIS_ACTIVE_VIEW === "detective") mountImporter();
  window.addEventListener("aegis:navigation", (event) => { if (event.detail?.view === "detective") mountImporter(); });
}
