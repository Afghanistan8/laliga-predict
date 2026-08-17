/* Shared config for La Liga '27 Predict.
 *
 * The Supabase publishable key is public by design (RLS-restricted, rate
 * limited) — the same key the vanilla frontend shipped with, safe to embed.
 */

export const SUPABASE_URL = "https://sztlztcwuujabrfdrrvv.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_GKhqBvc2roIHp8nPbi8TAQ_6vdBdR4Q";

// GenLayer Bradbury testnet.
export const BRADBURY = {
  chainIdHex: "0x107d",
  chainIdDecimal: 4221,
  chainName: "GenLayer Bradbury",
  rpcUrl: "https://rpc-bradbury.genlayer.com",
  explorerUrl: "https://explorer-bradbury.genlayer.com",
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
};

export const MIN_STAKE_GEN = 2;

// The AI Call contract (one instance, keyed by match_id). Public read target.
export const AI_PREDICTOR_ADDRESS =
  "0x7b157df9e40dE5B3EC487A7210e9cFf234199ecD" as `0x${string}`;
