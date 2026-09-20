export function pricePrecision(symbol: string): { precision: number; minMove: number } {
  const s = symbol.toUpperCase();
  if (s.includes("JPY")) return { precision: 3, minMove: 0.001 };
  if (/(EUR|GBP|AUD|NZD|USD|CAD|CHF)\/?/.test(s) && s.includes("/")) return { precision: 5, minMove: 0.00001 };
  if (s.includes("/") && (s.includes("BTC") || s.includes("ETH"))) return { precision: 2, minMove: 0.01 };
  if (s.includes("XAU") || s.includes("GOLD")) return { precision: 2, minMove: 0.01 };
  return { precision: 2, minMove: 0.01 };
}

export function fmtPrice(p: number, symbol: string): string {
  const { precision } = pricePrecision(symbol);
  return p.toLocaleString("en-US", { minimumFractionDigits: precision, maximumFractionDigits: precision });
}

export function fmtNumber(n: number, digits = 2): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtEpoch(t: number, withTime = true): string {
  const d = new Date(t * 1000);
  const date = d.toISOString().slice(0, 10);
  if (!withTime) return date;
  return `${date} ${d.toISOString().slice(11, 16)} UTC`;
}

export function fmtMoney(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
