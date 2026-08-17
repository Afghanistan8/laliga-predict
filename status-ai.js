// status-ai.js — read the current lifecycle status of a tx without blocking.
// Run: node status-ai.js [tx_hash]   (defaults to last-predict-tx.txt)
import { createClient, createAccount } from 'genlayer-js';
import { testnetBradbury } from 'genlayer-js/chains';
import { readFileSync } from 'fs';
import 'dotenv/config';

const hash =
  process.argv[2] || readFileSync('./last-predict-tx.txt', 'utf-8').trim();

const account = createAccount(process.env.PRIVATE_KEY);
const client = createClient({ chain: testnetBradbury, account });

const tx = await client.getTransaction({ hash });
const pick = (o, ...keys) =>
  Object.fromEntries(keys.filter((k) => o?.[k] !== undefined).map((k) => [k, o[k]]));

console.log('hash:', hash);
console.log('status:', tx?.status ?? tx?.data?.status ?? '(unknown)');
console.log(
  'summary:',
  JSON.stringify(
    pick(tx, 'status', 'statusName', 'leader_only', 'created_timestamp'),
    (k, v) => (typeof v === 'bigint' ? v.toString() : v),
    2
  )
);
