/**
 * On-device merchant categoriser. A lightweight nearest-centroid text
 * classifier over character n-grams + word tokens, compared by cosine
 * similarity. Runs fully offline with no model download and no network calls.
 *
 * It generalises from a seed lexicon of known brands (and fuzzy variants of
 * them) and keeps learning from the user's corrections via `teachCategorizer`.
 * Like any small on-device model it has no world knowledge, so a brand it has
 * never seen and that isn't textually similar to a known one returns null —
 * those fall back to "bills" until the user categorises one, after which the
 * model recognises that merchant (and similar names) for good.
 */

// Seed examples: representative merchant names per category. The classifier
// matches new merchants against these by n-gram/token overlap.
const SEED: Record<string, string[]> = {
  dining: ['zomato', 'swiggy', 'dominos pizza', 'pizza hut', 'starbucks', 'cafe coffee day', 'mcdonalds', 'kfc', 'burger king', 'subway', 'haldiram', 'barbeque nation', 'biryani', 'restaurant', 'chaayos', 'third wave coffee', 'dunkin', 'wow momo', 'behrouz biryani', 'faasos'],
  groceries: ['swiggy instamart', 'blinkit', 'zepto', 'bigbasket', 'dmart', 'jiomart', 'reliance smart', 'more supermarket', 'spencers', 'kirana store', 'licious', 'country delight', 'milkbasket', 'grocery', 'vegetables', 'fruits'],
  lifestyle: ['amazon', 'flipkart', 'myntra', 'ajio', 'nykaa', 'meesho', 'tatacliq', 'reliance digital', 'croma', 'decathlon', 'uniqlo', 'zara', 'h&m', 'levis', 'allen solly', 'van heusen', 'peter england', 'fabindia', 'biba', 'puma', 'nike', 'adidas', 'westside', 'pantaloons', 'shoppers stop', 'firstcry', 'ikea', 'snitch', 'bewakoof', 'salon', 'spa', 'grooming', 'subscription'],
  transport: ['uber', 'ola', 'rapido', 'blusmart', 'indian oil', 'bharat petroleum', 'hpcl', 'shell petrol', 'fuel', 'irctc railway', 'redbus', 'fastag', 'metro', 'namma yatri', 'ksrtc', 'bmtc', 'car service', 'vehicle service'],
  education: ['university', 'college', 'school fees', 'tuition', 'coaching', 'academy', 'institute', 'byjus', 'unacademy', 'vedantu', 'whitehat', 'udemy', 'coursera', 'upgrad', 'scaler', 'books'],
  entertainment: ['bookmyshow', 'netflix', 'spotify', 'hotstar', 'jiocinema', 'sonyliv', 'zee5', 'prime video', 'pvr cinemas', 'inox', 'youtube premium', 'jiosaavn', 'gaana', 'playstation', 'xbox', 'steam games', 'dream11', 'makemytrip', 'goibibo', 'cleartrip', 'indigo airlines', 'vistara', 'air india', 'spicejet', 'oyo', 'airbnb', 'hotel', 'trip'],
  healthcare: ['apollo pharmacy', 'pharmeasy', '1mg', 'netmeds', 'medplus', 'cult fit', 'cure fit', 'practo', 'thyrocare', 'hospital', 'clinic', 'dental', 'gym membership', 'fitness', 'diagnostics', 'medical', 'doctor', 'medicine'],
  housing: ['rent', 'landlord', 'house rent', 'society maintenance', 'lease', 'nobroker', 'housing', 'property tax', 'home loan'],
  utilities: ['electricity bill', 'bescom', 'tata power', 'adani electricity', 'water bill', 'gas bill', 'indane', 'airtel postpaid', 'jio recharge', 'vodafone', 'bsnl', 'act fibernet', 'broadband', 'dth recharge', 'tata sky', 'internet', 'wifi', 'mobile recharge'],
  insurance: ['lic premium', 'insurance', 'hdfc life', 'icici prudential', 'max life', 'sbi life', 'star health', 'care health', 'niva bupa', 'acko', 'go digit', 'policybazaar', 'mediclaim', 'term plan'],
  investments: ['paytm money', 'groww', 'zerodha', 'upstox', 'kuvera', 'indmoney', 'smallcase', 'mutual fund sip', 'nippon india', 'sbi mutual fund', 'axis mutual fund', 'mirae asset', 'demat', 'fixed deposit', 'recurring deposit', 'elss'],
  domestic: ['maid', 'cook', 'housekeeping', 'domestic help', 'house help', 'society staff', 'security guard', 'nanny', 'gardener'],
  transfers: ['upi transfer', 'imps transfer', 'neft', 'money sent', 'fund transfer'],
};

interface Example {
  cat: string;
  vec: Map<string, number>;
  norm: number;
}

// Reference examples for nearest-neighbour matching (one per seed/learned name).
let examples: Example[] = [];

/** Lowercased word tokens + character trigrams of the merchant string. */
function features(text: string): string[] {
  const lc = text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!lc) return [];
  const out: string[] = [];
  for (const tok of lc.split(' ')) {
    if (tok.length >= 2) out.push('w:' + tok); // whole-word feature
  }
  const squashed = lc.replace(/ /g, '');
  for (let i = 0; i + 3 <= squashed.length; i++) out.push('g:' + squashed.slice(i, i + 3)); // char trigram
  return out;
}

function vecOf(text: string): Map<string, number> {
  const v = new Map<string, number>();
  for (const f of features(text)) v.set(f, (v.get(f) || 0) + 1);
  return v;
}

function normOf(vec: Map<string, number>): number {
  let s = 0;
  for (const v of vec.values()) s += v * v;
  return Math.sqrt(s) || 1;
}

function makeExample(merchant: string, cat: string): Example {
  const vec = vecOf(merchant);
  return { cat, vec, norm: normOf(vec) };
}

/** (Re)build the reference set from the seed lexicon plus learned examples. */
export function initCategorizer(learned: Array<{ merchant: string; cat: string }> = []): void {
  examples = [];
  for (const [cat, names] of Object.entries(SEED)) {
    for (const n of names) examples.push(makeExample(n, cat));
  }
  for (const { merchant, cat } of learned) examples.push(makeExample(merchant, cat));
}

function cosine(query: Map<string, number>, queryNorm: number, e: Example): number {
  let dot = 0;
  const [small, big] = query.size < e.vec.size ? [query, e.vec] : [e.vec, query];
  for (const [f, v] of small) {
    const o = big.get(f);
    if (o) dot += v * o;
  }
  return dot / (queryNorm * e.norm);
}

const ACCEPT_THRESHOLD = 0.4; // below this the nearest example is too weak to trust

/**
 * Best on-device category for a merchant via nearest-example (1-NN) cosine
 * similarity, or null when no example is a confident enough match (caller then
 * falls back to "bills").
 */
// Bank/operator SMS sender short-codes, e.g. "AD-ICICIT-S", "VM-HDFCBK".
// These aren't merchant names, so don't let the model fuzzy-match them.
const SENDER_CODE = /^[A-Z]{2}-[A-Z0-9]{3,}(-[A-Z])?$/;

export function classifyMerchant(merchant: string): { cat: string; score: number } | null {
  if (SENDER_CODE.test(merchant.trim())) return null;
  const query = vecOf(merchant);
  if (!query.size) return null;
  const qNorm = normOf(query);

  let best = { cat: '', score: 0 };
  for (const e of examples) {
    const score = cosine(query, qNorm, e);
    if (score > best.score) best = { cat: e.cat, score };
  }
  if (best.score < ACCEPT_THRESHOLD) return null;
  return best;
}

/** Reinforce the model with a confirmed (merchant → category) example. */
export function teachCategorizer(merchant: string, cat: string): void {
  examples.push(makeExample(merchant, cat));
}
