import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * On-device persistence for category learning. Two stores:
 *  - overrides: merchant → category the user explicitly set (always wins).
 *  - learned:   merchant → category examples used to train the on-device model.
 * Both live in AsyncStorage and are mirrored in memory for synchronous reads.
 */

// v2: reset — overrides/learned held the old category keys (food/shopping/rent/
// bills/…); cleared so everything re-categorises into the new taxonomy.
const OVERRIDES_KEY = 'khaata.categoryOverrides.v2';
// v5: reset so new keyword rules (e.g. UPI Lite → groceries) take precedence
// over previously-learned AI guesses (keeps user overrides).
const LEARNED_KEY = 'khaata.learnedExamples.v5';
const NAME_KEY = 'khaata.userName.v1';
const EMAIL_KEY = 'khaata.emailConnected.v1';
const SMS_KEY = 'khaata.smsConnected.v1';
const PHOTO_KEY = 'khaata.googlePhoto.v1';
// v5: reset again after fixing the SMS-wipe bug, so email re-fetches cleanly
// (the v4 cache was poisoned: near-empty email + a recent sync timestamp that
// limited the incremental fetch to the last 2 days).
const EMAIL_TXNS_KEY = 'khaata.emailTxns.v10';
const EMAIL_SYNC_KEY = 'khaata.emailSync.v10';
const AUTOSYNC_KEY = 'khaata.autoSync.v1';
const LOGGEDIN_KEY = 'khaata.loggedIn.v1';

let userName = '';
let emailConnected = false;
let smsConnected = false;
let googlePhoto = '';
let autoSync = true; // default on; user can turn it off in the drawer
let loggedIn = false; // signed in with Google (gates the login screen)

/** Normalise a merchant name into a stable lookup key. */
export function merchantKey(merchant: string): string {
  return merchant.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[.,;:]+$/, '');
}

let overrides: Record<string, string> = {};
let learned: Record<string, string> = {};
let loaded = false;

/** Load both stores from disk into memory. Safe to call more than once. */
export async function loadCategoryData(): Promise<void> {
  if (loaded) return;
  try {
    const [o, l, n, e, s, p, a, li] = await AsyncStorage.multiGet([OVERRIDES_KEY, LEARNED_KEY, NAME_KEY, EMAIL_KEY, SMS_KEY, PHOTO_KEY, AUTOSYNC_KEY, LOGGEDIN_KEY]);
    overrides = o[1] ? JSON.parse(o[1]) : {};
    learned = l[1] ? JSON.parse(l[1]) : {};
    userName = n[1] || '';
    emailConnected = e[1] === '1';
    smsConnected = s[1] === '1';
    googlePhoto = p[1] || '';
    autoSync = a[1] == null ? true : a[1] === '1';
    loggedIn = li[1] === '1';
  } catch {
    overrides = {};
    learned = {};
    userName = '';
    emailConnected = false;
    smsConnected = false;
    googlePhoto = '';
    autoSync = true;
    loggedIn = false;
  }
  loaded = true;
}

export function getUserName(): string {
  return userName;
}

export async function setUserName(name: string): Promise<void> {
  userName = name.trim();
  try {
    await AsyncStorage.setItem(NAME_KEY, userName);
  } catch {
    /* best-effort */
  }
}

export function getEmailConnectedFlag(): boolean {
  return emailConnected;
}

export async function setEmailConnectedFlag(v: boolean): Promise<void> {
  emailConnected = v;
  try {
    await AsyncStorage.setItem(EMAIL_KEY, v ? '1' : '0');
  } catch {
    /* best-effort */
  }
}

/** Parsed email transactions cached from the last Gmail sync, with the sync
 * time, so launches only fetch emails newer than `sync` (fast). */
export async function getCachedEmail(): Promise<{ txns: any[]; sync: number }> {
  try {
    const [t, s] = await AsyncStorage.multiGet([EMAIL_TXNS_KEY, EMAIL_SYNC_KEY]);
    return { txns: t[1] ? JSON.parse(t[1]) : [], sync: s[1] ? parseInt(s[1], 10) : 0 };
  } catch {
    return { txns: [], sync: 0 };
  }
}

export async function setCachedEmail(txns: any[], sync: number): Promise<void> {
  try {
    await AsyncStorage.multiSet([[EMAIL_TXNS_KEY, JSON.stringify(txns)], [EMAIL_SYNC_KEY, String(sync)]]);
  } catch {
    /* best-effort */
  }
}

export async function clearCachedEmail(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([EMAIL_TXNS_KEY, EMAIL_SYNC_KEY]);
  } catch {
    /* best-effort */
  }
}

export function getGooglePhoto(): string {
  return googlePhoto;
}

export async function setGooglePhoto(url: string): Promise<void> {
  googlePhoto = url || '';
  try {
    await AsyncStorage.setItem(PHOTO_KEY, googlePhoto);
  } catch {
    /* best-effort */
  }
}

export function getLoggedInFlag(): boolean {
  return loggedIn;
}

export async function setLoggedInFlag(v: boolean): Promise<void> {
  loggedIn = v;
  try {
    await AsyncStorage.setItem(LOGGEDIN_KEY, v ? '1' : '0');
  } catch {
    /* best-effort */
  }
}

export function getAutoSync(): boolean {
  return autoSync;
}

export async function setAutoSync(v: boolean): Promise<void> {
  autoSync = v;
  try {
    await AsyncStorage.setItem(AUTOSYNC_KEY, v ? '1' : '0');
  } catch {
    /* best-effort */
  }
}

export function getSmsConnectedFlag(): boolean {
  return smsConnected;
}

export async function setSmsConnectedFlag(v: boolean): Promise<void> {
  smsConnected = v;
  try {
    await AsyncStorage.setItem(SMS_KEY, v ? '1' : '0');
  } catch {
    /* best-effort */
  }
}

export function getOverride(merchant: string): string | undefined {
  return overrides[merchantKey(merchant)];
}

export function getLearned(merchant: string): string | undefined {
  return learned[merchantKey(merchant)];
}

/** All learned examples, for (re)building the on-device model. */
export function learnedExamples(): Array<{ merchant: string; cat: string }> {
  return Object.entries(learned).map(([merchant, cat]) => ({ merchant, cat }));
}

/** Record an explicit user correction — wins over rules and the model forever. */
export async function setOverride(merchant: string, cat: string): Promise<void> {
  overrides[merchantKey(merchant)] = cat;
  // A user correction is also the strongest possible training example.
  learned[merchantKey(merchant)] = cat;
  try {
    await AsyncStorage.multiSet([
      [OVERRIDES_KEY, JSON.stringify(overrides)],
      [LEARNED_KEY, JSON.stringify(learned)],
    ]);
  } catch {
    /* best-effort; in-memory copy still applies this session */
  }
}

/** Cache an inferred category so we don't re-run the model for it. */
export async function setLearned(merchant: string, cat: string): Promise<void> {
  learned[merchantKey(merchant)] = cat;
  try {
    await AsyncStorage.setItem(LEARNED_KEY, JSON.stringify(learned));
  } catch {
    /* best-effort */
  }
}
