// test-ai.js
// One-shot end-to-end check on Bradbury: call predict() for a single fixture,
// then read get_prediction() back. Use this to confirm prompt_non_comparative
// actually reaches consensus BEFORE wiring the cron.
//
// Run: node test-ai.js

import { createClient, createAccount } from 'genlayer-js';
import { testnetBradbury } from 'genlayer-js/chains';
import { TransactionStatus } from 'genlayer-js/types';
import { readFileSync, writeFileSync } from 'fs';
import 'dotenv/config';

const { PRIVATE_KEY } = process.env;
if (!PRIVATE_KEY) {
  console.error('Missing PRIVATE_KEY. Add it to .env');
  process.exit(1);
}

const address =
  process.env.AI_PREDICTOR_ADDRESS ||
  readFileSync('./ai_predictor_address.txt', 'utf-8').trim();

// --- edit these to a real upcoming fixture ---
const MATCH_ID = 'laliga2027_md1_01';
const HOME = 'Alaves';
const AWAY = 'Getafe';
const DATE = '2026-08-15';
// ---------------------------------------------

const account = createAccount(PRIVATE_KEY);
const client = createClient({ chain: testnetBradbury, account });
await client.initializeConsensusSmartContract();

console.log(`predict() ${HOME} vs ${AWAY}  ->  ${address}`);
const txHash = await client.writeContract({
  address,
  functionName: 'predict',
  args: [MATCH_ID, HOME, AWAY, DATE],
  value: 0n,
});
console.log(`tx: ${txHash}`);
// Persist the hash so diagnose-ai.js can inspect this exact tx later.
writeFileSync('./last-predict-tx.txt', txHash);

await client.waitForTransactionReceipt({
  hash: txHash,
  status: TransactionStatus.ACCEPTED,
  retries: 60,
  interval: 5000,
});

// Small settle delay, then read back
await new Promise((r) => setTimeout(r, 3000));

const pred = await client.readContract({
  address,
  functionName: 'get_prediction',
  args: [MATCH_ID],
});

console.log('\nget_prediction:', pred);
if (pred?.has_prediction) {
  console.log(`\n\u2713 consensus OK  ->  pick=${pred.pick}, confidence=${pred.confidence}`);
  console.log(`  reason: ${pred.reason}`);
} else {
  console.log('\n\u2717 no prediction stored yet — if the tx is still finalizing, wait and re-read;');
  console.log('  On Bradbury this tx often takes minutes-to-hours to FINALIZE, and');
  console.log('  reads only reflect FINALIZED state. Re-poll with: node check-ai.js');
  console.log(`  If it stays empty after finality: node diagnose-ai.js ${txHash}`);
}
