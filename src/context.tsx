import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { AppState as RNAppState } from 'react-native';
import { INITIAL_TXNS, Transaction } from './data';
import { importSmsTransactions } from './sms';
import { ruleClassify } from './smsParser';
import {
  setOverride, merchantKey, loadCategoryData, learnedExamples,
  getUserName, setUserName as persistUserName, getOverride, getLearned, setLearned,
  getEmailConnectedFlag, setEmailConnectedFlag, getSmsConnectedFlag, setSmsConnectedFlag,
  getGooglePhoto, setGooglePhoto, getCachedEmail, setCachedEmail, clearCachedEmail,
  getAutoSync, setAutoSync as persistAutoSync,
  getLoggedInFlag, setLoggedInFlag,
} from './categoryStore';
import { teachCategorizer, initCategorizer } from './categorizer';
import { fetchGmailTransactions, fetchEmailBodies, getGmailToken, googleSignOut, getGoogleProfile, loginGoogle } from './gmail';
import { llmExtractEmail, llmCategorizeContext, EmailExtract } from './llm';

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
  /** Apply an on-demand LLM extraction (from the detail view) to a transaction:
   * corrects the amount/category and caches the AI fields so it isn't re-run. */
  applyEmailAi: (txnId: number, ai: EmailExtract) => void;
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
  /** Whether the user has signed in with Google (gates the login screen). */
  loggedIn: boolean;
  /** Log in with Google (account picker): authenticates + loads the profile,
   * but doesn't sync email yet (that's done from the drawer). */
  login: () => Promise<'ok' | 'error'>;
  /** Log out of Google and reset to the signed-out state. */
  logout: () => Promise<void>;
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
  /** Auto-sync: when on, new Gmail/SMS are fetched automatically on launch and
   * when the app returns to the foreground. */
  autoSync: boolean;
  setAutoSync: (v: boolean) => void;
}

const AppContext = createContext<AppState>({} as AppState);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [emailConnected, setEmailConnected] = useState(false);
  const [smsConnected, setSmsConnected] = useState(false);
  const [usingRealSms, setUsingRealSms] = useState(false);
  // A ref mirror of usingRealSms, so async callbacks (e.g. connectEmail invoked
  // from the mount-time restore effect) read the CURRENT value, not the stale
  // closure value — otherwise the email merge wipes real SMS transactions.
  const usingRealSmsRef = useRef(false);
  const markRealSms = (v: boolean) => { usingRealSmsRef.current = v; setUsingRealSms(v); };
  const [smsStatus, setSmsStatus] = useState<SmsStatus>('idle');
  const [txns, setTxns] = useState<Transaction[]>(INITIAL_TXNS.map(t => ({ ...t })));
  const [selectedTxnId, setSelectedTxnId] = useState(1);
  const [filter, setFilter] = useState('all');
  const [userName, setUserNameState] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [monthFilter, setMonthFilter] = useState<{ year: number; month: number } | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [autoSync, setAutoSyncState] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const emailBusyRef = useRef(false);
  const lastResumeSync = useRef(0);
  const smsCatRunning = useRef(false); // guards the SMS AI categorization from running concurrently

  const setAutoSync = (v: boolean) => {
    setAutoSyncState(v);
    void persistAutoSync(v);
    // Turning it on triggers an immediate catch-up sync of anything connected.
    if (v) {
      if (getEmailConnectedFlag()) void linkEmail(false);
      if (getSmsConnectedFlag()) void connectSms();
    }
  };

  const setUserName = (name: string) => {
    setUserNameState(name.trim());
    void persistUserName(name);
  };

  // Background: use the LLM (with SMS body context) to categorise EVERY SMS the
  // built-in keyword rules can't identify with confidence (ruleClassify == null)
  // — i.e. all the opaque UPI payees, transfers, and misses like a school-fee
  // transfer. Results are cached as "learned" per merchant, so it's one-time.
  const categorizeSmsBackground = async (smsTxns: Transaction[]) => {
    if (smsCatRunning.current) return; // never run two passes at once (overloads the LLM)
    const need = smsTxns.filter(
      t => !getOverride(t.merchant) && !getLearned(t.merchant) && ruleClassify(t.merchant, t.raw || '') == null
    );
    if (!need.length) return;
    const seen = new Set<string>();
    const items: Array<{ id: number; text: string }> = [];
    for (const t of need) {
      const key = merchantKey(t.merchant);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ id: t.id, text: `${t.merchant} | ${(t.raw || '').slice(0, 160)}` });
    }
    smsCatRunning.current = true;
    try {
      const result = await llmCategorizeContext(items);
      const idToMerchant = new Map(need.map(t => [t.id, t.merchant]));
      const merchantCat = new Map<string, string>();
      for (const [idStr, cat] of Object.entries(result)) {
        const m = idToMerchant.get(Number(idStr));
        if (m) { merchantCat.set(merchantKey(m), cat); void setLearned(m, cat); }
      }
      if (!merchantCat.size) return;
      setTxns(prev => prev.map(t => {
        if (t.source !== 'sms' || getOverride(t.merchant)) return t;
        const c = merchantCat.get(merchantKey(t.merchant));
        return c ? { ...t, cat: c } : t;
      }));
    } finally {
      smsCatRunning.current = false;
    }
  };

  const connectSms = async (): Promise<SmsStatus> => {
    setSmsStatus('loading');
    try {
      const res = await importSmsTransactions();
      if (res.status === 'ok' && res.txns.length > 0) {
        setTxns(res.txns);
        markRealSms(true);
        setSmsConnected(true);
        void setSmsConnectedFlag(true);
        setSelectedTxnId(res.txns[0].id);
        setSmsStatus('ok');
        void categorizeSmsBackground(res.txns);
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
    markRealSms(false);
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

      // Incremental sync: reuse cached email transactions and only fetch emails
      // newer than the last sync (with a 2-day overlap so nothing is missed),
      // so launches after the first are fast.
      const cached = await getCachedEmail();
      const afterDate = cached.sync ? new Date(cached.sync - 2 * 86400000) : undefined;
      const fresh = await fetchGmailTransactions(accessToken, 80, afterDate);

      // Merge cached + fresh by Gmail id (fresh wins), then apply overrides/learned.
      const byId = new Map<string, Transaction>();
      for (const t of cached.txns as Transaction[]) if (t.gmailId) byId.set(t.gmailId, t);
      for (const t of fresh) if (t.gmailId) byId.set(t.gmailId, t);
      let emailTxns = [...byId.values()].map(t => ({
        ...t,
        cat: getOverride(t.merchant) || getLearned(t.merchant) || t.cat,
      }));

      // Keep real SMS transactions from the live state (ref, not stale closure)
      // and merge email on top — otherwise a stale `false` wipes all SMS.
      setTxns(prev => mergeDedupe(usingRealSmsRef.current ? prev.filter(t => t.source !== 'email') : [], emailTxns));
      markRealSms(true);
      setEmailConnected(true);
      void setEmailConnectedFlag(true);
      void setCachedEmail(emailTxns, Date.now());

      // Pull the Google profile photo + name for the avatar (Gmail is the source
      // of truth for the display name — there's no manual name editing).
      void (async () => {
        const prof = await getGoogleProfile();
        if (prof?.photo) { setPhotoUrl(prof.photo); void setGooglePhoto(prof.photo); }
        if (prof?.name) { setUserNameState(prof.name); void persistUserName(prof.name); }
      })();

      // Background: send each new email to the LLM for the accurate net amount,
      // category, type, and vendor — then patch them into state and the cache.
      // (User overrides still win.) Runs after the fast initial display.
      const needAi = emailTxns.filter(t => t.gmailId && !t.aiDone);
      if (needAi.length) {
        void (async () => {
          const bodies = await fetchEmailBodies(needAi.map(t => t.gmailId as string));
          const results: Record<string, any> = {};
          let idx = 0;
          await Promise.all(
            Array.from({ length: 3 }, async () => {
              while (idx < needAi.length) {
                const t = needAi[idx++];
                const ai = await llmExtractEmail(bodies[t.gmailId as string] || t.raw || '');
                if (ai) results[t.gmailId as string] = ai;
              }
            })
          );
          const apply = (t: Transaction): Transaction | null => {
            if (t.source !== 'email' || !t.gmailId) return t;
            const ai = results[t.gmailId];
            // Leave aiDone false on failure so the next sync retries it (rather
            // than locking in the wrong regex-fallback amount forever).
            if (!ai) return t;
            // Drop if the LLM says it's not a money movement (alert/promo/OTP),
            // or if no amount can be determined anywhere (AI null + no regex
            // amount) — an email with no amount isn't a usable transaction.
            const amount = ai.amountValue ?? (t.amount > 0 ? t.amount : null);
            if (ai.isTransaction === false || amount == null) return null;
            const cat = getOverride(t.merchant) || ai.category || t.cat;
            const vendor = ai.vendor && String(ai.vendor).trim().length >= 2 ? String(ai.vendor).trim() : null;
            return {
              ...t,
              merchant: vendor || t.merchant,
              amount,
              cat,
              aiType: ai.type ?? null,
              aiVendor: ai.vendor ?? null,
              aiMs: ai.ms,
              aiDone: true,
            };
          };
          let updatedEmail: Transaction[] = [];
          setTxns(prev => {
            const next = prev.map(apply).filter(Boolean) as Transaction[];
            updatedEmail = next.filter(t => t.source === 'email');
            return next;
          });
          void setCachedEmail(updatedEmail, Date.now());
        })();
      }
      return 'ok';
    } catch {
      return 'error';
    }
  };

  /** Show the last-synced Gmail transactions from cache without any network
   * fetch (used at launch when auto-sync is off). */
  const loadEmailCache = async (): Promise<void> => {
    const cached = await getCachedEmail();
    if (!cached.txns?.length) return;
    await loadCategoryData();
    const emailTxns = (cached.txns as Transaction[]).map(t => ({
      ...t,
      cat: getOverride(t.merchant) || getLearned(t.merchant) || t.cat,
    }));
    setTxns(prev => mergeDedupe(prev.filter(t => t.source === 'sms'), emailTxns));
    setEmailConnected(true);
    // Refresh the avatar photo from the cached value (no network).
    const photo = getGooglePhoto();
    if (photo) setPhotoUrl(photo);
  };

  const linkEmail = async (interactive: boolean): Promise<'ok' | 'error'> => {
    if (emailBusyRef.current) return 'ok'; // a connect/restore is already running
    emailBusyRef.current = true;
    try {
      const t = Date.now();
      const token = await getGmailToken(interactive);
      console.log(`[gmail] token (${interactive ? 'interactive' : 'silent'}) in ${Date.now() - t}ms`);
      if (!token) return 'error';
      return await connectEmail(token);
    } finally {
      emailBusyRef.current = false;
    }
  };

  // Disconnect the email SOURCE only: drop email transactions + cache, but keep
  // the user signed in (full sign-out is `logout`). Lets them remove email data
  // from the sidebar without losing their account.
  const disconnectEmail = async (): Promise<void> => {
    setEmailConnected(false);
    void setEmailConnectedFlag(false);
    void clearCachedEmail();
    setTxns(prev => prev.filter(t => t.source !== 'email'));
  };

  /** Log in with Google: authenticate + load the profile (name/photo). Email is
   * synced later from the drawer, so this doesn't fetch any messages. */
  const login = async (): Promise<'ok' | 'error'> => {
    const prof = await loginGoogle();
    if (!prof) return 'error';
    setLoggedIn(true);
    void setLoggedInFlag(true);
    if (prof.photo) { setPhotoUrl(prof.photo); void setGooglePhoto(prof.photo); }
    if (prof.name) { setUserNameState(prof.name); void persistUserName(prof.name); }
    return 'ok';
  };

  /** Log out of Google and reset everything to the signed-out demo state. */
  const logout = async (): Promise<void> => {
    await googleSignOut();
    setLoggedIn(false);
    void setLoggedInFlag(false);
    setEmailConnected(false);
    void setEmailConnectedFlag(false);
    setSmsConnected(false);
    void setSmsConnectedFlag(false);
    markRealSms(false);
    void clearCachedEmail();
    setPhotoUrl('');
    void setGooglePhoto('');
    setUserNameState('');
    void persistUserName('');
    setTxns(INITIAL_TXNS.map(t => ({ ...t })));
  };

  /** Patch a transaction with an on-demand LLM extraction (detail view): fixes
   * the amount + category and stores the AI fields so they're cached. */
  const applyEmailAi = (txnId: number, ai: EmailExtract) => {
    let updatedEmail: Transaction[] = [];
    setTxns(prev => {
      const next = prev.map(t => {
        if (t.id !== txnId || t.source !== 'email') return t;
        const cat = getOverride(t.merchant) || ai.category || t.cat;
        const vendor = ai.vendor && String(ai.vendor).trim().length >= 2 ? String(ai.vendor).trim() : null;
        return {
          ...t,
          merchant: vendor || t.merchant,
          amount: ai.amountValue ?? t.amount,
          cat,
          aiType: ai.type ?? null,
          aiVendor: ai.vendor ?? null,
          aiMs: ai.ms,
          aiDone: true,
        };
      });
      updatedEmail = next.filter(t => t.source === 'email');
      return next;
    });
    void setCachedEmail(updatedEmail, Date.now());
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
  // When auto-sync is on, fetch new messages; when off, just show cached data.
  useEffect(() => {
    (async () => {
      await loadCategoryData();
      initCategorizer(learnedExamples());
      setUserNameState(getUserName());
      setPhotoUrl(getGooglePhoto());
      setLoggedIn(getLoggedInFlag());
      const auto = getAutoSync();
      setAutoSyncState(auto);
      if (getSmsConnectedFlag()) {
        // SMS reads are local + instant, so always restore them on launch.
        try { await connectSms(); } catch { /* ignore */ }
      }
      if (getEmailConnectedFlag()) {
        try {
          if (auto) await linkEmail(false);   // fetch anything new
          else await loadEmailCache();         // show last-synced cache only
        } catch { /* ignore */ }
      }
      setHydrated(true);
    })();
  }, []);

  // Auto-sync on return to foreground (throttled to once a minute) so new
  // messages appear without a manual refresh.
  useEffect(() => {
    const sub = RNAppState.addEventListener('change', state => {
      if (state !== 'active' || !getAutoSync()) return;
      const now = Date.now();
      if (now - lastResumeSync.current < 60000) return;
      lastResumeSync.current = now;
      if (getEmailConnectedFlag()) void linkEmail(false);
      if (getSmsConnectedFlag()) void connectSms();
    });
    return () => sub.remove();
  }, []);

  return (
    <AppContext.Provider value={{
      emailConnected, smsConnected, txns, usingRealSms, smsStatus, selectedTxnId, filter,
      setEmailConnected, setSelectedTxnId, setFilter, recategorize, applyEmailAi, connectSms, disconnectSms,
      connectEmail, linkEmail, disconnectEmail, loggedIn, login, logout, hydrated,
      userName, setUserName, photoUrl, monthFilter, setMonthFilter,
      autoSync, setAutoSync,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
