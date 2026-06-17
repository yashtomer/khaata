export interface Category {
  key: string;
  name: string;
  short: string;
  /** Examples of what falls under this category, shown in the UI. */
  desc: string;
  color: string;
  bg: string;
  paths: string[];
}

export interface Transaction {
  id: number;
  merchant: string;
  cat: string;
  amount: number;
  day: number;
  /** 0-based calendar month (0 = January). */
  month: number;
  year: number;
  time: string;
  source: 'sms' | 'email';
  /** The original SMS body, when parsed from a real message. */
  raw?: string;
  /** The SMS sender address/short-code, e.g. "VM-HDFCBK". */
  sender?: string;
  /** Gmail message id, for loading the full original email on demand. */
  gmailId?: string;
  /** LLM-extracted details (email), cached so the detail view doesn't re-call. */
  aiType?: string | null;
  aiVendor?: string | null;
  /** How long the LLM extraction took (ms), shown in the detail view. */
  aiMs?: number;
  /** True once the LLM has processed this email (amount/category refined). */
  aiDone?: boolean;
}

export interface BudgetItem {
  cat: string;
  limit: number;
}

export const CATEGORIES: Category[] = [
  { key: 'housing', name: 'Housing', short: 'Housing', desc: 'Rent/EMI, maintenance, property tax', color: '#0D9488', bg: '#CFF6F0', paths: ['M3 9.5 12 3l9 6.5', 'M5 9.5V21h14V9.5', 'M9 21v-6h6v6'] },
  { key: 'utilities', name: 'Utilities', short: 'Utilities', desc: 'Electricity, water, gas, internet, mobile', color: '#6366F1', bg: '#E2E5FF', paths: ['m13 2-9 12h7l-1 8 9-12h-7z'] },
  { key: 'groceries', name: 'Groceries & Food', short: 'Groceries', desc: 'Daily provisions, vegetables, fruits', color: '#16A34A', bg: '#DCFAE6', paths: ['M8 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z', 'M19 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z', 'M2 3h2l2.6 12.4a2 2 0 0 0 2 1.6h8.7a2 2 0 0 0 2-1.6L21 6H5.1'] },
  { key: 'dining', name: 'Dining Out', short: 'Dining', desc: 'Restaurants, food delivery, cafes', color: '#F97316', bg: '#FFEAD9', paths: ['M3 2v7c0 1.1.9 2 2 2a2 2 0 0 0 2-2V2', 'M7 2v20', 'M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7'] },
  { key: 'transport', name: 'Transport', short: 'Transport', desc: 'Fuel, cab/auto, transit, vehicle', color: '#3B82F6', bg: '#DCE8FF', paths: ['M3 22h13', 'M5 22V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v17', 'M14 9h2a2 2 0 0 1 2 2v6a2 2 0 0 0 4 0V9.5L18 5'] },
  { key: 'healthcare', name: 'Healthcare', short: 'Health', desc: 'Medicines, doctor, hospital', color: '#EF4444', bg: '#FDE0E0', paths: ['M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z'] },
  { key: 'education', name: 'Education', short: 'Education', desc: 'School/college fees, courses, books', color: '#7C5CFC', bg: '#EAE4FF', paths: ['M22 10 12 5 2 10l10 5 10-5Z', 'M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5'] },
  { key: 'lifestyle', name: 'Personal & Lifestyle', short: 'Lifestyle', desc: 'Clothing, grooming, subscriptions', color: '#EC4899', bg: '#FCE3F1', paths: ['M20.4 3.5 16 2a4 4 0 0 1-8 0L3.6 3.5a2 2 0 0 0-1.3 2.2l.6 3.5a1 1 0 0 0 1 .8H6v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V10h2.1a1 1 0 0 0 1-.8l.6-3.5a2 2 0 0 0-1.3-2.2z'] },
  { key: 'entertainment', name: 'Entertainment & Leisure', short: 'Leisure', desc: 'OTT, outings, travel/trips', color: '#F59E0B', bg: '#FEEFC7', paths: ['M3 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z', 'M13 5v14'] },
  { key: 'investments', name: 'Savings & Investments', short: 'Invest', desc: 'SIP, FD, equity, RD, dividends', color: '#0891B2', bg: '#CFFAFE', paths: ['M3 3v18h18', 'm19 9-5 5-4-4-3 3'] },
  { key: 'insurance', name: 'Insurance', short: 'Insurance', desc: 'Life, health, vehicle premiums', color: '#0EA5E9', bg: '#E0F2FE', paths: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', 'm9 12 2 2 4-4'] },
  { key: 'domestic', name: 'Domestic Help & Services', short: 'Domestic', desc: 'Maid, cook, society staff', color: '#8B5CF6', bg: '#EDE9FE', paths: ['M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2', 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8'] },
  { key: 'transfers', name: 'Transfers', short: 'Transfer', desc: 'Money sent to people', color: '#64748B', bg: '#E2E8F0', paths: ['m16 3 4 4-4 4', 'M20 7H4', 'm8 21-4-4 4-4', 'M4 17h16'] },
  { key: 'other', name: 'Other', short: 'Other', desc: 'Uncategorised', color: '#94A3B8', bg: '#F1F5F9', paths: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'] },
];

export const BUDGETS: BudgetItem[] = [
  { cat: 'housing', limit: 15000 },
  { cat: 'education', limit: 15000 },
  { cat: 'investments', limit: 10000 },
  { cat: 'groceries', limit: 6000 },
  { cat: 'lifestyle', limit: 5000 },
  { cat: 'dining', limit: 5000 },
  { cat: 'transport', limit: 4000 },
  { cat: 'utilities', limit: 3000 },
  { cat: 'healthcare', limit: 3000 },
  { cat: 'domestic', limit: 3000 },
  { cat: 'insurance', limit: 2500 },
  { cat: 'entertainment', limit: 2500 },
];

export const TREND = [
  { m: 'Jan', total: 41200 },
  { m: 'Feb', total: 38900 },
  { m: 'Mar', total: 52300 },
  { m: 'Apr', total: 44100 },
  { m: 'May', total: 46750 },
  { m: 'Jun', total: 48890 },
];

const INITIAL_TXNS_RAW: Omit<Transaction, 'month' | 'year'>[] = [
  { id: 1, merchant: 'Zomato', cat: 'dining', amount: 480, day: 14, time: '8:12 PM', source: 'sms' },
  { id: 2, merchant: 'Swiggy Instamart', cat: 'groceries', amount: 1240, day: 14, time: '6:40 PM', source: 'email' },
  { id: 3, merchant: 'Myntra', cat: 'lifestyle', amount: 2399, day: 13, time: '3:18 PM', source: 'email' },
  { id: 4, merchant: 'Uber', cat: 'transport', amount: 286, day: 13, time: '9:05 AM', source: 'sms' },
  { id: 5, merchant: 'BookMyShow', cat: 'entertainment', amount: 900, day: 12, time: '7:30 PM', source: 'email' },
  { id: 6, merchant: 'Apollo Pharmacy', cat: 'healthcare', amount: 640, day: 12, time: '11:20 AM', source: 'sms' },
  { id: 7, merchant: 'DMart', cat: 'groceries', amount: 3180, day: 11, time: '5:50 PM', source: 'sms' },
  { id: 8, merchant: 'Starbucks', cat: 'dining', amount: 545, day: 11, time: '10:15 AM', source: 'sms' },
  { id: 9, merchant: 'Indian Oil', cat: 'transport', amount: 2000, day: 10, time: '8:30 AM', source: 'sms' },
  { id: 10, merchant: 'Netflix', cat: 'entertainment', amount: 649, day: 10, time: '12:01 AM', source: 'email' },
  { id: 11, merchant: 'Amazon', cat: 'lifestyle', amount: 1799, day: 9, time: '4:22 PM', source: 'email' },
  { id: 12, merchant: "Domino's Pizza", cat: 'dining', amount: 760, day: 9, time: '9:10 PM', source: 'sms' },
  { id: 13, merchant: 'VIT University', cat: 'education', amount: 15000, day: 5, time: '10:00 AM', source: 'email' },
  { id: 14, merchant: 'Rent · Mr. Sharma', cat: 'housing', amount: 12000, day: 1, time: '11:30 AM', source: 'sms' },
  { id: 15, merchant: 'BESCOM Electricity', cat: 'utilities', amount: 1450, day: 3, time: '2:15 PM', source: 'email' },
  { id: 16, merchant: 'Airtel Postpaid', cat: 'utilities', amount: 799, day: 4, time: '9:00 AM', source: 'sms' },
  { id: 17, merchant: 'Cult.fit', cat: 'healthcare', amount: 1499, day: 6, time: '7:00 AM', source: 'email' },
  { id: 18, merchant: 'Cafe Coffee Day', cat: 'dining', amount: 320, day: 8, time: '4:45 PM', source: 'sms' },
  { id: 19, merchant: 'Ola', cat: 'transport', amount: 175, day: 7, time: '8:50 PM', source: 'sms' },
  { id: 20, merchant: 'Spotify', cat: 'entertainment', amount: 119, day: 7, time: '12:30 PM', source: 'email' },
  { id: 21, merchant: 'Decathlon', cat: 'lifestyle', amount: 2150, day: 6, time: '1:10 PM', source: 'sms' },
  { id: 22, merchant: 'Namma Metro', cat: 'transport', amount: 500, day: 5, time: '8:15 AM', source: 'sms' },
];

// Demo data is all the current month (June 2026) so the offline experience and
// the "this month" home view line up.
export const INITIAL_TXNS: Transaction[] = INITIAL_TXNS_RAW.map(t => ({ ...t, month: 5, year: 2026 }));

export const USER_NAME = 'Aarav';
export const TODAY = 14;

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "June 2026" */
export function monthLabel(month: number, year: number): string {
  return `${MONTHS_FULL[month] ?? '?'} ${year}`;
}

export function inr(n: number): string {
  const abs = Math.round(Math.abs(n));
  const s = String(abs);
  if (s.length <= 3) return '₹' + s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return '₹' + rest + ',' + last3;
}

/**
 * Date-aware group label for a transaction. "Today"/"Yesterday" for the current
 * month's recent days, "9 Jun" within the current year, "9 Jun 2025" otherwise.
 */
/** Compact Indian-readable amount: ₹10.4L, ₹53.5k, ₹1.2Cr, ₹480. */
export function inrCompact(n: number): string {
  const a = Math.round(Math.abs(n));
  const trim = (x: number) => (Math.round(x * 10) / 10).toString().replace(/\.0$/, '');
  if (a >= 1e7) return '₹' + trim(a / 1e7) + 'Cr';
  if (a >= 1e5) return '₹' + trim(a / 1e5) + 'L';
  if (a >= 1e3) return '₹' + trim(a / 1e3) + 'k';
  return '₹' + a;
}

export function dayLabel(day: number, month?: number, year?: number, now: Date = new Date()): string {
  // Back-compat: called with just a day (demo data, current month/year assumed).
  const m = month ?? now.getMonth();
  const y = year ?? now.getFullYear();
  if (y === now.getFullYear() && m === now.getMonth()) {
    if (day === now.getDate()) return 'Today';
    if (day === now.getDate() - 1) return 'Yesterday';
  }
  const base = `${day} ${MONTHS[m]}`;
  return y === now.getFullYear() ? base : `${base} ${y}`;
}

export function getCategoryMap(): Record<string, Category> {
  const map: Record<string, Category> = {};
  CATEGORIES.forEach(c => (map[c.key] = c));
  return map;
}

const OTHER_CAT: Category = CATEGORIES[CATEGORIES.length - 1];

/** A category by key, falling back to "Other" for any unknown/legacy key so the
 * UI never crashes on a stale category. */
export function categoryOf(key: string): Category {
  return getCategoryMap()[key] || OTHER_CAT;
}
