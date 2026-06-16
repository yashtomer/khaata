import { Platform, PermissionsAndroid } from 'react-native';
import { readInbox, isSmsReadingSupported } from '../modules/sms-reader';
import { extractSpends, ruleClassify } from './smsParser';
import { Transaction } from './data';
import { loadCategoryData, getOverride, getLearned, learnedExamples } from './categoryStore';
import { initCategorizer, classifyMerchant } from './categorizer';

function fmtTime(d: Date): string {
  let h = d.getHours();
  const min = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${min} ${ampm}`;
}

export interface SmsImportResult {
  status: 'ok' | 'denied' | 'unsupported';
  txns: Transaction[];
}

/** Ask the user for the READ_SMS runtime permission (Android only). */
export async function requestSmsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.READ_SMS,
    {
      title: 'Allow Khaata to read SMS',
      message:
        'Khaata reads your bank & UPI transaction messages to auto-track spending. ' +
        'It never reads OTPs or personal chats and nothing leaves your phone.',
      buttonPositive: 'Allow',
      buttonNegative: 'Not now',
    }
  );
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

/**
 * End-to-end: request permission, read the inbox, parse spend messages, and
 * return this month's transactions. Falls back gracefully off-device.
 */
export async function importSmsTransactions(): Promise<SmsImportResult> {
  if (Platform.OS !== 'android' || !isSmsReadingSupported) {
    return { status: 'unsupported', txns: [] };
  }
  const granted = await requestSmsPermission();
  if (!granted) return { status: 'denied', txns: [] };

  // Read a deep slice of the inbox so a full year of spends is covered.
  const raw = await readInbox(3000);

  // Keep the whole current year.
  const now = new Date();
  const thisYear = raw.filter(s => new Date(s.date || 0).getFullYear() === now.getFullYear());

  // Load persisted learning and (re)build the on-device model from seeds + it.
  await loadCategoryData();
  initCategorizer(learnedExamples());

  const drafts = extractSpends(thisYear);

  // Resolve each spend's category: user override → rule → on-device model →
  // "bills". Inferred categories are cached so the model isn't re-run for them.
  const txns: Transaction[] = drafts.map((d, i) => {
    let cat = getOverride(d.merchant)
      || getLearned(d.merchant)
      || ruleClassify(d.merchant, d.body)
      || undefined;

    if (!cat) {
      // The on-device model is deterministic, so its guesses are stable across
      // reloads without caching — and not caching means seed/guard improvements
      // take effect immediately instead of being pinned to an old guess.
      const guess = classifyMerchant(d.merchant);
      if (guess) cat = guess.cat;
    }

    return {
      id: i + 1,
      merchant: d.merchant,
      cat: cat || 'bills',
      amount: d.amount,
      day: d.when.getDate(),
      month: d.when.getMonth(),
      year: d.when.getFullYear(),
      time: fmtTime(d.when),
      source: 'sms' as const,
      raw: d.body,
      sender: d.address,
    };
  });

  return { status: 'ok', txns };
}
