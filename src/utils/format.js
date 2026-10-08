const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

function suffixFor(tier) {
  if (tier < SUFFIXES.length) return SUFFIXES[tier];
  const i = tier - SUFFIXES.length; // aa, ab, ac ...
  return String.fromCharCode(97 + (Math.floor(i / 26) % 26)) + String.fromCharCode(97 + (i % 26));
}

// 1.25K, 12.5K, 125K, 1.25M ... `mode` rounds down for balances, up for prices,
// so a price never looks affordable when it is not.
export function formatCompact(n, mode = 'floor') {
  if (!Number.isFinite(n)) return '∞';
  if (n < 0) return '-' + formatCompact(-n, mode);
  const round = mode === 'ceil' ? Math.ceil : Math.floor;
  if (n < 1000) return String(round(n));
  let tier = Math.floor(Math.log10(n) / 3);
  let scaled = n / Math.pow(1000, tier);
  const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  const f = Math.pow(10, digits);
  scaled = round(scaled * f) / f;
  if (scaled >= 1000) {
    tier += 1;
    scaled /= 1000;
  }
  let str = scaled.toFixed(digits);
  if (str.includes('.')) str = str.replace(/0+$/, '').replace(/\.$/, '');
  return str + suffixFor(tier);
}

export function formatCoins(n) {
  n = Math.floor(n);
  if (n < 10000) return n.toLocaleString('en-US');
  return formatCompact(n);
}

export const formatPrice = (n) => formatCompact(n, 'ceil');

export function formatRate(r) {
  if (r < 100) return r.toFixed(1);
  return formatCompact(r);
}

// Two significant digits, for goal targets and rewards.
export function niceRound(n) {
  if (n < 10) return Math.max(1, Math.round(n));
  const p = Math.pow(10, Math.floor(Math.log10(n)) - 1);
  return Math.round(n / p) * p;
}
