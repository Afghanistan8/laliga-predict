// On-chain reads + writes for the per-match PredictionMarket contracts.
// Reads use the plain read client; writes bind to the wallet the user picked.

import { TransactionStatus } from "genlayer-js/types";
import { getReadClient, getWriteClient, ensureWalletAuthorized, ensureWalletChain, type Eip1193Provider } from "@/config/genlayer";

export type Pools = { home: bigint; draw: bigint; away: bigint; total: bigint };

export type OnchainMatchInfo = {
  status: string;        // 'open' | 'resolved' | 'refunding' (authoritative)
  result: string;
  final_score: string;
  kickoff_ts: number;
};

// Authoritative on-chain status — the ONLY source that may open refunds. The
// Supabase mirror can carry an off-chain 'postponed_pending' hint, but only this
// read (or a mirror value copied FROM it) decides claim/refund UI. (Pavel review)
export async function readMatchInfo(contractAddress: string): Promise<OnchainMatchInfo | null> {
  try {
    const c = getReadClient();
    const r = (await c.readContract({
      address: contractAddress as `0x${string}`,
      functionName: "get_match_info",
      args: [],
    })) as { status?: unknown; result?: unknown; final_score?: unknown; kickoff_ts?: unknown };
    return {
      status: String(r?.status ?? ""),
      result: String(r?.result ?? ""),
      final_score: String(r?.final_score ?? ""),
      kickoff_ts: Number(r?.kickoff_ts ?? 0),
    };
  } catch (e) {
    console.warn("readMatchInfo error:", (e as Error).message);
    return null;
  }
}

export async function readPools(contractAddress: string): Promise<Pools> {
  try {
    const c = getReadClient();
    const result = (await c.readContract({
      address: contractAddress as `0x${string}`,
      functionName: "get_pools",
      args: [],
    })) as { home?: unknown; draw?: unknown; away?: unknown; total?: unknown };
    return {
      home: BigInt((result?.home as string) ?? 0),
      draw: BigInt((result?.draw as string) ?? 0),
      away: BigInt((result?.away as string) ?? 0),
      total: BigInt((result?.total as string) ?? 0),
    };
  } catch (e) {
    console.warn("readPools error:", (e as Error).message);
    return { home: 0n, draw: 0n, away: 0n, total: 0n };
  }
}

async function write(
  address: string,
  provider: Eip1193Provider | undefined,
  contractAddress: string,
  functionName: string,
  args: string[],
  value: bigint
) {
  await ensureWalletAuthorized(address, provider);
  await ensureWalletChain(provider);
  const c = getWriteClient(address, provider);
  const txHash = await c.writeContract({
    address: contractAddress as `0x${string}`,
    functionName,
    args,
    value,
  });
  await c.waitForTransactionReceipt({ hash: txHash, status: TransactionStatus.ACCEPTED });
  return txHash as string;
}

export function submitPrediction(
  address: string,
  provider: Eip1193Provider | undefined,
  contractAddress: string,
  pick: "home" | "draw" | "away",
  stakeWei: bigint
) {
  return write(address, provider, contractAddress, "submit_prediction", [pick], stakeWei);
}

export function claim(
  address: string,
  provider: Eip1193Provider | undefined,
  contractAddress: string
) {
  return write(address, provider, contractAddress, "claim", [], 0n);
}

export function refund(
  address: string,
  provider: Eip1193Provider | undefined,
  contractAddress: string
) {
  return write(address, provider, contractAddress, "refund", [], 0n);
}

// Real application path for mark_postponed() (Pavel Kolosov review). Permissionless;
// `write()` waits for finality (ACCEPTED). It does NOT open refunds itself — the
// caller re-reads readMatchInfo() afterwards and only shows refunds if the
// contract's own status is now 'refunding'.
export function markPostponed(
  address: string,
  provider: Eip1193Provider | undefined,
  contractAddress: string
) {
  return write(address, provider, contractAddress, "mark_postponed", [], 0n);
}
