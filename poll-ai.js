// poll-ai.js — poll get_prediction until it persists (or timeout), then exit.
// Backs the "watch finality" step: exits 0 with the pick once FINALIZED state
// shows up, exits 2 on timeout. Run in background: node poll-ai.js
import { createClient, createAccount } from 'genlayer-js';
import { testnetBradbury } from 'genlayer-js/chains';
import { readFileSync } from 'fs';
import 'dotenv/config';

const address =
  process.env.AI_PREDICTOR_ADDRESS ||
  readFileSync('./ai_predictor_address.txt', 'utf-8').trim();
const MATCH_ID = 'laliga2027_md1_01';

const account = createAccount(process.env.PRIVATE_KEY);
const client = createClient({ chain: testnetBradbury, account });

const MAX_MIN = 180;              // give up after 3h
const INTERVAL_MS = 90_000;       // check every 90s
const deadline = Date.now ? null : null; // Date.now unavailable in some envs; use counter
let elapsedMin = 0;

while (elapsedMin < MAX_MIN) {
  let pred;
  try {
    pred = await client.readContract({
      address,
      functionName: 'get_prediction',
      args: [MATCH_ID],
    });
  } catch (e) {
    console.log(`[t+${elapsedMin}m] read error: ${e.message}`);
  }
  if (pred?.has_prediction) {
    console.log(`\n✓ FINALIZED & stored after ~${elapsedMin}m`);
    console.log(`  pick=${pred.pick}  confidence=${pred.confidence}`);
    console.log(`  reason: ${pred.reason}`);
    process.exit(0);
  }
  console.log(`[t+${elapsedMin}m] not stored yet…`);
  await new Promise((r) => setTimeout(r, INTERVAL_MS));
  elapsedMin += 1.5;
}
console.log(`\n· still not stored after ${MAX_MIN}m — check explorer for appeal/timeout.`);
process.exit(2);
