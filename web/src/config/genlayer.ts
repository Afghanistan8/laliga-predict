// GenLayer client setup for the La Liga '27 market + AI-call contracts on Bradbury.
//
// Reads use a plain client (no wallet). Writes run in the browser via the wallet
// the user picked in RainbowKit — genlayer-js signs through THAT wallet's
// provider (from connector.getProvider()), with RPC proxied via /api/rpc.

import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { BRADBURY } from "@/lib/config";

export type Eip1193Provider = {
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

const TARGET = BRADBURY.chainIdHex.toLowerCase(); // 0x107d (4221)

function toHexChainId(id: unknown): string | null {
  if (id == null) return null;
  const s = String(id);
  if (s.toLowerCase().startsWith("0x")) return s.toLowerCase();
  const n = Number(s);
  return Number.isFinite(n) ? "0x" + n.toString(16) : s.toLowerCase();
}

function proxyEndpoint(): string {
  if (typeof window !== "undefined") return `${window.location.origin}/api/rpc`;
  return "/api/rpc";
}

/** Read-only client — no wallet needed (pools, match info, AI predictions). */
export function getReadClient() {
  return createClient({ chain: testnetBradbury, endpoint: proxyEndpoint() } as never);
}

/** Browser write client — the chosen wallet signs; RPC via our proxy. */
export function getWriteClient(address: string, provider?: Eip1193Provider) {
  return createClient({
    chain: testnetBradbury,
    account: address as `0x${string}`,
    endpoint: proxyEndpoint(),
    ...(provider ? { provider } : {}),
  } as never);
}

/**
 * genlayer-js signs via the wallet's provider. With several extensions
 * installed, confirm the chosen provider actually holds the address before
 * signing (per-origin authorization; error 4100 otherwise). This is the guard
 * that makes multi-wallet setups sign with the RIGHT account.
 */
export async function ensureWalletAuthorized(
  address: string,
  provider?: Eip1193Provider
): Promise<void> {
  const eth = provider ?? (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
  if (!eth) throw new Error("No wallet found in this browser.");
  const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
  const ok = accounts?.some((a) => a.toLowerCase() === address.toLowerCase());
  if (!ok) {
    throw new Error(
      `The selected wallet is not connected as ${address.slice(0, 6)}…${address.slice(-4)}. ` +
      "Switch to that account in your wallet and try again."
    );
  }
}

/**
 * Final chain gate before signing: read the wallet's LIVE chain (not wagmi's
 * cached value) and, if it isn't Bradbury, switch it (adding the network on
 * 4902 / -32603), then verify. Prevents the genlayer-js "Wallet is on chain X
 * but client is configured for chain 4221" error at signing time.
 */
export async function ensureWalletChain(provider?: Eip1193Provider): Promise<void> {
  const eth = provider ?? (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
  if (!eth) throw new Error("No wallet found in this browser.");

  const live = toHexChainId(await eth.request({ method: "eth_chainId" }));
  if (live === TARGET) return;

  const addParams = {
    chainId: BRADBURY.chainIdHex,
    chainName: BRADBURY.chainName,
    rpcUrls: [BRADBURY.rpcUrl],
    nativeCurrency: BRADBURY.nativeCurrency,
    blockExplorerUrls: [BRADBURY.explorerUrl],
  };

  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BRADBURY.chainIdHex }] });
  } catch (err) {
    const e = err as { code?: number; message?: string };
    const missing = e?.code === 4902 || e?.code === -32603 || /Unrecognized chain|not.*added/i.test(e?.message ?? "");
    if (missing) {
      await eth.request({ method: "wallet_addEthereumChain", params: [addParams] });
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BRADBURY.chainIdHex }] }).catch(() => {});
    } else {
      throw err;
    }
  }

  const verified = toHexChainId(await eth.request({ method: "eth_chainId" }));
  if (verified !== TARGET) {
    throw new Error(
      `Wallet is still on chain ${verified ? parseInt(verified, 16) : "unknown"}. ` +
      `Switch to ${BRADBURY.chainName} (chain ${BRADBURY.chainIdDecimal}) and try again.`
    );
  }
}
