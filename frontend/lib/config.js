/* lib/config.js — Bradbury testnet + La Liga '27 Supabase config */

// La Liga '27 Predict uses its OWN dedicated Supabase project.
// Project ref: YOUR_PROJECT_REF
export const SUPABASE_URL = 'https://sztlztcwuujabrfdrrvv.supabase.co';

// ⚠️ PASTE THE LaLiga PROJECT'S *PUBLISHABLE* KEY HERE (starts with sb_publishable_).
// Supabase dashboard → project YOUR_PROJECT_REF → Settings → API keys →
// "Publishable" (the renamed anon key). This is safe to ship in the browser;
// RLS restricts it to public reads. The secret key stays server-side only.
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_GKhqBvc2roIHp8nPbi8TAQ_6vdBdR4Q';

// GenLayer Bradbury testnet — DO NOT CHANGE
export const STUDIONET = {
  chainId: '0x107d',
  chainIdDecimal: 4221,
  chainName: 'GenLayer Bradbury',
  rpcUrls: ['https://rpc-bradbury.genlayer.com'],
  blockExplorerUrls: ['https://explorer-bradbury.genlayer.com'],
  nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
};

export const MIN_STAKE_GEN = 2;

// Secure mirror API (Vercel cron project). Writes to Supabase are no longer
// done from the browser — they go through these endpoints, which verify the
// claim against the contract (or a wallet signature) before writing. This is
// what stops anyone forging leaderboard / prediction rows with the public key.
export const MIRROR_API_BASE = 'https://laliga27-predict-cron.vercel.app';
