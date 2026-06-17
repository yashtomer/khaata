import Constants from 'expo-constants';

/**
 * Optional cloud categoriser backed by a self-hosted OpenAI-compatible LLM
 * (e.g. Qwen). Used only as a fallback for merchants/senders the on-device
 * rules and model can't categorise. Returns a merchant → category-key map;
 * returns {} (no-op) when unconfigured or on any error, so the app degrades
 * gracefully to the local layers.
 */

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;
const LLM_URL = extra.llmApiUrl || '';
const LLM_KEY = extra.llmApiKey || '';
const LLM_MODEL = extra.llmModel || '';

const VALID = new Set([
  'housing', 'utilities', 'groceries', 'dining', 'transport', 'healthcare',
  'education', 'lifestyle', 'entertainment', 'investments', 'insurance',
  'domestic', 'transfers', 'other',
]);

// One-line description of each category key, reused in the LLM prompts.
const CATEGORY_GUIDE =
  'housing (rent/EMI/maintenance/property tax), utilities (electricity/water/gas/internet/mobile/recharge), ' +
  'groceries (groceries/provisions/vegetables/fruits), dining (restaurants/food delivery/cafes), ' +
  'transport (fuel/cab/auto/public transit/vehicle service), healthcare (medicines/doctor/hospital/gym), ' +
  'education (school/college fees/courses/books), lifestyle (clothing/grooming/salon/shopping/subscriptions), ' +
  'entertainment (OTT/movies/outings/travel/trips/hotels), investments (SIP/mutual fund/stocks/FD/RD and dividend/interest income), ' +
  'insurance (life/health/vehicle insurance premiums), domestic (maid/cook/society staff/services), ' +
  'transfers (person-to-person money transfer), other (anything else)';

const SYSTEM =
  'You categorise Indian personal-finance transactions by merchant/sender name. ' +
  'Choose exactly one category key for each, from this list:\n' + CATEGORY_GUIDE + '\n' +
  'Respond with ONLY a compact JSON object mapping each input string to its category key. No prose, no code fences.';

export function llmConfigured(): boolean {
  return !!(LLM_URL && LLM_KEY && LLM_MODEL);
}

// The self-hosted model serves ONE request at a time. Funnel every LLM call
// through a single queue so concurrent callers (email extraction + SMS
// categorisation) don't slam it at once and all time out. Serializing loses no
// real throughput (the server is single-threaded) and prevents the failures.
let llmChain: Promise<unknown> = Promise.resolve();
function llmPost(messages: any[], timeoutMs: number, maxTokens?: number): Promise<any | null> {
  const run = llmChain.then(() => llmPostRaw(messages, timeoutMs, maxTokens));
  llmChain = run.then(() => undefined, () => undefined); // keep the chain alive past errors
  return run;
}

/** POST to the LLM with an abort timeout so a slow call never hangs the UI. */
async function llmPostRaw(messages: any[], timeoutMs: number, maxTokens?: number): Promise<any | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(LLM_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${LLM_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: LLM_MODEL, temperature: 0, ...(maxTokens ? { max_tokens: maxTokens } : {}), messages }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface EmailExtract {
  /** False when the email is not an actual money movement (alert/summary/promo). */
  isTransaction: boolean;
  amount: string | null;   // for display (e.g. "4160")
  amountValue: number | null; // numeric, for the transaction amount
  type: string | null;
  vendor: string | null;
  category: string | null; // one of the valid category keys
  ms: number; // how long the LLM call took, in milliseconds
}

/**
 * Keep only the email header (subject) + the meaningful body, dropping the
 * marketing/legal/unsubscribe footer. Smaller input = faster generation and
 * more accurate extraction (the footer is noise the model has to wade through).
 */
function trimForLlm(text: string): string {
  const t = text.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  // Only strip a clearly-BOTTOM footer: a marker that appears well into the
  // email (>= 700 chars). This keeps the transaction amount (almost always in
  // the first few hundred chars) — an early "unsubscribe"/"do not reply"
  // preheader must never cut the body, which previously nulled real amounts.
  const markers = [
    /all rights reserved/i,
    /©\s*\d{4}/,
    /terms (and|&) conditions|terms of (use|service)/i,
    /registered (office|address)|corporate office/i,
    /you (are|'re) receiving this/i,
    /this (email|message) (was|is) sent to/i,
    /\bunsubscribe\b/i,
    /privacy policy/i,
  ];
  let cut = t.length;
  for (const re of markers) {
    const m = t.search(re);
    if (m >= 700 && m < cut) cut = m;
  }
  return t.slice(0, Math.min(cut, 1800)).trim();
}

/**
 * Send a single payment email to the LLM and get structured data back:
 * amount, transaction type, and the vendor/company the payment is for. Returns
 * null when unconfigured or on error. Called on demand (transaction detail view).
 */
export async function llmExtractEmail(emailText: string): Promise<EmailExtract | null> {
  if (!llmConfigured() || !emailText) return null;
  const system =
    'You read ONE email, decide whether it records a real money movement by the user, then extract structured data. ' +
    'Respond with ONLY compact JSON — no prose, no markdown, no code fences — exactly these keys:\n' +
    '{"isTransaction": <true ONLY if in THIS email the user actually paid, was charged, invested, was refunded, or received money (dividend/interest). false for stock/price watchlist alerts, portfolio or account summaries, statements, "order shipped/delivered" with no payment, OTPs, newsletters and promotions>, ' +
    '"amount": <the rupee amount that moved in THIS transaction — the amount paid / invested / debited, or the net amount received — as a number. NEVER use the portfolio value, total investment value, current value, account balance, holdings, NAV, units or returns. If no such per-transaction amount is stated, use null>, ' +
    '"type": "<short type: e.g. UPI payment, Card purchase, Online order, Refund, Bill payment, Recharge, Subscription, SIP, Investment, Dividend, Interest>", ' +
    '"vendor": "<the company/merchant/fund/person this is to or from — what it is for>", ' +
    '"category": "<one key from: ' + CATEGORY_GUIDE + '>"}. ' +
    'Rules: a mutual-fund / SIP / stock / FD / RD purchase → investments; dividend or interest income → investments; insurance premium → insurance. ' +
    'Use null for anything you cannot determine.';
  // Send only the header + body (footer stripped) — faster + more accurate.
  const t0 = Date.now();
  const data = await llmPost(
    [
      { role: 'system', content: system },
      { role: 'user', content: `Email:\n${trimForLlm(emailText)}` },
    ],
    45000, // generous ceiling so a cold model load never wrongly fails
    120
  );
  const ms = Date.now() - t0;
  if (!data) return null;
  try {
    const text: string = data?.choices?.[0]?.message?.content || '';
    const match = text.replace(/```json|```/gi, '').match(/\{[\s\S]*\}/);
    if (!match) return null;
    const p = JSON.parse(match[0]);
    const str = (v: any) => (v == null || v === '' ? null : String(v));
    const num = parseFloat(String(p.amount ?? '').replace(/[^\d.]/g, ''));
    const cat = typeof p.category === 'string' && VALID.has(p.category) ? p.category : null;
    const isTransaction = p.isTransaction !== false; // default true unless explicitly false
    return {
      isTransaction,
      amount: str(p.amount),
      amountValue: isFinite(num) && num > 0 ? Math.round(num) : null,
      type: str(p.type),
      vendor: str(p.vendor),
      category: cat,
      ms,
    };
  } catch {
    return null;
  }
}

/**
 * Categorise a batch of transactions using their text (merchant + SMS body
 * snippet) for context — far better than the merchant name alone for opaque UPI
 * payees. Returns id → category key. Chunks to keep each request small.
 */
export async function llmCategorizeContext(items: Array<{ id: number; text: string }>): Promise<Record<number, string>> {
  if (!llmConfigured() || !items.length) return {};
  const sys =
    'You categorise Indian bank-SMS / UPI transactions. For each item choose ONE key from:\n' + CATEGORY_GUIDE + '.\n' +
    'A payment to a person\'s name with no business context is transfers. ' +
    'Input is a JSON array of {id, text}. Respond with ONLY a compact JSON object mapping each id (number) to its category key. No prose, no code fences.';
  const out: Record<number, string> = {};
  for (let i = 0; i < items.length; i += 12) {
    const chunk = items.slice(i, i + 12);
    const data = await llmPost(
      [
        { role: 'system', content: sys },
        { role: 'user', content: JSON.stringify(chunk) },
      ],
      45000,
      300
    );
    if (!data) continue;
    // qwen returns this inconsistently — sometimes {"1":"education"}, sometimes
    // [1="education", 2="transfers"]. Extract id→category pairs from any format
    // rather than relying on strict JSON.
    const text: string = data?.choices?.[0]?.message?.content || '';
    for (const m of text.matchAll(/(\d+)\s*["']?\s*[:=]\s*["']?([a-z]+)/gi)) {
      const id = Number(m[1]);
      const cat = m[2].toLowerCase();
      if (VALID.has(cat)) out[id] = cat;
    }
  }
  return out;
}

export async function llmCategorize(merchants: string[]): Promise<Record<string, string>> {
  if (!llmConfigured() || merchants.length === 0) return {};
  const data = await llmPost(
    [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `Categorise: ${JSON.stringify(merchants)}` },
    ],
    30000
  );
  if (!data) return {};
  try {
    const text: string = data?.choices?.[0]?.message?.content || '';
    const match = text.replace(/```json|```/gi, '').match(/\{[\s\S]*\}/);
    if (!match) return {};
    const parsed = JSON.parse(match[0]);
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string' && VALID.has(v)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}
