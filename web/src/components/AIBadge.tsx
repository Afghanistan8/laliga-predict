import type { AIPrediction, Match } from "@/lib/supabase";

export function AIBadge({
  match,
  ai,
  compact = false,
}: {
  match: Pick<Match, "home" | "away">;
  ai?: AIPrediction | null;
  compact?: boolean;
}) {
  if (!ai || !ai.pick) return null;
  const pickTeam = ai.pick === "home" ? match.home : ai.pick === "away" ? match.away : "Draw";
  return (
    <span className="ai-badge" data-pick={ai.pick} title={ai.reason || "GenLayer AI call"}>
      <span className="ai-badge-mark">AI</span>
      <span className="ai-badge-pick">{pickTeam}</span>
      {!compact && ai.confidence && <span className="ai-badge-conf">{ai.confidence}</span>}
    </span>
  );
}
