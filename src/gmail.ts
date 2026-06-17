import Constants from 'expo-constants';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { Transaction } from './data';
import { extractAmount, extractPaidAmount, ruleClassify } from './smsParser';
import { classifyMerchant } from './categorizer';
import { llmExtractEmail } from './llm';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;
export const GOOGLE_ANDROID_CLIENT_ID = extra.googleAndroidClientId || '';
export const GOOGLE_WEB_CLIENT_ID = extra.googleWebClientId || '';

export const GMAIL_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.readonly',
];

let configured = false;
export function configureGoogle(): void {
  if (configured) return;
  GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID, scopes: GMAIL_SCOPES, offlineAccess: false });
  configured = true;
}

/**
 * Get a Gmail access token. `interactive: false` restores the existing session
 * silently (no account picker) — used to keep the user signed in across app
 * launches. `interactive: true` shows the account picker (first sign-in or
 * "re-authenticate"). Returns null if not signed in / cancelled.
 */
export async function getGmailToken(interactive: boolean): Promise<string | null> {
  configureGoogle();
  try {
    if (interactive) {
      await GoogleSignin.signIn();
      // Ensure the sensitive Gmail scope is actually granted (basic sign-in
      // alone won't include it), otherwise the Gmail API returns 403.
      try {
        await GoogleSignin.addScopes({ scopes: ['https://www.googleapis.com/auth/gmail.readonly'] });
      } catch {
        /* already granted or not needed */
      }
    } else {
      const res: any = await GoogleSignin.signInSilently();
      if (res && res.type && res.type !== 'success') return null; // no saved session
    }
    const tokens = await GoogleSignin.getTokens();
    return tokens?.accessToken ?? null;
  } catch {
    return null;
  }
}

/**
 * Log in with Google (shows the account picker). Authenticates and grants the
 * Gmail scope up front so later syncs are silent — but does NOT fetch any email
 * here. Returns the profile (name/email/photo) or null if cancelled/failed.
 */
export async function loginGoogle(): Promise<GoogleProfile | null> {
  configureGoogle();
  try {
    await GoogleSignin.signIn();
    try {
      await GoogleSignin.addScopes({ scopes: ['https://www.googleapis.com/auth/gmail.readonly'] });
    } catch {
      /* already granted */
    }
    return await getGoogleProfile();
  } catch {
    return null;
  }
}

/** Whether a Google account is already signed in (no UI). */
export async function isGoogleSignedIn(): Promise<boolean> {
  configureGoogle();
  try {
    return !!(await GoogleSignin.getCurrentUser());
  } catch {
    return false;
  }
}

/** Sign out of Google (clears the saved session). */
export async function googleSignOut(): Promise<void> {
  configureGoogle();
  try {
    await GoogleSignin.signOut();
  } catch {
    /* ignore */
  }
}

export interface GoogleProfile { name?: string; email?: string; photo?: string }

/** Current signed-in Google user's profile (name, email, photo URL). */
export async function getGoogleProfile(): Promise<GoogleProfile | null> {
  configureGoogle();
  try {
    const cur: any = await GoogleSignin.getCurrentUser();
    const u = cur?.user ?? cur?.data?.user ?? cur;
    if (!u) return null;
    return { name: u.name, email: u.email, photo: u.photo || undefined };
  } catch {
    return null;
  }
}

// Gmail query: transactional emails from roughly the last year.
// Broad recall across the whole email (not just subject) so we don't miss
// receipts; the TXN_SIGNAL guard below then filters out promos/newsletters.
const QUERY =
  'newer_than:1y ("payment of" OR "you paid" OR "amount paid" OR "order total" OR "order confirmed" OR "order placed" OR "payment received" OR "payment successful" OR "successfully paid" OR "paid to" OR "spent on" OR "debited" OR "tax invoice" OR "receipt" OR "transaction id" OR "your order" OR "booking confirmed" OR "recharge successful" OR "has been debited")';

// An email is only treated as a transaction if it carries a real payment/order
// signal (so a promo that merely mentions "₹999" isn't counted as a spend).
const TXN_SIGNAL = /order\s+(confirmed|placed|total|summary)|payment\s+(of|received|successful|confirmation)|you\s+paid|paid\s+to|amount\s+paid|has\s+been\s+debited|\bdebited\b|tax\s+invoice|\breceipt\b|transaction\s+(id|of|successful)|booking\s+confirmed|recharge\s+successful|spent\s+on|your\s+order|invoice|purchase\s+(of|in|confirmed|successful)|processing of purchase|units\s+(allotted|alloted)|\bfolio\b|\bsip\b|invested|investment(s)?\s+(of|is|are|successful)|order\s+sent\s+to\s+amc|redemption|redeemed|allotment/i;

// Senders that look transactional but are market/stock alerts, watchlists, and
// research digests — never an actual money movement. Skipped outright.
const NON_TXN_SENDER = /screener\.in|tickertape|trendlyne|tradingview|moneycontrol|smallcase|stockedge|et\s*markets|marketsmojo|marketfeed|investing\.com|chittorgarh|valueresearch/i;

function b64urlDecode(data: string): string {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
  try {
    // Hermes provides global atob; decode then fix UTF-8.
    const bin = (global as any).atob ? (global as any).atob(b64) : '';
    try {
      return decodeURIComponent(
        bin.split('').map((c: string) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
      );
    } catch {
      return bin;
    }
  } catch {
    return '';
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Recursively pull the best text out of a Gmail message payload.
function extractBody(payload: any): string {
  if (!payload) return '';
  const mime = payload.mimeType || '';
  if (payload.body?.data && (mime === 'text/plain' || mime === 'text/html')) {
    const text = b64urlDecode(payload.body.data);
    return mime === 'text/html' ? stripHtml(text) : text;
  }
  if (Array.isArray(payload.parts)) {
    // Prefer text/plain, then fall back to anything decodable.
    const plain = payload.parts.find((p: any) => p.mimeType === 'text/plain');
    if (plain) return extractBody(plain);
    for (const p of payload.parts) {
      const t = extractBody(p);
      if (t) return t;
    }
  }
  return '';
}

function headerValue(headers: any[], name: string): string {
  const h = headers?.find(x => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value || '';
}

/** "Swiggy <no-reply@swiggy.in>" → "Swiggy"; bare address → domain root. */
function senderName(from: string): string {
  const m = from.match(/^\s*"?([^"<]+?)"?\s*</);
  if (m && m[1].trim()) return m[1].trim();
  const dom = from.match(/@([a-z0-9-]+)\./i);
  if (dom) return dom[1].charAt(0).toUpperCase() + dom[1].slice(1);
  return from || 'Email';
}

function fmtTime(d: Date): string {
  let h = d.getHours();
  const min = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${min} ${ampm}`;
}

async function gget(url: string, token: string): Promise<any> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Gmail API ${res.status}`);
  return res.json();
}

/** Run an async fn over items with bounded concurrency (keeps order). */
async function mapPool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    })
  );
  return out;
}

async function ggetSafe(url: string, token: string): Promise<any | null> {
  try {
    return await gget(url, token);
  } catch {
    return null;
  }
}

/**
 * Fetch many messages in ONE HTTP request via the Gmail batch endpoint (up to
 * 100 sub-requests per batch), instead of N separate round-trips. Returns the
 * parsed JSON aligned to `ids` (null where a sub-request failed). This is the
 * key speed win — it collapses ~80 mobile round-trips into 1.
 */
async function batchGetMessages(ids: string[], token: string, query: string): Promise<Array<any | null>> {
  const out: Array<any | null> = new Array(ids.length).fill(null);
  for (let start = 0; start < ids.length; start += 100) {
    const chunk = ids.slice(start, start + 100);
    const boundary = 'khaata_batch_boundary';
    const body =
      chunk
        .map(
          (id, i) =>
            `--${boundary}\r\nContent-Type: application/http\r\nContent-ID: <item${i}>\r\n\r\n` +
            `GET /gmail/v1/users/me/messages/${id}?${query}\r\n`
        )
        .join('') + `--${boundary}--`;
    let text: string;
    let respBoundary: string | null = null;
    try {
      const res = await fetch('https://gmail.googleapis.com/batch/gmail/v1', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/mixed; boundary=${boundary}` },
        body,
      });
      if (!res.ok) continue;
      const ct = res.headers.get('content-type') || '';
      const bm = ct.match(/boundary=([^;]+)/i);
      respBoundary = bm ? bm[1].trim().replace(/^"|"$/g, '') : null;
      text = await res.text();
    } catch {
      continue;
    }
    // Split by the response boundary; each segment is one sub-response
    // (HTTP headers + a JSON body). Gmail preserves request order, and each
    // segment also echoes Content-ID: <response-item<N>>.
    const segments = respBoundary ? text.split('--' + respBoundary) : [text];
    let seq = 0;
    for (const seg of segments) {
      const braceStart = seg.indexOf('{');
      const braceEnd = seg.lastIndexOf('}');
      if (braceStart === -1 || braceEnd <= braceStart) continue;
      let json: any;
      try {
        json = JSON.parse(seg.slice(braceStart, braceEnd + 1));
      } catch {
        continue;
      }
      if (!json || json.error) continue;
      const idMatch = seg.match(/response-item(\d+)/i);
      const idx = idMatch ? parseInt(idMatch[1], 10) : seq;
      seq++;
      if (idx >= 0 && idx < chunk.length) out[start + idx] = json;
    }
  }
  return out;
}

function buildEmailTxn(id: string, msg: any, subject: string, from: string, text: string, amount: number): Transaction {
  const sender = senderName(from);
  const when = new Date(Number(msg.internalDate) || Date.now());
  return {
    id: 0,
    gmailId: id,
    merchant: sender,
    cat: categoryForEmail(sender, subject),
    amount,
    day: when.getDate(),
    month: when.getMonth(),
    year: when.getFullYear(),
    time: fmtTime(when),
    source: 'email',
    raw: text.trim().slice(0, 8000),
    sender,
  };
}

/**
 * Fetch and parse payment/transaction emails into Khaata transactions.
 * Two-tier for speed: pull lightweight metadata (headers + snippet, no body
 * download) for all messages first; only download the full HTML body for the
 * few where the amount isn't already in the subject/snippet. The complete
 * original email is loaded on demand by the detail screen (fetchEmailBody).
 */
export async function fetchGmailTransactions(token: string, max = 80, afterDate?: Date): Promise<Transaction[]> {
  const t0 = Date.now();
  // Incremental: only fetch emails newer than the last sync (Gmail after:Y/M/D).
  let q = QUERY;
  if (afterDate) {
    const y = afterDate.getFullYear();
    const m = afterDate.getMonth() + 1;
    const d = afterDate.getDate();
    q += ` after:${y}/${m}/${d}`;
  }
  const list = await gget(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${max}&q=${encodeURIComponent(q)}`,
    token
  );
  const ids: string[] = (list.messages || []).map((m: any) => m.id);
  console.log(`[gmail] list ${ids.length} ids in ${Date.now() - t0}ms`);

  // Phase 1 — metadata for ALL messages in one batched request.
  const t1 = Date.now();
  const metas = await batchGetMessages(ids, token, 'format=metadata&metadataHeaders=Subject&metadataHeaders=From');
  console.log(`[gmail] metadata ${ids.length} in ${Date.now() - t1}ms`);

  const out: Transaction[] = [];
  const needFull: string[] = [];
  metas.forEach((meta, i) => {
    if (!meta) return;
    const headers = meta.payload?.headers || [];
    const subject = headerValue(headers, 'Subject');
    const from = headerValue(headers, 'From');
    if (NON_TXN_SENDER.test(from)) return; // market/stock alert sender — skip
    const text = `${subject}\n${meta.snippet || ''}`;
    // Accept from the snippet only when it both reads as a transaction AND has
    // a parseable amount; otherwise inspect the full body before deciding.
    if (TXN_SIGNAL.test(text)) {
      const amount = extractPaidAmount(text, { strict: true }) ?? extractAmount(text);
      if (amount != null) {
        out.push(buildEmailTxn(ids[i], meta, subject, from, text, amount));
        return;
      }
    }
    needFull.push(ids[i]);
  });

  // Phase 2 — full body for the rest; keep only real transactions (signal +
  // amount), which also filters out promos that merely mention a rupee figure.
  console.log(`[gmail] phase1 accepted ${out.length}, needFull ${needFull.length}`);
  const t2 = Date.now();
  const fullIds = needFull;
  const fullMsgs = await batchGetMessages(fullIds, token, 'format=full');
  fullMsgs.forEach((msg, i) => {
    if (!msg) return;
    const headers = msg.payload?.headers || [];
    const subject = headerValue(headers, 'Subject');
    const from = headerValue(headers, 'From');
    if (NON_TXN_SENDER.test(from)) return; // market/stock alert sender — skip
    const bodyText = `${subject}\n${extractBody(msg.payload) || msg.snippet || ''}`;
    if (!TXN_SIGNAL.test(bodyText)) return;
    // Include any transaction-signalled email even when the regex can't find an
    // amount (e.g. ₹-formatted or oddly-laid-out receipts) — the background LLM
    // pass determines the real amount and drops it if there isn't one. Without
    // this, real transactions (e.g. SIP investments) never reach the LLM.
    const amount = extractPaidAmount(bodyText, { strict: true }) ?? extractAmount(bodyText);
    out.push(buildEmailTxn(fullIds[i], msg, subject, from, bodyText, amount ?? 0));
  });
  console.log(`[gmail] full ${fullIds.length} in ${Date.now() - t2}ms; TOTAL ${out.length} txns in ${Date.now() - t0}ms`);
  return out;
}

/** Batch-fetch the full readable bodies of many emails (for the background LLM
 * pass): one or two HTTP requests for the whole set. */
export async function fetchEmailBodies(gmailIds: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!gmailIds.length) return out;
  const token = await getGmailToken(false);
  if (!token) return out;
  const msgs = await batchGetMessages(gmailIds, token, 'format=full');
  msgs.forEach((msg, i) => {
    if (!msg) return;
    const headers = msg.payload?.headers || [];
    const subject = headerValue(headers, 'Subject');
    out[gmailIds[i]] = `${subject}\n\n${extractBody(msg.payload) || msg.snippet || ''}`.trim();
  });
  return out;
}

/** On-demand: fetch the full readable body of one email (for the detail view). */
export async function fetchEmailBody(gmailId: string): Promise<string | null> {
  const token = await getGmailToken(false);
  if (!token) return null;
  const msg = await ggetSafe(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${gmailId}?format=full`, token);
  if (!msg) return null;
  const headers = msg.payload?.headers || [];
  const subject = headerValue(headers, 'Subject');
  return `${subject}\n\n${extractBody(msg.payload) || msg.snippet || ''}`.trim();
}

/**
 * Categorise an email by its sender brand first (most reliable), then the
 * subject line, then the on-device model — avoiding the noisy email body which
 * causes keyword false-matches. Falls back to "bills".
 */
/**
 * One-off AUDIT (debug): scan ALL transaction-candidate emails since Jan 1 with
 * a BROAD query, and for each ask the LLM whether it's a real transaction. Logs
 * only findings (sender + truncated subject + verdicts) — never the token or raw
 * bodies — so the app's capture gaps can be found and fixed. Remove after.
 */
export async function runEmailAudit(): Promise<void> {
  const token = await getGmailToken(false);
  if (!token) { console.log('[AUDIT] no Google token — sign in first'); return; }
  const q =
    'after:2026/1/1 (rs OR inr OR payment OR paid OR debited OR credited OR order OR invoice OR ' +
    'investment OR invested OR dividend OR sip OR "mutual fund" OR purchase OR transaction OR ' +
    'receipt OR spent OR booking OR recharge OR "units" OR folio OR redeemed OR refund)';
  let list: any;
  try {
    list = await gget(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=150&q=${encodeURIComponent(q)}`, token);
  } catch (e) {
    console.log('[AUDIT] list failed', String(e));
    return;
  }
  const ids: string[] = (list.messages || []).map((m: any) => m.id);
  console.log(`[AUDIT] scanning ${ids.length} candidate emails since 2026-01-01`);
  const msgs = await batchGetMessages(ids, token, 'format=full');
  const items = msgs
    .map((msg, i) => {
      if (!msg) return null;
      const headers = msg.payload?.headers || [];
      const subject = headerValue(headers, 'Subject');
      const from = headerValue(headers, 'From');
      const body = `${subject}\n${extractBody(msg.payload) || msg.snippet || ''}`;
      return { id: ids[i], subject, from, body };
    })
    .filter(Boolean) as Array<{ id: string; subject: string; from: string; body: string }>;

  let aiTxn = 0, appCap = 0, miss = 0, falsePos = 0, catDiff = 0;
  await mapPool(items, 4, async e => {
    const denied = NON_TXN_SENDER.test(e.from);
    const signal = TXN_SIGNAL.test(e.body);
    const appAmt = extractPaidAmount(e.body, { strict: true }) ?? extractAmount(e.body);
    const appCat = categoryForEmail(senderName(e.from), e.subject);
    const ai = await llmExtractEmail(e.body);
    const isTxn = !!ai && ai.isTransaction && ai.amountValue != null;
    // New capture rule: included if signalled + not denied; the LLM supplies the
    // amount, so a null regex amount no longer excludes it.
    const appCapture = !denied && signal && isTxn;
    if (isTxn) aiTxn++;
    if (appCapture) appCap++;
    const sub = e.subject.slice(0, 48).replace(/\s+/g, ' ');
    const who = senderName(e.from);
    if (isTxn && !appCapture) {
      miss++;
      console.log(`[AUDIT] MISS ${who} | "${sub}" | ai=${ai!.amountValue}/${ai!.category} | denied=${denied} signal=${signal} appAmt=${appAmt}`);
    } else if (!isTxn && appCapture) {
      falsePos++;
      console.log(`[AUDIT] FALSE+ ${who} | "${sub}" | appAmt=${appAmt} appCat=${appCat}`);
    } else if (isTxn && appCapture && ai!.category && ai!.category !== appCat) {
      catDiff++;
      console.log(`[AUDIT] CATDIFF ${who} | "${sub}" | ai=${ai!.category} app=${appCat} amt=${ai!.amountValue}`);
    }
  });
  console.log(`[AUDIT] SUMMARY scanned=${items.length} aiTxn=${aiTxn} appCapture=${appCap} MISS=${miss} FALSE+=${falsePos} CATDIFF=${catDiff}`);
}

function categoryForEmail(sender: string, subject: string): string {
  const s = `${sender} ${subject}`;
  // Dividend/interest income is folded into Savings & Investments.
  if (/dividend|interest credited|interest payout|\bsip\b|mutual fund|folio|groww|zerodha|coin\b|paytm money|kuvera|indmoney|smallcase|units (allotted|alloted)|nav\b|\bnse\b|\bbse\b|fixed deposit|recurring deposit/i.test(s)) return 'investments';
  if (/insurance|policy|premium|\blic\b|mediclaim|hdfc life|icici pru|star health/i.test(s)) return 'insurance';
  return (
    ruleClassify(sender, '') ||
    classifyMerchant(sender)?.cat ||
    ruleClassify(subject, '') ||
    'other'
  );
}
