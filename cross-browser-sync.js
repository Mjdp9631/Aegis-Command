import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.AEGIS_CONFIG || {};
const supabase = config.supabaseUrl && config.supabaseAnonKey ? createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const tableEvents = {
  missions: "missions",
  trade_debriefs: "trades",
  recovery_logs: "recovery",
  mastery_entries: "mastery",
  training_sessions: "mastery",
  training_sets: "mastery",
  health_weight_logs: "mastery",
  health_food_logs: "mastery",
  deep_work_logs: "mastery",
  business_projects: "enterprise",
  content_items: "enterprise",
  account_balances: "accounts",
  account_groups: "accounts",
  account_group_memberships: "accounts",
  account_group_trade_links: "accounts",
  account_group_withdrawals: "accounts",
  account_group_withdrawal_allocations: "accounts",
  phase_protocols: "phase",
  activity_events: "activity",
};

let channel = null;
let subscribedUser = "";

function relay(table) {
  const source = `remote-${tableEvents[table] || table}`;
  window.dispatchEvent(new CustomEvent("aegis:data-changed", { detail: { source, table, remote: true } }));
  if (source === "remote-operations") window.dispatchEvent(new CustomEvent("aegis:operations-changed", { detail: { source, table, remote: true } }));
  if (source === "remote-missions") window.dispatchEvent(new CustomEvent("aegis:missions-changed", { detail: { source, table, remote: true } }));
  if (source === "remote-mastery") window.dispatchEvent(new CustomEvent("aegis:mastery-changed", { detail: { source, table, remote: true } }));
  if (source === "remote-accounts") window.dispatchEvent(new CustomEvent("aegis:accounts-changed", { detail: { source, table, remote: true } }));
  if (source === "remote-phase") window.dispatchEvent(new CustomEvent("aegis:phase-changed", { detail: { source, table, remote: true } }));
}

async function subscribe() {
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user?.id || "";
  if (!userId || userId === subscribedUser) return;
  subscribedUser = userId;
  if (channel) await supabase.removeChannel(channel);
  channel = supabase.channel(`aegis-cross-browser-${userId}`);
  Object.entries(tableEvents).forEach(([table, eventSource]) => {
    channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `user_id=eq.${userId}` }, () => relay(table, eventSource));
  });
  channel.subscribe();
}

if (supabase) {
  void subscribe();
  supabase.auth.onAuthStateChange(() => { subscribedUser = ""; setTimeout(() => { void subscribe(); }, 0); });
  window.addEventListener("focus", () => { subscribedUser = ""; setTimeout(() => { void subscribe(); }, 0); });
  window.addEventListener("online", () => { subscribedUser = ""; setTimeout(() => { void subscribe(); }, 0); });
}
