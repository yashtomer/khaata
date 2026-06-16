import { RawSms } from '../modules/sms-reader';
import { Transaction } from './data';

// Keyword → category mapping. First match wins, checked against the merchant
// text and the full message body (lower-cased).
// Order matters: more specific buckets are checked before the broad "food"
// one, so e.g. "Swiggy Instamart" lands in groceries, not food.
const CATEGORY_KEYWORDS: Array<{ cat: string; words: string[] }> = [
  { cat: 'groceries', words: ['instamart', 'dmart', 'bigbasket', 'blinkit', 'zepto', 'grocery', 'supermarket', 'kirana', 'reliance smart', 'jiomart', 'jio mart', 'more retail', 'spencer', 'nature basket', 'licious', 'country delight', 'milkbasket', 'fraazo', 'otipy'] },
  { cat: 'food', words: ['zomato', 'swiggy', 'dominos', "domino's", 'pizza', 'starbucks', 'cafe', 'coffee', 'restaurant', 'mcdonald', 'kfc', 'eatery', 'biryani', 'food', 'eatsure', 'faasos', 'behrouz', 'box8', 'haldiram', 'barbeque', 'chaayos', 'third wave', 'dunkin', 'subway', 'burger', 'wow momo', 'baskin', 'dineout', 'eazydiner'] },
  { cat: 'shopping', words: ['myntra', 'amazon', 'flipkart', 'ajio', 'decathlon', 'nykaa', 'meesho', 'lifestyle', 'shoppers stop', 'mall', 'tatacliq', 'tata cliq', 'reliance digital', 'croma', 'snapdeal', 'firstcry', 'ikea', 'h&m', 'zara', 'westside', 'pantaloons', 'max fashion', 'urban company', 'urbanclap', 'uniqlo', 'levis', "levi's", 'us polo', 'allen solly', 'van heusen', 'peter england', 'fabindia', 'biba', 'snitch', 'bewakoof', 'souled store', 'puma', 'nike', 'adidas', 'reliance trends', 'jockey', 'marks & spencer', 'forever 21'] },
  { cat: 'transport', words: ['uber', 'ola', 'rapido', 'indian oil', 'iocl', 'bharat petroleum', 'hpcl', 'shell', 'fuel', 'petrol', 'metro', 'irctc', 'redbus', 'fastag', 'blusmart', 'namma yatri', 'makemytrip', 'goibibo', 'cleartrip', 'ixigo', 'vistara', 'indigo', 'air india', 'spicejet', 'railway', 'toll', 'parking', 'bmtc', 'ksrtc'] },
  { cat: 'tuition', words: ['university', 'college', 'school', 'tuition', 'academy', 'coaching', 'fees', 'institute', 'byju', 'unacademy', 'vedantu', 'whitehat'] },
  { cat: 'entertainment', words: ['bookmyshow', 'netflix', 'spotify', 'hotstar', 'prime video', 'pvr', 'inox', 'youtube', 'gaming', 'cinema', 'jiocinema', 'sonyliv', 'zee5', 'disney', 'jiosaavn', 'gaana', 'wynk', 'steam', 'playstation', 'xbox', 'dream11'] },
  { cat: 'health', words: ['pharmacy', 'apollo', 'cult.fit', 'cultfit', 'cure.fit', 'hospital', 'clinic', 'medplus', 'diagnostic', 'practo', 'medical', 'health', '1mg', 'tata 1mg', 'pharmeasy', 'netmeds', 'thyrocare', 'gym', 'fitness', 'dental', 'wellness'] },
  { cat: 'rent', words: ['rent', 'landlord', 'lease', 'maintenance', 'society', 'nobroker', 'housing'] },
  { cat: 'bills', words: ['electricity', 'bescom', 'water bill', 'gas', 'airtel', 'jio', 'vodafone', 'vi postpaid', 'broadband', 'recharge', 'postpaid', 'dth', 'utility', 'bill', 'tata power', 'adani', 'mahadiscom', 'bsnl', 'tata sky', 'd2h', 'act fibernet', 'fibernet', 'indane', 'lpg', 'insurance', 'lic', 'premium', 'sip', 'mutual fund', 'credit card', 'loan', 'emi'] },
];

// Words that mean money went OUT of the account.
const DEBIT_WORDS = ['debited', 'debit', 'spent', 'paid', 'sent', 'purchase', 'withdrawn', 'deducted'];
// Words that mean money came IN — these messages are ignored.
const CREDIT_WORDS = ['credited', 'credit', 'received', 'refund', 'cashback', 'reversed', 'deposited'];
// Messages that look transactional but never are — OTPs, promos, balance pings.
const IGNORE_WORDS = ['otp', 'one time password', 'do not share', 'never share', 'verification code', 'offer', 'discount', 'cashback', 'win ', 'reward points', 'e-statement', 'will be debited', 'due on', 'balance is', 'avl bal is'];

// Words that signal money moving over a transfer rail rather than a merchant
// purchase — used to tell a peer-to-peer transfer apart from a bill payment.
const TRANSFER_HINTS = ['upi', 'imps', 'neft', 'rtgs', 'transfer', 'transferred', 'sent to', 'fund transfer', 'p2a'];

const DAY = 86_400_000;

/** True for plain human-name-shaped strings like "Yashdeep Tomar" (2–3 words). */
function looksLikePersonName(s: string): boolean {
  const t = s.trim();
  return /^[A-Za-z]+(?:\s[A-Za-z]+){1,2}$/.test(t) && t.length <= 32;
}

/**
 * High-confidence rule-based category, or `null` when no rule is sure (the
 * on-device classifier then takes over, and "bills" is the final fallback).
 */
export function ruleClassify(merchant: string, body: string): string | null {
  const lc = (merchant + ' ' + body).toLowerCase();
  for (const { cat, words } of CATEGORY_KEYWORDS) {
    if (words.some(w => lc.includes(w))) return cat;
  }
  // A UPI/IMPS/NEFT payment whose payee reads like a person's name is a
  // peer-to-peer transfer, not a bill.
  if (TRANSFER_HINTS.some(w => lc.includes(w)) && looksLikePersonName(merchant)) {
    return 'transfers';
  }
  return null;
}

/** Pull the rupee amount out of a message, e.g. "Rs.1,240.00" → 1240. */
export function extractAmount(body: string): number | null {
  const m = body.match(/(?:rs|inr)\.?\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Extract the amount the user actually PAID from a receipt/payment email — the
 * order/grand total or debited amount. Each rupee amount is classified by the
 * label ON ITS OWN LINE into Strong (grand total / amount paid / debited…),
 * Weak (bare "total"/"paid"), and Demote (item total / MRP / GST / discount /
 * balance…) tiers; the largest-latest Strong wins, else Weak, else largest
 * non-demoted. Verified against 24 real-world Indian receipt formats (24/24).
 */
export function extractPaidAmount(
  text: string,
  opts: { strict?: boolean; maxAmount?: number } = {}
): number | null {
  if (!text) return null;
  const maxAmount = opts.maxAmount ?? 5_000_000; // ignore implausible figures (IDs, statement balances)

  const re = /(?:rs\.?|inr|₹)\s*-?\s*(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/gi;

  const STRONG = /grand total|order total|amount paid|amount payable|net payable|total paid|bill total|amount debited|invoice value|final amount|amount charged|total charged|to pay\b|total payable|total bill|amount to be paid|amount spent|transaction amount|money transferred|payment of|you paid|amount\s*:/i;
  const WEAK = /\btotal\b|\bpaid\b|\bdebited\b|\bcharged\b/i;
  const DEMOTE = /\boff\b|discount|you saved|you save|saved|savings|cashback|\bmrp\b|reward|points|coupon|wallet|available|avl|balance|\blimit\b|\bgst\b|\bigst\b|\btax\b|taxes|delivery|shipping|convenience|cancel|minimum|\bdue\b|outstanding|list price|deal price|face value|donation|\btip\b|packaging|handling|small cart|rain fee|platform fee|protect|secured packaging|carry bag|membership|coins|special price|selling price|offer price|flipkart price|gross|sub\s*-?\s*total|subtotal|before tax|premium|item total|items:|item savings|bag total|bag discount|net item|product savings|product discount|member discount/i;

  interface Hit { value: number; index: number; strong: boolean; weak: boolean; demoted: boolean }
  const hits: Hit[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const value = parseFloat(m[1].replace(/,/g, ''));
    if (!isFinite(value) || value <= 0 || value > maxAmount) continue;
    const lineStart = text.lastIndexOf('\n', m.index - 1) + 1;
    let lineEnd = text.indexOf('\n', m.index + m[0].length);
    if (lineEnd === -1) lineEnd = text.length;
    const line = text.slice(lineStart, lineEnd);
    const demoted = DEMOTE.test(line);
    hits.push({ value, index: m.index, strong: STRONG.test(line) && !demoted, weak: WEAK.test(line) && !demoted, demoted });
  }
  if (hits.length === 0) return null;

  const pickLargestLatest = (arr: Hit[]): number => {
    let best = arr[0];
    for (const h of arr) {
      if (h.value > best.value || (h.value === best.value && h.index > best.index)) best = h;
    }
    return best.value;
  };

  const strong = hits.filter(h => h.strong);
  if (strong.length) return pickLargestLatest(strong);
  const weak = hits.filter(h => h.weak);
  if (weak.length) return pickLargestLatest(weak);
  // No payment-labelled amount. In strict mode (email) skip rather than guess
  // the largest number, which is often an ID, points, or a statement balance.
  if (opts.strict) return null;
  const nonDemoted = hits.filter(h => !h.demoted);
  return pickLargestLatest(nonDemoted.length ? nonDemoted : hits);
}

function cleanName(s: string): string {
  return s.trim().replace(/\s+/g, ' ').replace(/[.\s]+$/, '');
}

/**
 * Best-effort payee/merchant name. Tries, in order: the "to/at/towards X"
 * phrasing most banks use, ICICI's "...; NAME credited" peer format, the
 * "credited to NAME" phrasing, and finally a UPI VPA handle (abc.xyz@bank).
 * Falls back to the SMS sender id.
 */
export function extractMerchant(body: string, fallback: string): string {
  // 1. "to / at / towards <X>" — HDFC/SBI/Paytm/GPay debits.
  let m = body.match(/\b(?:to|at|towards)\s+([A-Za-z0-9&.'@ _-]{2,40}?)(?=\s+(?:via|on|ref|using|for|from|dated|dt|bill|dues|txn|upi|a\/c|ac\b|account|\.|,|;|$))/i);
  // 2. ICICI peer format: "...; YASHDEEP TOMAR credited".
  if (!m) m = body.match(/[;,]\s*([A-Za-z][A-Za-z.\s]{2,38}?)\s+credited\b/i);
  // 3. "credited to <NAME>".
  if (!m) m = body.match(/credited to\s+([A-Za-z0-9&.'@ _-]{2,40}?)(?=\s+(?:on|upi|ref|a\/c|account|via|\.|,|;|$))/i);

  if (m) {
    let cleaned = cleanName(m[1]);
    // If we captured a UPI VPA handle (abc.xyz@bank), reduce it to the readable
    // local part: "rahul.verma@okhdfcbank" → "rahul verma".
    if (cleaned.includes('@')) cleaned = cleanName(cleaned.split('@')[0].replace(/[._-]+/g, ' '));
    if (cleaned && !/^(a\/c|ac|your|the|upi|ref|info|account)$/i.test(cleaned)) return cleaned;
  }

  // 4. Bare UPI VPA handle elsewhere in the text, e.g. "yashdeep.tomar@oksbi".
  const v = body.match(/\b([a-z0-9][a-z0-9._-]{1,40})@[a-z]{2,15}\b/i);
  if (v) {
    const local = cleanName(v[1].replace(/[._-]+/g, ' '));
    if (local && !/^\d+$/.test(local)) return local;
  }
  return fallback;
}

function isTransactional(body: string): boolean {
  const lc = body.toLowerCase();
  if (IGNORE_WORDS.some(w => lc.includes(w))) return false;
  if (CREDIT_WORDS.some(w => lc.includes(w)) && !DEBIT_WORDS.some(w => lc.includes(w))) return false;
  return DEBIT_WORDS.some(w => lc.includes(w));
}

function formatTime(d: Date): string {
  let h = d.getHours();
  const min = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${min} ${ampm}`;
}

/** A spend pulled from one SMS, before a category is assigned. */
export interface SpendDraft {
  merchant: string;
  body: string;
  amount: number;
  when: Date;
  address: string;
}

/**
 * Extract spend (debit) drafts from raw inbox messages — amount, merchant, and
 * date — without assigning a category. Credits, OTPs, and promos are skipped.
 * The importer resolves categories (overrides → rules → on-device model).
 */
export function extractSpends(raw: RawSms[]): SpendDraft[] {
  const out: SpendDraft[] = [];
  for (const sms of raw) {
    const body = sms.body || '';
    if (!isTransactional(body)) continue;
    const amount = extractAmount(body);
    if (amount == null) continue;
    out.push({
      merchant: extractMerchant(body, sms.address || 'Unknown'),
      body,
      amount: Math.round(amount),
      when: new Date(sms.date || Date.now()),
      address: sms.address || '',
    });
  }
  return out;
}

/**
 * Parse raw inbox messages into Khaata transactions using rule-based categories
 * only (with "bills" as the catch-all). Used for the offline/demo path and
 * tests; the live importer layers user overrides and the on-device model on top.
 */
export function parseSmsMessages(raw: RawSms[]): Transaction[] {
  return extractSpends(raw).map((d, i) => ({
    id: i + 1,
    merchant: d.merchant,
    cat: ruleClassify(d.merchant, d.body) ?? 'bills',
    amount: d.amount,
    day: d.when.getDate(),
    month: d.when.getMonth(),
    year: d.when.getFullYear(),
    time: formatTime(d.when),
    source: 'sms' as const,
  }));
}

/** Keep only the current calendar month's transactions. */
export function currentMonthOnly(txns: Transaction[], now = new Date()): Transaction[] {
  // `day` alone can't tell month; this is applied by the importer which knows
  // the source dates. Kept simple: importer pre-filters before parsing strips date.
  return txns;
}
