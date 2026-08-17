// Wagmi + RainbowKit configuration for La Liga '27 Predict.
//
// Two deliberate choices, mirroring the GenLayer DEX Aggregator:
//
// 1. NO WalletConnect. RainbowKit's getDefaultConfig always wires the
//    WalletConnect connector, which needs a real projectId and hits the WC
//    Explorer API (surfacing as "Failed to fetch"). This app uses browser
//    extension wallets, so we build the connector list ourselves with injected
//    wallets only. Each extension is a distinct choice in the RainbowKit modal,
//    and — critically — signing follows the wallet the user actually picks
//    (via connector.getProvider()), which fixes the "wrong wallet" bug.
//
// 2. The chain RPC points at our own same-origin /api/rpc proxy so wagmi's
//    background polling never trips over CORS.

import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  injectedWallet,
  metaMaskWallet,
  okxWallet,
  phantomWallet,
  rabbyWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { defineChain } from "viem";
import { BRADBURY } from "@/lib/config";

const SSR_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

const RPC_URL =
  typeof window !== "undefined"
    ? `${window.location.origin}/api/rpc`
    : `${SSR_ORIGIN}/api/rpc`;

export const bradbury = defineChain({
  id: BRADBURY.chainIdDecimal, // 4221
  name: BRADBURY.chainName,
  nativeCurrency: BRADBURY.nativeCurrency,
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: {
    default: { name: "GenLayer Explorer", url: BRADBURY.explorerUrl },
  },
  testnet: true,
});

// Injected/extension wallets only — no WalletConnect connector is created, so
// no WalletConnect network requests are ever made. Extensions are detected via
// EIP-6963 and each exposes its own provider.
const connectors = connectorsForWallets(
  [
    {
      groupName: "Popular",
      wallets: [metaMaskWallet, okxWallet, phantomWallet, rabbyWallet, injectedWallet],
    },
  ],
  { appName: "La Liga '27 Predict", projectId: "unused" }
);

export const wagmiConfig = createConfig({
  connectors,
  chains: [bradbury],
  transports: { [bradbury.id]: http(RPC_URL) },
  ssr: true,
  pollingInterval: 60_000,
});
