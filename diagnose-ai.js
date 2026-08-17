// diagnose-ai.js
// Dumps the full finalized receipt for the test predict() tx to see whether
// it errored on-chain (cause B) or timed out/undetermined (cause A).
//
// Run: node diagnose-ai.js <predict_tx_hash>
//   e.g. node diagnose-ai.js 0xabc...   (the hash test-ai.js printed for predict())
// Fetches receipt at FINALIZED status; writes receipt.json and prints key
// outcome fields so we can tell cause A (undetermined/timeout) from B (on-chain
// error). NOTE: pass the PREDICT tx hash, not the deploy hash.

import { createClient, createAccount } from 'genlayer-js';
import { testnetBradbury } from 'genlayer-js/chains';
import { TransactionStatus } from 'genlayer-js/types';
import { writeFileSync } from 'fs';
import 'dotenv/config';

const TX_HASH = process.argv[2];
if (!TX_HASH || !TX_HASH.startsWith('0x')) {
  console.error('Usage: node diagnose-ai.js <predict_tx_hash>');
  console.error('(the 0x… hash test-ai.js printed when it fired predict())');
  process.exit(1);
}

const account = createAccount(process.env.PRIVATE_KEY);
const client = createClient({ chain: testnetBradbury, account });

console.log(`Fetching finalized receipt for tx: ${TX_HASH}`);

const receipt = await client.waitForTransactionReceipt({
  hash: TX_HASH,
  status: TransactionStatus.FINALIZED,
  retries: 1,   // already finalized, return immediately
  interval: 1000,
});

// Write full receipt to disk for manual inspection
const json = JSON.stringify(
  receipt,
  (k, v) => (typeof v === 'bigint' ? v.toString() : v),
  2
);
writeFileSync('./receipt.json', json);
console.log('Wrote full receipt to receipt.json\n');

// Print key diagnostic fields
console.log('=== KEY OUTCOME FIELDS ===');
console.log('status:', receipt.status);
console.log('consensus_data.final_result:', receipt.consensus_data?.final_result);
console.log('consensus_data.leader.result:', receipt.consensus_data?.leader?.result);

// Check for execution errors
const err =
  receipt.error ||
  receipt.execution_result?.error ||
  receipt.consensus_data?.leader?.error ||
  receipt.consensus_data?.leader?.execution_result?.error;

if (err) {
  console.log('\n*** EXECUTION ERROR DETECTED (cause B) ***');
  console.log(err);
} else if (
  receipt.status === 'UNDETERMINED' ||
  receipt.consensus_data?.final_result === 'undetermined'
) {
  console.log('\n*** UNDETERMINED / VALIDATORS_TIMEOUT (cause A) ***');
  console.log('Network could not reach consensus; state rolled back.');
} else {
  console.log('\nNo obvious error. Check receipt.json for appeal/timeout traces.');
}
