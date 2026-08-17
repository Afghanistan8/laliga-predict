"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import Link from "next/link";
import { getMyPredictions, type PredictionRow } from "@/lib/supabase";
import { formatGen } from "@/lib/format";
import { Crest } from "@/components/Crest";

export default function MyPicksPage() {
  const { address, isConnected } = useAccount();
  const [picks, setPicks] = useState<PredictionRow[] | null>(null);

  useEffect(() => {
    if (!address) { setPicks([]); return; }
    getMyPredictions(address).then(setPicks).catch((e) => { console.error(e); setPicks([]); });
  }, [address]);

  if (!isConnected) {
    return (
      <section className="page" data-route="me">
        <header className="page-header">
          <p className="eyebrow">Your account</p>
          <h1 className="page-title">My picks</h1>
        </header>
        <div className="empty-state">Connect your wallet to see your prediction history.</div>
      </section>
    );
  }

  return (
    <section className="page" data-route="me">
      <header className="page-header">
        <p className="eyebrow">Your account</p>
        <h1 className="page-title">My picks</h1>
      </header>

      {picks === null ? (
        <div className="empty-state">Loading your picks…</div>
      ) : picks.length === 0 ? (
        <div className="empty-state">
          No predictions yet.{" "}
          <Link href="/" className="text-link">Browse matches</Link> to get started.
        </div>
      ) : (
        <div className="picks-list">
          {picks.map((p) => {
            const m = p.matches;
            if (!m) return null;
            const isResolved = m.status === "resolved" || m.status === "finished";
            const won = isResolved && m.result === p.pick;
            const lost = isResolved && m.result && m.result !== p.pick;
            const pending = !isResolved;
            return (
              <Link key={p.id} href={`/match/${p.match_id}`} className="pick-card" data-status={m.status}>
                <div className="pick-card-match">
                  <div className="pick-card-team">
                    <Crest team={m.home} size={32} />
                    <span>{m.home}</span>
                  </div>
                  <span className="pick-card-vs">vs</span>
                  <div className="pick-card-team">
                    <Crest team={m.away} size={32} />
                    <span>{m.away}</span>
                  </div>
                </div>
                <div className="pick-card-detail">
                  <div className="pick-card-pick">
                    <span className="pick-card-label">Your pick</span>
                    <span className="pick-card-value">{p.pick.toUpperCase()}</span>
                  </div>
                  <div className="pick-card-stake">
                    <span className="pick-card-label">Staked</span>
                    <span className="pick-card-value">{formatGen(BigInt(p.stake_wei))} GEN</span>
                  </div>
                  <div className="pick-card-status">
                    {won && <span className="pick-status pick-won">✓ Won</span>}
                    {lost && <span className="pick-status pick-lost">Lost</span>}
                    {pending && <span className="pick-status pick-pending">Pending</span>}
                    {p.claimed && <span className="pick-status pick-claimed">Claimed</span>}
                    {p.refunded && <span className="pick-status pick-refunded">Refunded</span>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
