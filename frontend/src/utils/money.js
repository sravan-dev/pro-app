const SYMBOLS = { INR: '₹', USD: '$', EUR: '€', GBP: '£', JPY: '¥' };

// "₹1,23,456" for INR (Indian digit grouping); a currency without a symbol
// here reads "AED 1,234".
export function formatMoney(amount, currency, maximumFractionDigits = 2) {
  const n = (Number(amount) || 0).toLocaleString(currency === 'INR' ? 'en-IN' : undefined, { maximumFractionDigits });
  const symbol = SYMBOLS[currency];
  return symbol ? `${symbol}${n}` : `${currency} ${n}`;
}
