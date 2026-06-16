import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * On-device persistence for category learning. Two stores:
 *  - overrides: merchant → category the user explicitly set (always wins).
 *  - learned:   merchant → category examples used to train the on-device model.
 * Both live in AsyncStorage and are mirrored in memory for synchronous reads.
 */

const OVERRIDES_KEY = 'khaata.categoryOverrides.v1';
// v2: only user-confirmed corrections are stored here now (model guesses are no
// longer cached), so the old v1 cache of model guesses is intentionally dropped.
const LEARNED_KEY = 'khaata.learnedExamples.v2';
const NAME_KEY = 'khaata.userName.v1';
const EMAIL_KEY = 'khaata.emailConnected.v1';
const SMS_KEY = 'khaata.smsConnected.v1';
const PHOTO_KEY = 'khaata.googlePhoto.v1';

let userName = '';
let emailConnected = false;
let smsConnected = false;
let googlePhoto = '';

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
    const [o, l, n, e, s, p] = await AsyncStorage.multiGet([OVERRIDES_KEY, LEARNED_KEY, NAME_KEY, EMAIL_KEY, SMS_KEY, PHOTO_KEY]);
    overrides = o[1] ? JSON.parse(o[1]) : {};
    learned = l[1] ? JSON.parse(l[1]) : {};
    userName = n[1] || '';
    emailConnected = e[1] === '1';
    smsConnected = s[1] === '1';
    googlePhoto = p[1] || '';
  } catch {
    overrides = {};
    learned = {};
    userName = '';
    emailConnected = false;
    smsConnected = false;
    googlePhoto = '';
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
