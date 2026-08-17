import Link from "next/link";
import { Crest } from "@/components/Crest";
import { AIBadge } from "@/components/AIBadge";
import type { AIPrediction, Match } from "@/lib/supabase";

export function MatchCard({ m, ai }: { m: Match; ai?: AIPrediction | null }) {
  const date = new Date(m.kickoff_ts * 1000);
  const dateLabel = date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const timeLabel = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const stageLabel = m.matchday ? `Matchday ${m.matchday}` : "La Liga 26/27";
  const scheduled = m.status === "scheduled";
  const homeScore = scheduled ? "—" : m.live_score_home ?? "—";
  const awayScore = scheduled ? "—" : m.live_score_away ?? "—";
  const hasAi = Boolean(ai?.pick);

  return (
    <Link href={`/match/${m.match_id}`} className="match-card" data-status={m.status}>
      <div className="match-meta">
        <span className="match-stage">{stageLabel}</span>
        <span className="match-time">{dateLabel} · {timeLabel}</span>
      </div>
      <div className="match-teams">
        <div className="match-team">
          <Crest team={m.home} size={40} />
          <span className="team-name">{m.home}</span>
          <span className="team-score">{homeScore}</span>
        </div>
        <div className="match-team">
          <Crest team={m.away} size={40} />
          <span className="team-name">{m.away}</span>
          <span className="team-score">{awayScore}</span>
        </div>
      </div>
      {hasAi && (
        <div className="match-card-ai">
          <AIBadge match={m} ai={ai} compact />
        </div>
      )}
    </Link>
  );
}
