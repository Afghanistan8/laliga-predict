// check-ai.js
// Read-only: poll get_prediction() for the test fixture. Safe to run repeatedly
// — it never writes, so it won't fire another predict().
//
// Run: node check-ai.js

import { createClient, createAccount } from 'genlayer-js';
import { testnetBradbury } from 'genlayer-js/chains';
import { readFileSync } from 'fs';
import 'dotenv/config';

const address =
  process.env.AI_PREDICTOR_ADDRESS ||
  readFileSync('./ai_predictor_address.txt', 'utf-8').trim();

// must match the MATCH_ID used in test-ai.js
const MATCH_ID = 'laliga2027_md1_01';

const account = createAccount(process.env.PRIVATE_KEY);
const client = createClient({ chain: testnetBradbury, account });

const pred = await client.readContract({
  address,
  functionName: 'get_prediction',
  args: [MATCH_ID],
});

console.log('get_prediction:', pred);
if (pred?.has_prediction) {
  console.log(`\n\u2713 consensus OK  ->  pick=${pred.pick}, confidence=${pred.confidence}`);
  console.log(`  reason: ${pred.reason}`);
} else {
  console.log('\n\u00b7 still not stored — wait another minute and run this again.');
}
