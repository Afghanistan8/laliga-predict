/* GEN amount helpers + pari-mutuel payout math (ported from frontend/lib/contract.js). */

const GEN_DECIMALS = 18n;
const ONE_GEN = 10n ** GEN_DECIMALS;

export function toWei(genAmount: number | string): bigint {
  const [whole, frac = ""] = String(genAmount).split(".");
  const fracPadded = (frac + "0".repeat(Number(GEN_DECIMALS))).slice(0, Number(GEN_DECIMALS));
  return BigInt(whole || "0") * ONE_GEN + BigInt(fracPadded || "0");
}

export function fromWei(wei: bigint | string | number): number {
  const v = typeof wei === "bigint" ? wei : BigInt(wei || 0);
  const whole = v / ONE_GEN;
  const frac = v % ONE_GEN;
  return Number(whole) + Number(frac) / Number(ONE_GEN);
}

export function formatGen(wei: bigint | string | number, digits = 2): string {
  return fromWei(wei).toFixed(digits);
}

/**
 * Expected pari-mutuel payout if `stakeWei` is added to the pick's pool:
 *   payout = stake × (total + stake) ÷ (pickPool + stake)
 */
export function computeExpectedPayout(
  stakeWei: bigint,
  pickPoolWei: bigint,
  totalPoolWei: bigint
): bigint {
  const stake = BigInt(stakeWei || 0n);
  const pickPool = BigInt(pickPoolWei || 0n);
  const totalPool = BigInt(totalPoolWei || 0n);
  if (stake === 0n) return 0n;
  const newPick = pickPool + stake;
  const newTotal = totalPool + stake;
  if (newPick === 0n) return stake;
  return (stake * newTotal) / newPick;
}

export function shortAddress(addr?: string): string {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
