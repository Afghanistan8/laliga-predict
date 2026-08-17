"use client";

import { useEffect, useMemo, useState } from "react";
import { getMatches, getAIPredictionsMap, sb, type Match, type AIPrediction } from "@/lib/supabase";
import { MatchCard } from "@/components/MatchCard";

type Filter = "today" | "upcoming" | "live" | "finished" | "all";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "live", label: "Live" },
  { key: "finished", label: "Finished" },
  { key: "all", label: "All" },
];

function filterMatches(matches: Match[], filter: Filter): Match[] {
  const now = Math.floor(Date.now() / 1000);
  if (filter === "today") {
    const s = new Date(); s.setHours(0, 0, 0, 0);
    const e = new Date(); e.setHours(23, 59, 59, 999);
    return matches.filter((m) => m.kickoff_ts >= s.getTime() / 1000 && m.kickoff_ts <= e.getTime() / 1000);
  }
  if (filter === "upcoming") return matches.filter((m) => m.kickoff_ts > now && m.status === "scheduled");
  if (filter === "live") return matches.filter((m) => m.status === "live");
  if (filter === "finished") return matches.filter((m) => m.status === "finished" || m.status === "resolved");
  return matches;
}

export default function HomePage() {
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [ai, setAi] = useState<Record<string, AIPrediction>>({});
  const [predictionCount, setPredictionCount] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>("upcoming");

  useEffect(() => {
    getMatches().then(setMatches).catch((e) => { console.error(e); setMatches([]); });
    getAIPredictionsMap().then(setAi).catch(() => {});
    sb.from("predictions").select("*", { count: "exact", head: true })
      .then(({ count }) => setPredictionCount(count ?? 0));
  }, []);

  const list = useMemo(() => filterMatches(matches || [], filter), [matches, filter]);

  return (
    <section className="page" data-route="home">
      <div className="hero">
        <p className="eyebrow">Pari-mutuel · settled on-chain · GenLayer Bradbury</p>
        <h1 className="hero-title">
          Predict every match of the<br />
          <em>2026/27 La&nbsp;Liga</em>.
        </h1>
        <p className="hero-lead">
          Stake GEN on home, draw, or away. Winners split the pool, pro-rata.
          Final scores read on-chain by AI consensus — no oracle, no house cut.
        </p>
        <div className="hero-stats">
          <div className="stat">
            <span className="stat-value">{matches ? matches.length : "—"}</span>
            <span className="stat-label">matches</span>
          </div>
          <div className="stat">
            <span className="stat-value">{predictionCount ?? "—"}</span>
            <span className="stat-label">predictions made</span>
          </div>
          <div className="stat">
            <span className="stat-value">0</span>
            <span className="stat-label">GEN staked</span>
          </div>
        </div>
      </div>

      <div className="match-controls">
        <div className="filter-tabs">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`filter-tab${filter === f.key ? " is-active" : ""}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="match-list">
        {matches === null ? (
          <div className="empty-state">Loading matches…</div>
        ) : list.length === 0 ? (
          <div className="empty-state">No matches to show for &quot;{filter}&quot;.</div>
        ) : (
          list.map((m) => <MatchCard key={m.match_id} m={m} ai={ai[m.match_id]} />)
        )}
      </div>
    </section>
  );
}
