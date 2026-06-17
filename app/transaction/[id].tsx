import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal, Pressable, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { router } from 'expo-router';
import { useApp } from '../../src/context';
import { CATEGORIES, getCategoryMap, inr, MONTHS, monthLabel } from '../../src/data';
import { C, F, CARD_SHADOW } from '../../src/theme';
import { Icon } from '../../components/Icon';
import { fetchEmailBody } from '../../src/gmail';
import { llmExtractEmail, EmailExtract } from '../../src/llm';

const SMS_PATHS = ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'];
const MAIL_PATHS = ['M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'm22 7-10 6L2 7'];
const CHECK_PATHS = ['M20 6 9 17l-5-5'];
const BACK_PATHS = ['m15 18-6-6 6-6'];
const CLOCK_PATHS = ['M12 6v6l4 2', 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z'];
const REFRESH_PATHS = ['M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8', 'M21 3v5h-5', 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16', 'M3 21v-5h5'];

export default function TransactionDetail() {
  const { txns, selectedTxnId, recategorize, userName, applyEmailAi } = useApp();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [fullEmail, setFullEmail] = useState<string | null>(null);
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [aiInfo, setAiInfo] = useState<EmailExtract | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(false);
  const [aiElapsed, setAiElapsed] = useState(0); // seconds (live while loading)
  const [aiAttempt, setAiAttempt] = useState(0); // bump to retry

  const txn = txns.find(t => t.id === selectedTxnId) || txns[0];
  const catMap = getCategoryMap();
  const cat = catMap[txn.cat] || catMap.other;
  const isSms = txn.source === 'sms';
  const who = userName || 'there';

  // For email, load the complete original message on demand (kept off the
  // initial sync for speed — only the snippet is stored up front).
  useEffect(() => {
    let alive = true;
    setFullEmail(null);
    if (txn.source === 'email' && txn.gmailId) {
      setLoadingEmail(true);
      fetchEmailBody(txn.gmailId)
        .then(body => { if (alive && body) setFullEmail(body); })
        .finally(() => { if (alive) setLoadingEmail(false); });
    }
    return () => { alive = false; };
  }, [txn.gmailId, txn.source]);

  // Show the LLM-extracted {amount, type, vendor}. Prefer the result already
  // computed during sync (cached on the transaction); otherwise wait for the
  // full email body, send header+body to the LLM, time it, and patch the result
  // back into the transaction (so the amount/category correct everywhere).
  useEffect(() => {
    if (txn.source !== 'email') { setAiInfo(null); setAiError(false); return; }
    // Cached from the background sync — show it with its stored timing.
    if (aiAttempt === 0 && txn.aiDone && (txn.aiType || txn.aiVendor)) {
      setAiInfo({ isTransaction: true, amount: String(txn.amount), amountValue: txn.amount, type: txn.aiType ?? null, vendor: txn.aiVendor ?? null, category: txn.cat, ms: txn.aiMs ?? 0 });
      setAiElapsed((txn.aiMs ?? 0) / 1000);
      setAiError(false);
      return;
    }
    if (loadingEmail) return; // wait for the full body before reading with AI
    const text = fullEmail || txn.raw;
    if (!text) return;
    let alive = true;
    setAiError(false);
    setAiInfo(null);
    setAiLoading(true);
    setAiElapsed(0);
    const startedAt = Date.now();
    const ticker = setInterval(() => { if (alive) setAiElapsed((Date.now() - startedAt) / 1000); }, 100);
    llmExtractEmail(text)
      .then(r => {
        if (!alive) return;
        if (r) {
          setAiInfo(r);
          setAiElapsed(r.ms / 1000);
          applyEmailAi(txn.id, r); // correct the amount/category app-wide + cache
        } else {
          setAiError(true);
          setAiElapsed((Date.now() - startedAt) / 1000);
        }
      })
      .finally(() => { if (alive) { clearInterval(ticker); setAiLoading(false); } });
    return () => { alive = false; clearInterval(ticker); };
  }, [fullEmail, loadingEmail, txn.id, txn.source, aiAttempt]);

  // Prefer the full fetched email, then the stored snippet, then a synthesised
  // message for demo data with no raw.
  const rawMessage = (txn.source === 'email' && fullEmail)
    ? fullEmail
    : txn.raw
      ? txn.raw
      : isSms
        ? `HDFC Bank: Rs.${txn.amount}.00 debited from A/c XX4821 on ${txn.day}-${MONTHS[txn.month]}-${String(txn.year).slice(-2)} to ${txn.merchant} via UPI. Ref 5${txn.id}90213. Avl Bal Rs.18,240. Not you? Call 18002586161.`
        : `Hi ${who}, your payment of Rs ${txn.amount} to ${txn.merchant} was successful. Order/Txn ID: TXN${txn.id}77K2QF. Thank you for using ${txn.merchant}.`;

  const account = isSms
    ? (txn.sender ? `SMS · ${txn.sender}` : 'HDFC Bank •••• 4821')
    : (txn.sender ? `Gmail · ${txn.sender}` : 'Gmail');
  const srcFrom = isSms
    ? (txn.sender || 'VM-HDFCBK')
    : (txn.sender || txn.merchant);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
            <Icon paths={BACK_PATHS} color={C.dark} size={20} strokeWidth={2.4} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Transaction</Text>
        </View>

        {/* Hero */}
        <View style={styles.hero}>
          <View style={[styles.heroIcon, { backgroundColor: cat.bg }]}>
            <Icon paths={cat.paths} color={cat.color} size={32} />
          </View>
          <Text style={styles.heroMerchant}>{txn.merchant}</Text>
          <Text style={styles.heroAmount}>− {inr(txn.amount)}</Text>
          <Text style={styles.heroDate}>{txn.day} {monthLabel(txn.month, txn.year)} · {txn.time}</Text>
        </View>

        {/* Details card */}
        <View style={styles.detailCard}>
          <TouchableOpacity style={styles.detailRow} onPress={() => setPickerOpen(true)} activeOpacity={0.8}>
            <Text style={styles.detailLabel}>Category</Text>
            <View style={{ flex: 1 }} />
            <View style={[styles.catTag, { backgroundColor: cat.bg }]}>
              <Text style={[styles.catTagText, { color: cat.color }]}>{cat.name}</Text>
            </View>
            <Icon paths={['M5 12h14', 'm12 5 7 7-7 7']} color="#C2C2D2" size={18} strokeWidth={2.2} />
          </TouchableOpacity>
          <View style={[styles.detailRow, styles.borderTop]}>
            <Text style={styles.detailLabel}>Paid via</Text>
            <View style={{ flex: 1 }} />
            <Text style={styles.detailValue}>{account}</Text>
          </View>
          <View style={[styles.detailRow, styles.borderTop, { borderBottomWidth: 0 }]}>
            <Text style={styles.detailLabel}>Detected from</Text>
            <View style={{ flex: 1 }} />
            <View style={[styles.srcBadge, isSms ? styles.srcSms : styles.srcEmail]}>
              <Text style={[styles.srcText, isSms ? styles.srcSmsText : styles.srcEmailText]}>
                {isSms ? 'SMS' : 'Email'}
              </Text>
            </View>
          </View>
        </View>

        {/* Original message */}
        <Text style={styles.msgLabel}>Original message</Text>
        <View style={styles.msgCard}>
          <View style={styles.msgFrom}>
            <View style={[styles.msgSourceIcon, isSms ? { backgroundColor: '#E5EEFF' } : { backgroundColor: '#FFE8E6' }]}>
              <Icon paths={isSms ? SMS_PATHS : MAIL_PATHS} color={isSms ? '#3B82F6' : '#EA4335'} size={16} />
            </View>
            <Text style={styles.msgFromText}>{srcFrom}</Text>
          </View>
          <Text style={styles.msgBody}>{rawMessage}</Text>
          {loadingEmail && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <ActivityIndicator size="small" color={C.primary} />
              <Text style={[styles.msgBody, { marginTop: 0 }]}>Loading full email…</Text>
            </View>
          )}
        </View>
        {/* AI-extracted details (email only) */}
        {txn.source === 'email' && (aiLoading || aiInfo || aiError) && (
          <>
            <Text style={styles.msgLabel}>AI extracted</Text>
            <View style={styles.msgCard}>
              {aiLoading && !aiInfo ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ActivityIndicator size="small" color={C.primary} />
                  <Text style={styles.msgBody}>Reading the email with AI… {aiElapsed.toFixed(1)}s</Text>
                </View>
              ) : aiInfo ? (
                <View style={{ gap: 12 }}>
                  <View style={styles.aiRow}>
                    <Text style={styles.aiLabel}>Amount</Text>
                    <Text style={styles.aiValue}>{aiInfo.amount ? (String(aiInfo.amount).startsWith('₹') ? aiInfo.amount : `₹${aiInfo.amount}`) : '—'}</Text>
                  </View>
                  <View style={styles.aiRow}>
                    <Text style={styles.aiLabel}>Transaction type</Text>
                    <Text style={styles.aiValue}>{aiInfo.type || '—'}</Text>
                  </View>
                  <View style={styles.aiRow}>
                    <Text style={styles.aiLabel}>Vendor / for</Text>
                    <Text style={[styles.aiValue, { flexShrink: 1, textAlign: 'right' }]} numberOfLines={2}>{aiInfo.vendor || '—'}</Text>
                  </View>
                  {aiElapsed > 0 && (
                    <View style={styles.aiTimeRow}>
                      <Icon paths={CLOCK_PATHS} color="#A0A0B5" size={13} strokeWidth={2} />
                      <Text style={styles.aiTimeText}>Generated in {aiElapsed.toFixed(1)}s</Text>
                    </View>
                  )}
                </View>
              ) : aiError ? (
                <View style={{ gap: 12 }}>
                  <Text style={styles.msgBody}>Couldn't reach the AI{aiElapsed > 0 ? ` after ${aiElapsed.toFixed(1)}s` : ''}. Check your connection and try again.</Text>
                  <TouchableOpacity style={styles.aiRetry} onPress={() => setAiAttempt(a => a + 1)} activeOpacity={0.85}>
                    <Icon paths={REFRESH_PATHS} color={C.primary} size={15} strokeWidth={2.1} />
                    <Text style={styles.aiRetryText}>Retry</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          </>
        )}

        <View style={styles.autoRow}>
          <Text style={styles.autoText}>Auto-categorised by Khaata · tap category to fix</Text>
        </View>
      </ScrollView>

      {/* Recategorize modal */}
      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setPickerOpen(false)}>
          <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Change category</Text>
            <Text style={styles.sheetSub}>Khaata will remember this for {txn.merchant}</Text>
            <View style={styles.pickerGrid}>
              {CATEGORIES.map(c => {
                const isActive = txn.cat === c.key;
                return (
                  <TouchableOpacity
                    key={c.key}
                    style={[styles.pickerCell, isActive && styles.pickerCellActive]}
                    onPress={() => { recategorize(txn.id, c.key); setPickerOpen(false); }}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.pickerIcon, { backgroundColor: c.bg }]}>
                      <Icon paths={c.paths} color={c.color} size={20} />
                    </View>
                    <Text style={styles.pickerLabel}>{c.short}</Text>
                    {isActive && (
                      <View style={styles.checkBadge}>
                        <Icon paths={CHECK_PATHS} color="#fff" size={11} strokeWidth={3.5} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 20, paddingBottom: 30, paddingTop: 6 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 6, paddingBottom: 4 },
  backBtn: {
    width: 42, height: 42, borderRadius: 14, borderWidth: 1.5, borderColor: C.border,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontFamily: F.extraBold, color: C.dark },
  hero: { alignItems: 'center', marginTop: 18 },
  heroIcon: { width: 76, height: 76, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  heroMerchant: { fontSize: 18, fontFamily: F.extraBold, color: C.dark, marginTop: 14 },
  heroAmount: { fontSize: 38, fontFamily: F.extraBold, color: C.dark, letterSpacing: -1.2, marginTop: 6 },
  heroDate: { fontSize: 13, fontFamily: F.semiBold, color: C.muted, marginTop: 4 },
  detailCard: { backgroundColor: '#fff', borderRadius: 22, paddingHorizontal: 18, marginTop: 24, ...CARD_SHADOW },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F2F2F7' },
  borderTop: {},
  detailLabel: { fontSize: 13.5, fontFamily: F.semiBold, color: C.muted },
  detailValue: { fontSize: 13.5, fontFamily: F.bold, color: C.dark },
  catTag: { paddingVertical: 6, paddingHorizontal: 13, borderRadius: 12 },
  catTagText: { fontSize: 13, fontFamily: F.bold },
  srcBadge: { paddingVertical: 5, paddingHorizontal: 11, borderRadius: 10 },
  srcSms: { backgroundColor: '#E5EEFF' },
  srcEmail: { backgroundColor: '#FFE8E6' },
  srcText: { fontSize: 12, fontFamily: F.bold },
  srcSmsText: { color: '#3B82F6' },
  srcEmailText: { color: '#EA4335' },
  msgLabel: { fontSize: 12, fontFamily: F.bold, color: '#A0A0B5', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 22, marginBottom: 10, paddingLeft: 2 },
  msgCard: { backgroundColor: '#fff', borderRadius: 20, padding: 16, borderWidth: 1.5, borderColor: C.border },
  msgFrom: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  msgSourceIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  msgFromText: { fontSize: 12.5, fontFamily: F.bold, color: C.text },
  msgBody: { fontSize: 13, fontFamily: F.medium, color: '#6A6A82', lineHeight: 21 },
  aiRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  aiLabel: { fontSize: 13, fontFamily: F.semiBold, color: C.muted },
  aiValue: { fontSize: 13.5, fontFamily: F.bold, color: C.dark },
  aiTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, paddingTop: 11, borderTopWidth: 1, borderTopColor: '#F2F2F7' },
  aiTimeText: { fontSize: 12, fontFamily: F.semiBold, color: '#A0A0B5' },
  aiRetry: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 7, paddingVertical: 9, paddingHorizontal: 15, borderRadius: 12, backgroundColor: C.primarySoft },
  aiRetryText: { fontSize: 13, fontFamily: F.bold, color: C.primary },
  autoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 14 },
  autoText: { fontSize: 12, fontFamily: F.semiBold, color: '#A0A0B5' },
  overlay: { flex: 1, backgroundColor: 'rgba(20,18,40,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 30 },
  sheetHandle: { width: 42, height: 5, borderRadius: 3, backgroundColor: '#E2E2EC', alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 17, fontFamily: F.extraBold, color: C.dark, textAlign: 'center', marginBottom: 4 },
  sheetSub: { fontSize: 12.5, fontFamily: F.medium, color: C.muted, textAlign: 'center', marginBottom: 18 },
  pickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 11 },
  pickerCell: {
    width: '30%', flexGrow: 1, alignItems: 'center', gap: 8, paddingVertical: 15, paddingHorizontal: 6,
    borderRadius: 18, backgroundColor: '#F7F7FC', borderWidth: 1.5, borderColor: 'transparent',
  },
  pickerCellActive: { backgroundColor: C.primarySoft, borderColor: C.primary },
  pickerIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  pickerLabel: { fontSize: 11.5, fontFamily: F.bold, color: C.text, textAlign: 'center', lineHeight: 15 },
  checkBadge: {
    position: 'absolute', top: 8, right: 8, width: 18, height: 18, borderRadius: 9,
    backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center',
  },
});
