"use client";

import { useEffect, useState } from "react";
import { getStandings, type Standing } from "@/lib/supabase";

function FormDots({ form }: { form: string }) {
  const items = (form || "").split(",").filter(Boolean).slice(-5);
  if (items.length === 0) return null;
  return (
    <>
      {items.map((f, i) => {
        const cls = f === "W" ? "form-w" : f === "L" ? "form-l" : "form-d";
        const title = f === "W" ? "Win" : f === "L" ? "Loss" : "Draw";
        return <span key={i} className={`form-dot ${cls}`} title={title}>{f}</span>;
      })}
    </>
  );
}

export default function TablePage() {
  const [rows, setRows] = useState<Standing[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getStandings().then(setRows).catch((e) => setError(e.message));
  }, []);

  return (
    <section className="page" data-route="table">
      <header className="page-header">
        <p className="eyebrow">2026/27 season</p>
        <h1 className="page-title">La Liga table</h1>
      </header>

      {error ? (
        <div className="empty-state">Couldn&apos;t load table: {error}</div>
      ) : rows === null ? (
        <div className="empty-state">Loading table…</div>
      ) : rows.length === 0 ? (
        <div className="empty-state">
          The La Liga table is empty — season hasn&apos;t started yet. Check back after 14 Aug 2026.
        </div>
      ) : (
        <div className="standings-wrap">
          <table className="standings-table">
            <thead>
              <tr>
                <th className="col-pos">#</th>
                <th className="col-team">Club</th>
                <th className="col-num" title="Played">P</th>
                <th className="col-num" title="Won">W</th>
                <th className="col-num" title="Drawn">D</th>
                <th className="col-num" title="Lost">L</th>
                <th className="col-num" title="Goals For">GF</th>
                <th className="col-num" title="Goals Against">GA</th>
                <th className="col-num" title="Goal Difference">GD</th>
                <th className="col-pts" title="Points">Pts</th>
                <th className="col-form" title="Last 5">Form</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const gd = r.goal_difference >= 0 ? `+${r.goal_difference}` : `${r.goal_difference}`;
                const gdCls = r.goal_difference > 0 ? "gd-pos" : r.goal_difference < 0 ? "gd-neg" : "";
                return (
                  <tr key={r.team_id}>
                    <td className="col-pos">{r.position}</td>
                    <td className="col-team">
                      {r.crest && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.crest} alt={r.team} className="standings-crest" width={20} height={20} loading="lazy" />
                      )}
                      <span className="standings-name">{r.team}</span>
                      <span className="standings-short">{r.short_name || ""}</span>
                    </td>
                    <td className="col-num">{r.played}</td>
                    <td className="col-num">{r.won}</td>
                    <td className="col-num">{r.draw}</td>
                    <td className="col-num">{r.lost}</td>
                    <td className="col-num">{r.goals_for}</td>
                    <td className="col-num">{r.goals_against}</td>
                    <td className={`col-num ${gdCls}`}>{gd}</td>
                    <td className="col-pts">{r.points}</td>
                    <td className="col-form"><FormDots form={r.form} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="standings-foot">Via BBC Sport · Updated every ~3 hours</p>
        </div>
      )}
    </section>
  );
}
