import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.AEGIS_CONFIG || {};
const supabase = config.supabaseUrl && config.supabaseAnonKey ? createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const $ = (selector) => document.querySelector(selector);
const escape = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
const icons = { Recovery: "＋", Trading: "◈", Business: "▦", Mind: "◇" };

function render(missions) {
  const target = $("#command-missions");
  if (!target) return;
  const priority = { "Do now": 0, Schedule: 1, Delegate: 2, Eliminate: 3 };
  const active = missions.filter((mission) => Number(mission.progress) < 100).sort((a, b) => (priority[a.priority] ?? 9) - (priority[b.priority] ?? 9) || b.progress - a.progress).slice(0, 3);
  target.innerHTML = active.length ? active.map((mission) => `<article><div class="mission-icon ${mission.category === "Recovery" ? "recovery-icon" : mission.category === "Trading" ? "trade-icon" : "business-icon"}">${icons[mission.category] || "◇"}</div><div><strong>${escape(mission.title)}</strong><small>${escape(mission.category)} - ${escape(mission.priority)}</small></div><span>${mission.progress}%</span></article>`).join("") : '<article><div><strong>No active missions</strong><small>Open the next objective from Mission Control.</small></div></article>';
}

async function load() {
  if (!supabase) return;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return;
  const { data, error } = await supabase.from("missions").select("*").order("created_at", { ascending: false });
  if (!error) render(data || []);
}

if (supabase) {
  load();
  supabase.auth.onAuthStateChange(() => setTimeout(load, 80));
  window.addEventListener("aegis:missions-changed", () => setTimeout(load, 80));
}
