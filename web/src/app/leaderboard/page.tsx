"use client";

import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase";
import { formatGen } from "@/lib/format";

type Row = {
  address: string;
  username: string | null;
  total: number;
  won: number;
  lost: number;
  stakedWei: bigint;
  wonStakeWei: bigint;
};

export default function LeaderboardPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: preds, error: pErr } = await sb
          .from("predictions")
          .select("user_address, pick, stake_wei, match_id");
        if (pErr) throw pErr;
        if (!preds || preds.length === 0) { setRows([]); return; }

        // Join match results client-side (avoids PostgREST embed needing a FK).
        const matchIds = [...new Set(preds.map((p: { match_id: string }) => p.match_id))];
        const { data: matchRows } = await sb
          .from("matches")
          .select("match_id, status, result")
          .in("match_id", matchIds);
        const matchById: Record<string, { status?: string; result?: string }> = {};
        (matchRows || []).forEach((m: { match_id: string; status?: string; result?: string }) => {
          matchById[m.match_id] = m;
        });

        const { data: users } = await sb.from("users").select("user_address, username");
        const nameByAddr: Record<string, string> = {};
        (users || []).forEach((u: { user_address: string; username: string }) => {
          nameByAddr[(u.user_address || "").toLowerCase()] = u.username;
        });

        const byUser: Record<string, Row> = {};
        for (const p of preds as unknown as {
          user_address: string; pick: string; stake_wei: string; match_id: string;
        }[]) {
          const addr = (p.user_address || "").toLowerCase();
          if (!byUser[addr]) {
            byUser[addr] = { address: addr, username: nameByAddr[addr] || null, total: 0, won: 0, lost: 0, stakedWei: 0n, wonStakeWei: 0n };
          }
          const u = byUser[addr];
          u.total++;
          const stake = BigInt(p.stake_wei || 0);
          u.stakedWei += stake;
          const m = matchById[p.match_id];
          const isResolved = m?.status === "resolved" || m?.status === "finished";
          if (isResolved && m?.result === p.pick) { u.won++; u.wonStakeWei += stake; }
          else if (isResolved && m?.result && m.result !== p.pick) u.lost++;
        }

        const sorted = Object.values(byUser)
          .sort((a, b) => {
            if (b.won !== a.won) return b.won - a.won;
            if (b.wonStakeWei !== a.wonStakeWei) return b.wonStakeWei > a.wonStakeWei ? 1 : -1;
            return b.total - a.total;
          })
          .slice(0, 50);
        setRows(sorted);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  return (
    <section className="page" data-route="leaderboard">
      <header className="page-header">
        <p className="eyebrow">Top predictors</p>
        <h1 className="page-title">Leaderboard</h1>
      </header>

      {error ? (
        <div className="empty-state">Couldn&apos;t load leaderboard: {error}</div>
      ) : rows === null ? (
        <div className="empty-state">Loading leaderboard…</div>
      ) : rows.length === 0 ? (
        <div className="empty-state">No predictions yet. Be the first to predict!</div>
      ) : (
        <table className="leaderboard-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th className="num">Picks</th>
              <th className="num">Won</th>
              <th className="num">Lost</th>
              <th className="num">Staked</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.address}>
                <td className="rank">{i + 1}</td>
                <td className="player">
                  <span className="player-name">
                    {r.username || `${r.address.slice(0, 6)}…${r.address.slice(-4)}`}
                  </span>
                </td>
                <td className="num">{r.total}</td>
                <td className="num pick-won">{r.won}</td>
                <td className="num pick-lost">{r.lost}</td>
                <td className="num mono">{formatGen(r.stakedWei)} GEN</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
