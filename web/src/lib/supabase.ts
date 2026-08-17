import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/lib/config";

export const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false },
});

/* ---------- types ---------- */

export type Match = {
  match_id: string;
  contract_address: string | null;
  home: string;
  away: string;
  kickoff_ts: number;
  matchday: number | null;
  status: string;
  result: string | null;
  final_score: string | null;
  live_score_home: number | null;
  live_score_away: number | null;
  live_minute: string | null;
};

export type Standing = {
  team_id: number;
  position: number;
  team: string;
  short_name: string;
  crest: string;
  played: number;
  won: number;
  draw: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  points: number;
  form: string;
};

export type AIPrediction = {
  match_id: string;
  pick: string | null;
  confidence: string | null;
  reason: string | null;
  status: string;
};

export type PredictionRow = {
  id?: number;
  match_id: string;
  user_address: string;
  pick: string;
  stake_wei: string;
  tx_hash?: string;
  contract_address?: string;
  claimed?: boolean;
  refunded?: boolean;
  submitted_at?: string;
  matches?: Partial<Match> | null;
};

/* ---------- users ---------- */

export async function getUsername(address?: string): Promise<string | null> {
  if (!address) return null;
  const { data, error } = await sb
    .from("users")
    .select("username")
    .eq("user_address", address)
    .maybeSingle();
  if (error) {
    console.warn("getUsername:", error.message);
    return null;
  }
  return data?.username ?? null;
}

export async function createUser(address: string, username: string) {
  const { data, error } = await sb
    .from("users")
    .insert({ user_address: address, username })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function usernameExists(username: string): Promise<boolean> {
  const { data, error } = await sb
    .from("users")
    .select("user_address")
    .eq("username", username)
    .maybeSingle();
  if (error) {
    console.warn("usernameExists:", error.message);
    return false;
  }
  return Boolean(data);
}

/* ---------- matches ---------- */

export async function getMatches(): Promise<Match[]> {
  const { data, error } = await sb
    .from("matches")
    .select(
      `match_id, contract_address, home, away, kickoff_ts, matchday,
       status, result, final_score, live_score_home, live_score_away, live_minute`
    )
    .order("kickoff_ts", { ascending: true });
  if (error) throw error;
  return (data as Match[]) || [];
}

export async function getMatch(matchId: string): Promise<Match | null> {
  const { data, error } = await sb
    .from("matches")
    .select("*")
    .eq("match_id", matchId)
    .maybeSingle();
  if (error) throw error;
  return data as Match | null;
}

/* ---------- pools (supabase mirror; on-chain read is separate) ---------- */

export async function getPoolRow(matchId: string) {
  const { data, error } = await sb
    .from("pools")
    .select("*")
    .eq("match_id", matchId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/* ---------- predictions ---------- */

export async function getMyPredictions(address?: string): Promise<PredictionRow[]> {
  if (!address) return [];
  const { data, error } = await sb
    .from("predictions")
    .select("*")
    .ilike("user_address", address)
    .order("submitted_at", { ascending: false });
  if (error) throw error;
  const preds = (data as PredictionRow[]) || [];

  // Join match metadata client-side (avoids PostgREST embed needing a FK).
  if (preds.length === 0) return preds;
  const matchIds = [...new Set(preds.map((p) => p.match_id))];
  const { data: matchRows } = await sb
    .from("matches")
    .select("match_id, home, away, kickoff_ts, status, result, final_score, matchday")
    .in("match_id", matchIds);
  const matchById: Record<string, Partial<Match>> = {};
  (matchRows || []).forEach((m: Partial<Match> & { match_id: string }) => { matchById[m.match_id] = m; });
  preds.forEach((p) => { p.matches = matchById[p.match_id] || null; });
  return preds;
}

export async function readMyPrediction(matchId: string, address?: string) {
  if (!address) return null;
  const { data, error } = await sb
    .from("predictions")
    .select("*")
    .eq("match_id", matchId)
    .ilike("user_address", address)
    .maybeSingle();
  if (error) {
    console.warn("readMyPrediction:", error.message);
    return null;
  }
  return data as PredictionRow | null;
}

/* ---------- standings ---------- */

export async function getStandings(): Promise<Standing[]> {
  const { data, error } = await sb
    .from("standings")
    .select("*")
    .order("position", { ascending: true });
  if (error) throw error;
  return (data as Standing[]) || [];
}

/* ---------- AI Call ---------- */

export async function getAIPredictionsMap(): Promise<Record<string, AIPrediction>> {
  const { data, error } = await sb
    .from("ai_predictions")
    .select("match_id, pick, confidence, reason, status")
    .eq("status", "stored");
  if (error) {
    console.warn("getAIPredictionsMap:", error.message);
    return {};
  }
  const byId: Record<string, AIPrediction> = {};
  (data as AIPrediction[] | null)?.forEach((r) => {
    byId[r.match_id] = r;
  });
  return byId;
}

export async function getAIPrediction(matchId: string): Promise<AIPrediction | null> {
  const { data, error } = await sb
    .from("ai_predictions")
    .select("match_id, pick, confidence, reason, status")
    .eq("match_id", matchId)
    .maybeSingle();
  if (error) {
    console.warn("getAIPrediction:", error.message);
    return null;
  }
  const row = data as AIPrediction | null;
  return row && row.status === "stored" ? row : null;
}
