"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAccount, useSwitchChain } from "wagmi";
import { getMatch, getAIPrediction, readMyPrediction, sb, type Match, type AIPrediction, type PredictionRow } from "@/lib/supabase";
import { readPools, readMatchInfo, submitPrediction, claim, refund, markPostponed, type Pools, type OnchainMatchInfo } from "@/lib/market";
import { toWei, formatGen, computeExpectedPayout } from "@/lib/format";
import { MIN_STAKE_GEN } from "@/lib/config";
import { bradbury } from "@/config/wagmi";
import { Crest } from "@/components/Crest";
import { useToast } from "@/components/Toast";
import type { Eip1193Provider } from "@/config/genlayer";

const ZERO: Pools = { home: 0n, draw: 0n, away: 0n, total: 0n };

export default function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toast = useToast();
  const { address, isConnected, connector, chainId } = useAccount();
  const { switchChain } = useSwitchChain();

  const [match, setMatch] = useState<Match | null | undefined>(undefined);
  const [ai, setAi] = useState<AIPrediction | null>(null);
  const [pools, setPools] = useState<Pools>(ZERO);
  const [mine, setMine] = useState<PredictionRow | null>(null);
  const [onchain, setOnchain] = useState<OnchainMatchInfo | null>(null);

  const [pick, setPick] = useState<"home" | "draw" | "away" | null>(null);
  const [stake, setStake] = useState("");
  const [busy, setBusy] = useState(false);

  const onBradbury = chainId === bradbury.id;

  const load = useCallback(async () => {
    const m = await getMatch(id);
    setMatch(m);
    if (!m) return;
    getAIPrediction(id).then(setAi).catch(() => {});
    if (m.contract_address) {
      readPools(m.contract_address).then(setPools).catch(() => {});
      // Authoritative on-chain status — decides claim/refund, never the mirror's
      // off-chain 'postponed_pending' hint (Pavel Kolosov review).
      readMatchInfo(m.contract_address).then(setOnchain).catch(() => {});
    }
    setMine(address ? await readMyPrediction(id, address) : null);
  }, [id, address]);

  useEffect(() => { load(); }, [load]);

  if (match === undefined) {
    return <section className="page"><div className="empty-state">Loading match…</div></section>;
  }
  if (match === null) {
    return (
      <section className="page">
        <Link href="/" className="back-link">← All matches</Link>
        <div className="empty-state">Match not found.</div>
      </section>
    );
  }

  const m = match;
  const date = new Date(m.kickoff_ts * 1000);
  const dateLabel = date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const timeLabel = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
  const stageLabel = m.matchday ? `Matchday ${m.matchday}` : "La Liga 26/27";
  const total = Number(pools.total) || 0;
  const POSTPONE_GRACE_SECS = 10800; // 3h — matches the contract
  const nowSec = Math.floor(Date.now() / 1000);
  const chainStatus = onchain?.status || null;             // 'open'|'resolved'|'refunding' when loaded
  const kickoff = Number(onchain?.kickoff_ts || m.kickoff_ts || 0);

  const isResolved = m.status === "resolved" || m.status === "finished"; // display (FT / live score)
  // Refund is exposed ONLY when the CONTRACT reports 'refunding'. An off-chain
  // 'postponed'/'postponed_pending' mirror label never enables it.
  const isRefunding = chainStatus ? chainStatus === "refunding" : m.status === "refunding";
  const offchainPostponed = m.status === "postponed_pending" || m.status === "postponed";
  const isPostponedPending = offchainPostponed && !isRefunding && chainStatus !== "resolved";
  const canMarkPostponed = chainStatus === "open" && nowSec >= kickoff + POSTPONE_GRACE_SECS;
  const canPredict = m.status === "scheduled" && !mine && nowSec < kickoff;
  const isLiveish = m.status === "live" || m.status === "finished" || m.status === "resolved";

  async function activeProvider(): Promise<Eip1193Provider | undefined> {
    try { return (await connector?.getProvider()) as Eip1193Provider | undefined; }
    catch { return undefined; }
  }

  async function onSubmit() {
    if (!address || !pick || !m.contract_address) return;
    const stakeNum = parseFloat(stake);
    if (!isFinite(stakeNum) || stakeNum < MIN_STAKE_GEN) { toast(`Minimum ${MIN_STAKE_GEN} GEN`, "error"); return; }
    setBusy(true);
    try {
      const provider = await activeProvider();
      const txHash = await submitPrediction(address, provider, m.contract_address, pick, toWei(stake));
      const { error } = await sb.from("predictions").insert({
        match_id: m.match_id,
        user_address: address,
        pick,
        stake_wei: toWei(stake).toString(),
        tx_hash: txHash,
        contract_address: m.contract_address,
      });
      if (error) toast(`Predicted on-chain, but mirror failed: ${error.message}`, "error");
      else toast(`Prediction submitted: ${pick.toUpperCase()} · ${stake} GEN`);
      setPick(null); setStake("");
      await load();
    } catch (e) {
      toast((e as Error).message || "Prediction failed", "error");
    }
    setBusy(false);
  }

  async function onClaim() {
    if (!address || !m.contract_address) return;
    setBusy(true);
    try {
      const provider = await activeProvider();
      const txHash = await claim(address, provider, m.contract_address);
      await sb.from("predictions").update({ claimed: true, claim_tx_hash: txHash }).eq("match_id", m.match_id).ilike("user_address", address);
      toast("Winnings claimed! 🎉");
      await load();
    } catch (e) { toast((e as Error).message || "Claim failed", "error"); }
    setBusy(false);
  }

  async function onRefund() {
    if (!address || !m.contract_address) return;
    setBusy(true);
    try {
      const provider = await activeProvider();
      const txHash = await refund(address, provider, m.contract_address);
      await sb.from("predictions").update({ refunded: true, refund_tx_hash: txHash }).eq("match_id", m.match_id).ilike("user_address", address);
      toast("Refund claimed");
      await load();
    } catch (e) { toast((e as Error).message || "Refund failed", "error"); }
    setBusy(false);
  }

  // Real application path for mark_postponed(): submit, wait for finality (the
  // write() helper waits for ACCEPTED), then RE-READ on-chain status. Refunds
  // open only if the contract itself now reports 'refunding'.
  async function onMarkPostponed() {
    if (!m.contract_address) return;
    if (!address) { toast("Connect a wallet first", "error"); return; }
    setBusy(true);
    try {
      const provider = await activeProvider();
      await markPostponed(address, provider, m.contract_address);   // waits for finality
      const fresh = await readMatchInfo(m.contract_address);
      setOnchain(fresh);
      if (fresh?.status === "refunding") {
        // Copy the verified on-chain state into the mirror so other views agree.
        await sb.from("matches").update({ status: "refunding", result: "", final_score: "" }).eq("match_id", m.match_id);
        toast("Postponement confirmed on-chain — refunds are now open.");
      } else {
        toast("Submitted, but the sources didn't confirm a postponement. The market stays open.", "error");
      }
      await load();
    } catch (e) { toast((e as Error).message || "mark_postponed failed", "error"); }
    setBusy(false);
  }

  const won = isResolved && mine && m.result === mine.pick;
  const lost = isResolved && mine && m.result && m.result !== mine.pick;

  const stakeNum = parseFloat(stake);
  const expected =
    pick && isFinite(stakeNum) && stakeNum >= MIN_STAKE_GEN
      ? computeExpectedPayout(toWei(stake), pools[pick], pools.total)
      : null;

  const submitLabel = !isConnected
    ? "Connect wallet to predict"
    : !onBradbury
    ? "Switch to Bradbury"
    : !pick
    ? "Pick a side"
    : !isFinite(stakeNum) || stakeNum < MIN_STAKE_GEN
    ? `Min ${MIN_STAKE_GEN} GEN`
    : busy
    ? "Confirming…"
    : `Predict ${pick.toUpperCase()} · ${stake} GEN`;
  const submitDisabled = !isConnected || !onBradbury || !pick || !isFinite(stakeNum) || stakeNum < MIN_STAKE_GEN || busy;

  const aiPickTeam = ai?.pick === "home" ? m.home : ai?.pick === "away" ? m.away : "Draw";

  return (
    <section className="page" data-route="match">
      <Link href="/" className="back-link">← All matches</Link>
      <div className="match-detail">
        <div className="match-detail-header">
          <p className="eyebrow">{stageLabel}</p>
          <div className="match-detail-teams">
            <div className="match-detail-team">
              <Crest team={m.home} size={120} className="match-detail-crest" />
              <h2 className="match-detail-team-name">{m.home}</h2>
            </div>
            {isLiveish ? (
              <span className="live-score-display">
                {m.live_score_home ?? 0} <span className="live-score-sep">·</span> {m.live_score_away ?? 0}
              </span>
            ) : (
              <span className="match-detail-vs">vs</span>
            )}
            <div className="match-detail-team">
              <Crest team={m.away} size={120} className="match-detail-crest" />
              <h2 className="match-detail-team-name">{m.away}</h2>
            </div>
          </div>
          <div className="match-detail-meta">
            {m.status === "live" ? (
              <span className="status-badge is-live">LIVE{m.live_minute ? ` · ${m.live_minute}` : ""}</span>
            ) : isResolved ? (
              <span className="status-badge is-resolved">FT · {m.result?.toUpperCase()}</span>
            ) : isRefunding ? (
              <span className="status-badge is-warning">REFUNDING · claim your stake</span>
            ) : isPostponedPending ? (
              <span className="status-badge is-muted">POSTPONED · awaiting on-chain confirmation</span>
            ) : (
              <span className="status-badge">{dateLabel} · {timeLabel}</span>
            )}
          </div>
        </div>

        {ai?.pick && (
          <div className="ai-call-panel" data-pick={ai.pick}>
            <div className="ai-call-head">
              <span className="ai-call-mark">AI</span>
              <p className="eyebrow" style={{ margin: 0 }}>GenLayer&apos;s call</p>
              {ai.confidence && <span className="ai-badge-conf">{ai.confidence} confidence</span>}
            </div>
            <div className="ai-call-pick">{aiPickTeam}</div>
            {ai.reason && <p className="ai-call-reason">&quot;{ai.reason}&quot;</p>}
            <p className="ai-call-foot">
              The validators&apos; own pre-match forecast, reached by consensus on-chain — separate from the crowd&apos;s pools below.
            </p>
          </div>
        )}

        {mine && (
          <div className="my-prediction-panel">
            <p className="eyebrow">Your pick</p>
            <div className="my-prediction-content">
              <div>
                <div className="my-prediction-pick">{mine.pick.toUpperCase()}</div>
                <div className="my-prediction-stake">{formatGen(BigInt(mine.stake_wei))} GEN staked</div>
              </div>
              <div>
                {won && <div className="pick-status pick-won">✓ Won</div>}
                {lost && <div className="pick-status pick-lost">Lost</div>}
                {!isResolved && !isRefunding && <div className="pick-status pick-pending">Pending</div>}
                {isResolved && won && !mine.claimed && (
                  <button className="primary-button" onClick={onClaim} disabled={busy}>Claim winnings</button>
                )}
                {isRefunding && !mine.refunded && (
                  <button className="secondary-button" onClick={onRefund} disabled={busy}>Claim refund</button>
                )}
                {(mine.claimed || mine.refunded) && (
                  <span className="status-badge is-claimed">{mine.claimed ? "Claimed" : "Refunded"}</span>
                )}
              </div>
            </div>
          </div>
        )}

        {canPredict && (
          <div className="predict-form">
            <p className="eyebrow">Make your pick</p>
            <div className="pick-buttons">
              <button className={`pick-button${pick === "home" ? " is-selected" : ""}`} onClick={() => setPick("home")}>
                <Crest team={m.home} size={40} className="pick-crest" />
                <span className="pick-button-label">{m.home}</span>
                <span className="pick-button-meta">Home</span>
              </button>
              <button className={`pick-button${pick === "draw" ? " is-selected" : ""}`} onClick={() => setPick("draw")}>
                <span className="pick-draw-icon">⚖</span>
                <span className="pick-button-label">Draw</span>
                <span className="pick-button-meta">—</span>
              </button>
              <button className={`pick-button${pick === "away" ? " is-selected" : ""}`} onClick={() => setPick("away")}>
                <Crest team={m.away} size={40} className="pick-crest" />
                <span className="pick-button-label">{m.away}</span>
                <span className="pick-button-meta">Away</span>
              </button>
            </div>

            <div className="stake-row">
              <label className="stake-input-wrap">
                <span className="stake-label">Stake</span>
                <input
                  type="number" min={MIN_STAKE_GEN} step="0.1" placeholder={String(MIN_STAKE_GEN)}
                  inputMode="decimal" value={stake} onChange={(e) => setStake(e.target.value)}
                />
                <span className="stake-suffix">GEN</span>
              </label>
              <div className="payout-display">
                <span className="payout-label">Expected payout</span>
                <span className="payout-value">{expected ? `~${formatGen(expected, 2)} GEN` : "— GEN"}</span>
              </div>
            </div>

            <button
              className="primary-button"
              disabled={submitDisabled}
              onClick={isConnected && !onBradbury ? () => switchChain({ chainId: bradbury.id }) : onSubmit}
            >
              {submitLabel}
            </button>
            <p className="predict-disclaimer">
              Minimum {MIN_STAKE_GEN} GEN. Pool splits among winning predictors when the match resolves.
            </p>
          </div>
        )}

        {/* Real application path for mark_postponed() — permissionless, shown only
            while the market is OPEN on-chain. Opens refunds by asking the contract
            to verify; never flips the UI to a refund state on its own. */}
        {m.contract_address && (canMarkPostponed || isPostponedPending) && chainStatus === "open" && (
          <div className="postpone-panel">
            <p className="eyebrow">Postponement</p>
            <p className="postpone-hint">
              {isPostponedPending
                ? <>A results source lists this fixture as <strong>postponed / called off</strong>. That is an off-chain signal only — <strong>refunds are not open yet</strong>. Confirm it on-chain to open refunds.</>
                : <>This match is past kickoff + 3h and still isn&apos;t settled. If it was postponed or abandoned, anyone can open the refund path — it&apos;s permissionless.</>}
            </p>
            <button
              className="secondary-button"
              disabled={busy || !isConnected || !onBradbury || !canMarkPostponed}
              onClick={isConnected && !onBradbury ? () => switchChain({ chainId: bradbury.id }) : onMarkPostponed}
            >
              {!isConnected ? "Connect wallet to confirm"
                : !onBradbury ? "Switch to Bradbury"
                : !canMarkPostponed ? "Available 3h after kickoff"
                : busy ? "Confirming…"
                : "Confirm postponement on-chain"}
            </button>
            <p className="predict-disclaimer">
              Runs <code>mark_postponed()</code>: the contract re-checks BBC + ESPN under consensus and opens
              refunds <strong>only</strong> if both confirm the game wasn&apos;t played. Any finished result blocks it.
            </p>
          </div>
        )}

        {!canPredict && !mine && !isPostponedPending && !canMarkPostponed && (
          <div className="empty-state" style={{ marginTop: "var(--sp-8)" }}>
            {m.status === "live" ? "Predictions are closed — match is live."
              : isResolved ? "Predictions are closed — match has ended."
              : isRefunding ? "This match is being refunded — claim your stake below."
              : "Predictions are not currently open."}
          </div>
        )}

        <div className="pools-display">
          <p className="eyebrow" style={{ marginBottom: "var(--sp-3)" }}>Current pools</p>
          <div className="pools-bars">
            <PoolBar label="Home" team={m.home} value={pools.home} total={total} />
            <PoolBar label="Draw" value={pools.draw} total={total} />
            <PoolBar label="Away" team={m.away} value={pools.away} total={total} />
          </div>
          <p className="pools-total">Total staked: <strong>{formatGen(pools.total)} GEN</strong></p>
        </div>
      </div>
    </section>
  );
}

function PoolBar({ label, team, value, total }: { label: string; team?: string; value: bigint; total: number }) {
  const pct = total === 0 ? 0 : (Number(value) * 100) / total;
  return (
    <div className="pool-bar">
      <div className="pool-bar-header">
        <span className="pool-bar-label">{label}{team ? ` · ${team}` : ""}</span>
        <span className="pool-bar-value">{formatGen(value)} GEN</span>
      </div>
      <div className="pool-bar-track"><div className="pool-bar-fill" style={{ width: `${pct}%` }} /></div>
      <span className="pool-bar-pct">{total === 0 ? "—" : `${pct.toFixed(1)}%`}</span>
    </div>
  );
}
