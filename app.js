const defaultOperations = [
  { title: "Complete prescribed ACL rehab", category: "Recovery", done: false },
  { title: "Pre-market analysis", category: "Trading", done: false },
  { title: "Review charts and document one lesson", category: "Trading", done: false },
  { title: "Read 20 pages", category: "Mind", done: false },
  { title: "Evening mission debrief", category: "Mind", done: false },
];

const briefings = [
  "“The mission is not intensity. It is repeatable excellence.”",
  "“You do not need more noise. You need a clearer next move.”",
  "“Capital and capacity are both protected by restraint.”",
  "“Build the system. The system carries you when motivation does not.”",
];

let operations = JSON.parse(localStorage.getItem("aegis-operations")) || defaultOperations;
let trades = JSON.parse(localStorage.getItem("aegis-trades")) || [];

const save = () => {
  localStorage.setItem("aegis-operations", JSON.stringify(operations));
  localStorage.setItem("aegis-trades", JSON.stringify(trades));
};

function renderOperations() {
  const list = document.querySelector("#operations-list");
  list.innerHTML = operations.map((operation, index) => `
    <label class="operation ${operation.done ? "done" : ""}">
      <input type="checkbox" ${operation.done ? "checked" : ""} data-operation="${index}" />
      <span><strong>${escapeHtml(operation.title)}</strong><small>${escapeHtml(operation.category)} · TODAY</small></span>
    </label>`).join("");
  list.querySelectorAll("[data-operation]").forEach(input => input.addEventListener("change", event => {
    operations[Number(event.target.dataset.operation)].done = event.target.checked;
    save(); renderOperations();
  }));
  const completed = operations.filter(o => o.done).length;
  document.querySelector("#operation-count").innerHTML = `${completed}<span>/${operations.length}</span>`;
  document.querySelector("#operation-meter").style.width = `${operations.length ? completed / operations.length * 100 : 0}%`;
  document.querySelector("#operation-caption").textContent = completed === operations.length ? "Mission accomplished" : `${operations.length - completed} operations remaining`;
}

function renderTrades() {
  const table = document.querySelector("#trade-log");
  if (!trades.length) { table.innerHTML = '<tr class="empty-row"><td colspan="6">No trade debriefs yet. Preserve data; log the next execution.</td></tr>'; return; }
  table.innerHTML = trades.map(trade => {
    const positive = Number(trade.r) >= 0;
    return `<tr><td>${escapeHtml(trade.time)}</td><td>${escapeHtml(trade.pair)}</td><td>${escapeHtml(trade.setup || "—")}</td><td class="${positive ? "result-positive" : "result-negative"}">${positive ? "+" : ""}${escapeHtml(trade.r)}R</td><td>${positive ? "WIN" : "LOSS"}</td><td>${escapeHtml(trade.grade)}</td></tr>`;
  }).join("");
}

function escapeHtml(value) { const div = document.createElement("div"); div.textContent = value; return div.innerHTML; }

document.querySelectorAll(".nav-link, [data-view-target]").forEach(link => link.addEventListener("click", event => {
  const view = link.dataset.view || link.dataset.viewTarget;
  if (!view) return;
  event.preventDefault();
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.querySelector(`#${view}`).classList.add("active");
  document.querySelectorAll(".nav-link").forEach(n => n.classList.toggle("active", n.dataset.view === view));
  document.querySelector("#view-title").textContent = view === "command" ? "COMMAND CENTER" : view.toUpperCase().replace("-", " ");
  window.history.replaceState(null, "", `#${view}`);
}));

const operationDialog = document.querySelector("#operation-dialog");
document.querySelectorAll('[data-action="add-operation"]').forEach(button => button.addEventListener("click", () => operationDialog.showModal()));
document.querySelector("#save-operation").addEventListener("click", event => {
  const title = document.querySelector("#operation-input").value.trim();
  if (!title) { event.preventDefault(); return; }
  operations.push({ title, category: document.querySelector("#operation-category").value, done: false });
  save(); renderOperations(); document.querySelector("#operation-input").value = "";
});

const tradeDialog = document.querySelector("#trade-dialog");
document.querySelectorAll('[data-action="add-trade"]').forEach(button => button.addEventListener("click", () => tradeDialog.showModal()));
document.querySelector("#save-trade").addEventListener("click", event => {
  const pair = document.querySelector("#trade-pair").value.trim();
  const r = document.querySelector("#trade-r").value;
  if (!pair || !r) { event.preventDefault(); return; }
  trades.unshift({ pair, r, setup: document.querySelector("#trade-setup").value.trim(), grade: document.querySelector("#trade-grade").value, time: new Date().toLocaleTimeString([], {hour: "2-digit", minute:"2-digit"}) });
  save(); renderTrades(); document.querySelector("#trade-pair").value = ""; document.querySelector("#trade-r").value = ""; document.querySelector("#trade-setup").value = "";
});

document.querySelector("#new-briefing").addEventListener("click", () => { document.querySelector("#briefing-text").textContent = briefings[Math.floor(Math.random() * briefings.length)]; });
const date = new Date(); document.querySelector("#system-date").textContent = date.toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric" }).toUpperCase().replace(",", " ·");
renderOperations(); renderTrades();
