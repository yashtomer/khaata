import React, { createContext, useContext, useEffect, useState } from 'react';
import { INITIAL_TXNS, Transaction } from './data';
import { importSmsTransactions } from './sms';
import {
  setOverride, merchantKey, loadCategoryData, learnedExamples,
  getUserName, setUserName as persistUserName, getOverride, getLearned, setLearned,
  getEmailConnectedFlag, setEmailConnectedFlag, getSmsConnectedFlag, setSmsConnectedFlag,
  getGooglePhoto, setGooglePhoto,
} from './categoryStore';
import { teachCategorizer, initCategorizer } from './categorizer';
import { fetchGmailTransactions, getGmailToken, googleSignOut, getGoogleProfile } from './gmail';
import { llmCategorize } from './llm';

/** Merge email transactions into existing ones, dropping same-day same-amount
 * duplicates (an SMS and email for one purchase), then renumber by date. */
function mergeDedupe(base: Transaction[], email: Transaction[]): Transaction[] {
  const out = [...base];
  for (const e of email) {
    const dup = base.some(
      b => b.amount === e.amount && b.day === e.day && b.month === e.month && b.year === e.year
    );
    if (!dup) out.push(e);
  }
  return out
    .sort((a, b) => b.year - a.year || b.month - a.month || b.day - a.day)
    .map((t, i) => ({ ...t, id: i + 1 }));
}

export type SmsStatus = 'idle' | 'loading' | 'ok' | 'denied' | 'unsupported';

interface AppState {
  emailConnected: boolean;
  smsConnected: boolean;
  txns: Transaction[];
  /** Whether the current transactions came from real device SMS or the demo set. */
  usingRealSms: boolean;
  smsStatus: SmsStatus;
  selectedTxnId: number;
  filter: string;
  setEmailConnected: (v: boolean) => void;
  setSelectedTxnId: (id: number) => void;
  setFilter: (f: string) => void;
  recategorize: (txnId: number, catKey: string) => void;
  /** Requests SMS permission, reads + parses the inbox, loads real spends. */
  connectSms: () => Promise<SmsStatus>;
  disconnectSms: () => void;
  /** Fetch + parse Gmail payment emails (given an OAuth token) and merge them
   * in, de-duplicating against SMS. Returns 'ok' or 'error'. */
  connectEmail: (accessToken: string) => Promise<'ok' | 'error'>;
  /** Sign in to Google (interactive = show picker, false = silent/restore) and
   * load Gmail transactions. Returns 'ok' or 'error'. */
  linkEmail: (interactive: boolean) => Promise<'ok' | 'error'>;
  /** Sign out of Google and drop email transactions. */
  disconnectEmail: () => Promise<void>;
  /** True once persisted session state has been restored at startup. */
  hydrated: boolean;
  /** Display name shown on the dashboard; empty until the user sets it. */
  userName: string;
  setUserName: (name: string) => void;
  /** Google profile photo URL (shown as the avatar) once signed in. */
  photoUrl: string;
  /** When set, the Activity screen is scoped to this calendar month. */
  monthFilter: { year: number; month: number } | null;
  setMonthFilter: (m: { year: number; month: number } | null) => void;
}

const AppContext = createContext<AppState>({} as AppState);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [emailConnected, setEmailConnected] = useState(false);
  const [smsConnected, setSmsConnected] = useState(false);
  const [usingRealSms, setUsingRealSms] = useState(false);
  const [smsStatus, setSmsStatus] = useState<SmsStatus>('idle');
  const [txns, setTxns] = useState<Transaction[]>(INITIAL_TXNS.map(t => ({ ...t })));
  const [selectedTxnId, setSelectedTxnId] = useState(1);
  const [filter, setFilter] = useState('all');
  const [userName, setUserNameState] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [monthFilter, setMonthFilter] = useState<{ year: number; month: number } | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const setUserName = (name: string) => {
    setUserNameState(name.trim());
    void persistUserName(name);
  };

  const connectSms = async (): Promise<SmsStatus> => {
    setSmsStatus('loading');
    try {
      const res = await importSmsTransactions();
      if (res.status === 'ok' && res.txns.length > 0) {
        setTxns(res.txns);
        setUsingRealSms(true);
        setSmsConnected(true);
        void setSmsConnectedFlag(true);
        setSelectedTxnId(res.txns[0].id);
        setSmsStatus('ok');
        return 'ok';
      }
      if (res.status === 'unsupported' || res.txns.length === 0) {
        setSmsConnected(true);
        void setSmsConnectedFlag(true);
        setSmsStatus('unsupported');
        return 'unsupported';
      }
      setSmsStatus('denied');
      return 'denied';
    } catch {
      setSmsConnected(true);
      void setSmsConnectedFlag(true);
      setSmsStatus('unsupported');
      return 'unsupported';
    }
  };

  const disconnectSms = () => {
    setSmsConnected(false);
    setUsingRealSms(false);
    setSmsStatus('idle');
    void setSmsConnectedFlag(false);
    // Drop SMS transactions, keep any email ones.
    setTxns(prev => {
      const kept = prev.filter(t => t.source !== 'sms');
      return kept.length ? kept : INITIAL_TXNS.map(t => ({ ...t }));
    });
  };

  const connectEmail = async (accessToken: string): Promise<'ok' | 'error'> => {
    try {
      await loadCategoryData();
      initCategorizer(learnedExamples());
      let emailTxns = await fetchGmailTransactions(accessToken);
      // Apply saved overrides and learned categories first.
      emailTxns = emailTxns.map(t => ({ ...t, cat: getOverride(t.merchant) || getLearned(t.merchant) || t.cat }));
      // Show emails immediately with local categories — don't block on the LLM.
      setTxns(prev => mergeDedupe(usingRealSms ? prev.filter(t => t.source !== 'email') : [], emailTxns));
      setUsingRealSms(true);
      setEmailConnected(true);
      void setEmailConnectedFlag(true);

      // Pull the Google profile photo (and name, if unset) for the avatar.
      void (async () => {
        const prof = await getGoogleProfile();
        if (prof?.photo) { setPhotoUrl(prof.photo); void setGooglePhoto(prof.photo); }
        if (prof?.name && !getUserName()) { setUserNameState(prof.name); void persistUserName(prof.name); }
      })();

      // Upgrade senders left as "bills" via the cloud LLM in the background,
      // then patch them into state (so the connect UI isn't blocked on it).
      const unknown = [...new Set(emailTxns.filter(t => t.cat === 'bills').map(t => t.merchant))];
      if (unknown.length) {
        void (async () => {
          const map = await llmCategorize(unknown);
          if (!Object.keys(map).length) return;
          for (const [m, c] of Object.entries(map)) {
            void setLearned(m, c);
            teachCategorizer(m, c);
          }
          setTxns(prev => prev.map(t =>
            t.source === 'email' && t.cat === 'bills' && map[t.merchant]
              ? { ...t, cat: map[t.merchant] }
              : t
          ));
        })();
      }
      return 'ok';
    } catch {
      return 'error';
    }
  };

  const linkEmail = async (interactive: boolean): Promise<'ok' | 'error'> => {
    const token = await getGmailToken(interactive);
    if (!token) return 'error';
    return connectEmail(token);
  };

  const disconnectEmail = async (): Promise<void> => {
    await googleSignOut();
    setEmailConnected(false);
    void setEmailConnectedFlag(false);
    setPhotoUrl('');
    void setGooglePhoto('');
    setTxns(prev => prev.filter(t => t.source !== 'email'));
  };

  const recategorize = (txnId: number, catKey: string) => {
    setTxns(prev => {
      const target = prev.find(t => t.id === txnId);
      if (!target) return prev;
      const key = merchantKey(target.merchant);
      void setOverride(target.merchant, catKey);
      teachCategorizer(target.merchant, catKey);
      return prev.map(t => (merchantKey(t.merchant) === key ? { ...t, cat: catKey } : t));
    });
  };

  // Restore persisted session (learning, name, and SMS/Gmail connections) at
  // startup — so the user isn't asked to reconnect or re-authenticate each launch.
  useEffect(() => {
    (async () => {
      await loadCategoryData();
      initCategorizer(learnedExamples());
      setUserNameState(getUserName());
      setPhotoUrl(getGooglePhoto());
      if (getSmsConnectedFlag()) {
        try { await connectSms(); } catch { /* ignore */ }
      }
      if (getEmailConnectedFlag()) {
        try { await linkEmail(false); } catch { /* ignore */ }
      }
      setHydrated(true);
    })();
  }, []);

  return (
    <AppContext.Provider value={{
      emailConnected, smsConnected, txns, usingRealSms, smsStatus, selectedTxnId, filter,
      setEmailConnected, setSelectedTxnId, setFilter, recategorize, connectSms, disconnectSms,
      connectEmail, linkEmail, disconnectEmail, hydrated,
      userName, setUserName, photoUrl, monthFilter, setMonthFilter,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
