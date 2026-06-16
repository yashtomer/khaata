import Constants from 'expo-constants';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { Transaction } from './data';
import { extractAmount, extractPaidAmount, ruleClassify } from './smsParser';
import { classifyMerchant } from './categorizer';

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
const TXN_SIGNAL = /order\s+(confirmed|placed|total|summary)|payment\s+(of|received|successful|confirmation)|you\s+paid|paid\s+to|amount\s+paid|has\s+been\s+debited|\bdebited\b|tax\s+invoice|\breceipt\b|transaction\s+(id|of|successful)|booking\s+confirmed|recharge\s+successful|spent\s+on|your\s+order|invoice/i;

function b64urlDecode(data: string): string {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
  try {
    // Hermes provides global atob; decode then fix UTF-8.
    const bin = (global as any).atob ? (global as any).atob(b64) : '';
    try {
      return decodeURIComponent(
        bin.split('').map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
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
export async function fetchGmailTransactions(token: string, max = 80): Promise<Transaction[]> {
  const list = await gget(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${max}&q=${encodeURIComponent(QUERY)}`,
    token
  );
  const ids: string[] = (list.messages || []).map((m: any) => m.id);

  // Phase 1 — metadata only (small, fast).
  const metas = await mapPool(ids, 12, id =>
    ggetSafe(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
      token
    )
  );

  const out: Transaction[] = [];
  const needFull: string[] = [];
  metas.forEach((meta, i) => {
    if (!meta) return;
    const headers = meta.payload?.headers || [];
    const subject = headerValue(headers, 'Subject');
    const from = headerValue(headers, 'From');
    const text = `${subject}\n${meta.snippet || ''}`;
    // Accept from the snippet only when it both reads as a transaction AND has
    // a parseable amount; otherwise inspect the full body before deciding.
    if (TXN_SIGNAL.test(text)) {
      const amount = extractPaidAmount(text) ?? extractAmount(text);
      if (amount != null) {
        out.push(buildEmailTxn(ids[i], meta, subject, from, text, amount));
        return;
      }
    }
    needFull.push(ids[i]);
  });

  // Phase 2 — full body for the rest; keep only real transactions (signal +
  // amount), which also filters out promos that merely mention a rupee figure.
  const fulls = await mapPool(needFull.slice(0, 60), 10, async id => {
    const msg = await ggetSafe(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, token);
    if (!msg) return null;
    const headers = msg.payload?.headers || [];
    const subject = headerValue(headers, 'Subject');
    const from = headerValue(headers, 'From');
    const bodyText = `${subject}\n${extractBody(msg.payload) || msg.snippet || ''}`;
    if (!TXN_SIGNAL.test(bodyText)) return null;
    const amount = extractPaidAmount(bodyText) ?? extractAmount(bodyText);
    if (amount == null) return null;
    return buildEmailTxn(id, msg, subject, from, bodyText, amount);
  });
  for (const t of fulls) if (t) out.push(t);
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
function categoryForEmail(sender: string, subject: string): string {
  return (
    ruleClassify(sender, '') ||
    classifyMerchant(sender)?.cat ||
    ruleClassify(subject, '') ||
    'bills'
  );
}
