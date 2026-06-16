import React, { useMemo, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal, TextInput, Pressable, Platform, PanResponder, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useApp } from '../../src/context';
import { CATEGORIES, BUDGETS, TREND, MONTHS, monthLabel, inr, inrCompact, getCategoryMap } from '../../src/data';
import { C, F, CARD_SHADOW } from '../../src/theme';
import { DonutChart } from '../../components/DonutChart';
import { Icon } from '../../components/Icon';

export default function HomeScreen() {
  const { txns, setSelectedTxnId, userName, setUserName, emailConnected, linkEmail, disconnectEmail, photoUrl } = useApp();
  const [nameModal, setNameModal] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [gmailBusy, setGmailBusy] = useState(false);
  const [activeTrend, setActiveTrend] = useState<number | null>(null);
  // The month the dashboard is scoped to; null = current month.
  const [selMonth, setSelMonth] = useState<{ year: number; month: number } | null>(null);

  const onGmailConnect = async () => { setGmailBusy(true); const r = await linkEmail(false); if (r !== 'ok') await linkEmail(true); setGmailBusy(false); };
  const onGmailReauth = async () => { setGmailBusy(true); await linkEmail(true); setGmailBusy(false); };
  const onGmailSignOut = async () => { setGmailBusy(true); await disconnectEmail(); setGmailBusy(false); };

  const displayName = userName || 'there';
  const avatarInitial = (userName || '?').trim().charAt(0).toUpperCase() || '?';

  const { monthTotal, monthCount, breakdown, donutSegs, allCatsOrdered, recent, delta, trend, headerMonth, avgLabel } = useMemo(() => {
    const now = new Date();
    // Dashboard is scoped to the selected month, defaulting to the current one.
    const curMonth = selMonth ? selMonth.month : now.getMonth();
    const curYear = selMonth ? selMonth.year : now.getFullYear();
    const monthTxns = txns.filter(t => t.month === curMonth && t.year === curYear);

    const catMap = getCategoryMap();
    const totals: Record<string, number> = {};
    monthTxns.forEach(t => (totals[t.cat] = (totals[t.cat] || 0) + t.amount));
    const monthTotal = monthTxns.reduce((a, t) => a + t.amount, 0);

    let breakdown = CATEGORIES.map(c => ({
      key: c.key, name: c.name, short: c.short, color: c.color, bg: c.bg,
      amount: totals[c.key] || 0,
    })).filter(b => b.amount > 0).sort((a, b) => b.amount - a.amount);

    const donutSegs = monthTotal > 0 ? breakdown.map(b => ({ pct: (b.amount / monthTotal) * 100, color: b.color })) : [];

    // Every category, in Budgets order (budgeted ones first, then the rest),
    // for the "Spend category" breakdown — shown whether or not it has spend.
    const order = [
      ...BUDGETS.map(b => b.cat),
      ...CATEGORIES.map(c => c.key).filter(k => !BUDGETS.some(b => b.cat === k)),
    ].filter((k, i, arr) => arr.indexOf(k) === i);
    const allCatsOrdered = order
      .map(k => catMap[k] && { key: k, name: catMap[k].name, color: catMap[k].color, amount: totals[k] || 0 })
      .filter(Boolean) as Array<{ key: string; name: string; color: string; amount: number }>;

    // Recent activity for the selected month.
    const recent = [...monthTxns]
      .sort((a, b) => b.day - a.day || b.id - a.id)
      .slice(0, 4);

    // Trend window is always the last 6 months ending at the real current month
    // (it doesn't shift when you select a past month); the selected month is
    // highlighted. Falls back to the demo TREND when data spans a single month.
    const byMonth: Record<string, number> = {};
    txns.forEach(t => { const k = `${t.year}-${t.month}`; byMonth[k] = (byMonth[k] || 0) + t.amount; });
    const months: Array<{ m: string; total: number; year?: number; month?: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        m: MONTHS[d.getMonth()],
        total: byMonth[`${d.getFullYear()}-${d.getMonth()}`] || 0,
        year: d.getFullYear(),
        month: d.getMonth(),
      });
    }
    const distinctMonths = Object.keys(byMonth).length;
    const trendData = distinctMonths >= 2 ? months : TREND;
    const maxTrend = Math.max(1, ...trendData.map(t => t.total));
    const trend = trendData.map(t => ({
      ...t,
      hRatio: t.total / maxTrend,
      isSelected: (t as any).year === curYear && (t as any).month === curMonth,
    }));

    const nonZero = trendData.filter(t => t.total > 0);
    const avg = nonZero.length ? Math.round(nonZero.reduce((a, t) => a + t.total, 0) / nonZero.length) : 0;
    const avgLabel = `avg ${inrCompact(avg)}`;

    // Delta vs the month before the selected one.
    const pd = new Date(curYear, curMonth - 1, 1);
    const prev = byMonth[`${pd.getFullYear()}-${pd.getMonth()}`] ?? 0;
    const delta = monthTotal - prev;

    return { monthTotal, monthCount: monthTxns.length, breakdown, donutSegs, allCatsOrdered, recent, delta, trend, headerMonth: monthLabel(curMonth, curYear), avgLabel };
  }, [txns, selMonth]);

  const catMap = getCategoryMap();
  const BAR_H = 78;
  const TREND_N = 6;
  const activeBar = activeTrend != null ? trend[activeTrend] : null;

  const openNameEditor = () => { setNameDraft(userName); setNameModal(true); };
  const saveName = () => { setUserName(nameDraft); setNameModal(false); };

  // Smooth scrub: drag a finger across the trend to highlight each month; a tap
  // on a bar opens that month's Activity. Refs keep the gesture handler current.
  const barsWidth = useRef(0);
  const trendRef = useRef(trend);
  trendRef.current = trend;
  const didMove = useRef(false);
  const startX = useRef(0);
  const tappedIdx = useRef(0);
  const idxAt = (x: number) => {
    const w = barsWidth.current || 1;
    return Math.min(TREND_N - 1, Math.max(0, Math.floor(x / (w / TREND_N))));
  };
  const trendPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: e => {
        didMove.current = false;
        startX.current = e.nativeEvent.locationX;
        tappedIdx.current = idxAt(e.nativeEvent.locationX);
        setActiveTrend(tappedIdx.current);
      },
      onPanResponderMove: e => {
        if (Math.abs(e.nativeEvent.locationX - startX.current) > 10) didMove.current = true;
        tappedIdx.current = idxAt(e.nativeEvent.locationX);
        setActiveTrend(tappedIdx.current);
      },
      onPanResponderRelease: () => {
        const bar: any = trendRef.current[tappedIdx.current];
        // A tap (no real drag) on a real month re-scopes the dashboard to it.
        if (!didMove.current && bar && bar.year != null && bar.month != null) {
          setSelMonth({ year: bar.year, month: bar.month });
        }
        setActiveTrend(null);
      },
      onPanResponderTerminate: () => setActiveTrend(null),
    })
  ).current;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header — tap to set/change your name */}
        <TouchableOpacity style={styles.header} onPress={openNameEditor} activeOpacity={0.7}>
          <View>
            <Text style={styles.greeting}>Good evening,</Text>
            <Text style={styles.name}>{displayName} 👋</Text>
          </View>
          <View style={styles.avatar}>
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarText}>{avatarInitial}</Text>
            )}
          </View>
        </TouchableOpacity>

        {/* Hero card */}
        <LinearGradient colors={['#6358E8', '#8E7BF5', '#A78BF8']} start={{ x: 0.1, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
          <View style={styles.heroBubble} />
          <View style={styles.heroRow}>
            <View style={styles.monthPill}>
              <Text style={styles.monthPillText}>{headerMonth}</Text>
            </View>
            <Text style={styles.heroCount}>{monthCount} spends</Text>
          </View>
          <Text style={styles.heroLabel}>Total spent</Text>
          <Text style={styles.heroAmount}>{inr(monthTotal)}</Text>
          <View style={styles.deltaPill}>
            <Text style={styles.deltaPillText}>
              {delta >= 0 ? '↑' : '↓'} {inr(Math.abs(delta))} vs last month
            </Text>
          </View>
        </LinearGradient>

        {/* Trend */}
        <View style={[styles.card, styles.trendCard]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>6-month trend</Text>
            <Text style={styles.cardMeta} numberOfLines={1}>
              {activeBar ? `${activeBar.m} · ${inrCompact(activeBar.total)}` : avgLabel}
            </Text>
          </View>
          <View
            style={styles.trendBars}
            onLayout={e => { barsWidth.current = e.nativeEvent.layout.width; }}
            {...trendPan.panHandlers}
          >
            {trend.map((t, i) => {
              const isActive = activeTrend === i;
              return (
                <View key={t.m} style={styles.trendCol}>
                  {isActive && (
                    <View style={styles.trendTip}>
                      <Text style={styles.trendTipText} numberOfLines={1}>{inrCompact(t.total)}</Text>
                    </View>
                  )}
                  <View style={{ height: BAR_H, width: '100%', justifyContent: 'flex-end', alignItems: 'center' }}>
                    <View
                      style={[
                        styles.trendBar,
                        {
                          // Give any month with spend a visible minimum height so a
                          // single large month doesn't flatten the rest to nothing.
                          height: t.total > 0 ? Math.max(6, t.hRatio * BAR_H) : 2,
                          backgroundColor: isActive || t.isSelected ? C.primary : t.total > 0 ? '#C3BCEA' : '#ECEAF6',
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.trendLabel, (isActive || t.isSelected) && { color: C.primary, fontFamily: F.extraBold }]}>{t.m}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Spend category */}
        <View style={[styles.card, styles.donutCard]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Spend category</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/spending')} style={styles.detailsBtn}>
              <Text style={styles.detailsBtnText}>Details</Text>
              <Text style={{ color: C.primary }}>›</Text>
            </TouchableOpacity>
          </View>
          <View style={{ alignItems: 'center', marginTop: 4, marginBottom: 12 }}>
            <DonutChart
              segments={donutSegs}
              size={132}
              holeRatio={0.58}
              centerLabel="Spent"
              centerValue={inr(monthTotal)}
            />
          </View>
          {/* All categories, in Budgets order */}
          <View style={styles.catBreakdown}>
            {allCatsOrdered.map(b => (
              <View key={b.key} style={styles.catBreakRow}>
                <View style={[styles.legendDot, { backgroundColor: b.color }]} />
                <Text style={styles.catBreakName} numberOfLines={1}>{b.name}</Text>
                <Text style={styles.catBreakPct}>{monthTotal > 0 ? Math.round((b.amount / monthTotal) * 100) : 0}%</Text>
                <Text style={styles.catBreakAmt}>{inr(b.amount)}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Recent activity */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent activity</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/activity')}>
            <Text style={styles.seeAll}>See all</Text>
          </TouchableOpacity>
        </View>
        {recent.map(t => {
          const cat = catMap[t.cat];
          return (
            <TouchableOpacity
              key={t.id}
              style={styles.txnCard}
              onPress={() => { setSelectedTxnId(t.id); router.push(`/transaction/${t.id}`); }}
              activeOpacity={0.8}
            >
              <View style={[styles.txnIcon, { backgroundColor: cat.bg }]}>
                <Icon paths={cat.paths} color={cat.color} size={18} />
              </View>
              <View style={styles.txnInfo}>
                <Text style={styles.txnMerchant} numberOfLines={1}>{t.merchant}</Text>
                <Text style={styles.txnSub}>{cat.name} · {t.source === 'sms' ? 'SMS' : 'Email'}</Text>
              </View>
              <View style={styles.txnRight}>
                <Text style={styles.txnAmount}>− {inr(t.amount)}</Text>
                <Text style={styles.txnTime}>{t.time}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Name editor */}
      <Modal visible={nameModal} transparent animationType="fade" onRequestClose={() => setNameModal(false)}>
        <Pressable style={styles.nameOverlay} onPress={() => setNameModal(false)}>
          <Pressable style={styles.nameSheet} onPress={e => e.stopPropagation()}>
            <Text style={styles.nameTitle}>Account</Text>
            <Text style={styles.nameSub}>Your name is shown on the dashboard.</Text>
            <TextInput
              style={styles.nameInput}
              value={nameDraft}
              onChangeText={setNameDraft}
              placeholder="Your name"
              placeholderTextColor="#B0B0C2"
              returnKeyType="done"
              onSubmitEditing={saveName}
              maxLength={24}
            />
            <View style={styles.nameBtns}>
              <TouchableOpacity style={styles.nameCancel} onPress={() => setNameModal(false)} activeOpacity={0.8}>
                <Text style={styles.nameCancelText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.nameSave} onPress={saveName} activeOpacity={0.9}>
                <Text style={styles.nameSaveText}>Save name</Text>
              </TouchableOpacity>
            </View>

            {/* Gmail account: connect / re-authenticate / sign out */}
            <View style={styles.gmailRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.gmailLabel}>Gmail</Text>
                <Text style={styles.gmailStatus}>{emailConnected ? 'Connected' : 'Not connected'}</Text>
              </View>
              {gmailBusy ? (
                <ActivityIndicator color={C.primary} />
              ) : emailConnected ? (
                <View style={{ flexDirection: 'row', gap: 14 }}>
                  <TouchableOpacity onPress={onGmailReauth} activeOpacity={0.8}>
                    <Text style={styles.gmailAction}>Re-authenticate</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={onGmailSignOut} activeOpacity={0.8}>
                    <Text style={[styles.gmailAction, { color: '#EF4444' }]}>Sign out</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity onPress={onGmailConnect} activeOpacity={0.8}>
                  <Text style={styles.gmailAction}>Connect</Text>
                </TouchableOpacity>
              )}
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, marginBottom: 2 },
  greeting: { fontSize: 13, fontFamily: F.semiBold, color: C.muted },
  name: { fontSize: 21, fontFamily: F.extraBold, color: C.dark, letterSpacing: -0.4 },
  avatar: {
    width: 46, height: 46, borderRadius: 15, backgroundColor: C.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#6358E8', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 18, elevation: 6,
  },
  avatarText: { fontSize: 18, fontFamily: F.extraBold, color: '#fff' },
  avatarImg: { width: '100%', height: '100%', borderRadius: 15 },
  heroCard: {
    borderRadius: 28, padding: 22, overflow: 'hidden',
    shadowColor: '#6358E8', shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.34, shadowRadius: 38, elevation: 12,
  },
  heroBubble: { position: 'absolute', top: -40, right: -30, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.10)' },
  heroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthPill: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.18)', paddingVertical: 7, paddingHorizontal: 12, borderRadius: 20 },
  monthPillText: { fontSize: 13, fontFamily: F.bold, color: '#fff' },
  heroCount: { fontSize: 12, fontFamily: F.semiBold, color: 'rgba(255,255,255,0.8)' },
  heroLabel: { fontSize: 13, fontFamily: F.semiBold, color: 'rgba(255,255,255,0.85)', marginTop: 18 },
  heroAmount: { fontSize: 40, fontFamily: F.extraBold, color: '#fff', letterSpacing: -1.2, marginTop: 2 },
  deltaPill: { marginTop: 12, backgroundColor: 'rgba(255,255,255,0.16)', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, alignSelf: 'flex-start' },
  deltaPillText: { fontSize: 12.5, fontFamily: F.bold, color: '#FFD0C2' },
  card: { backgroundColor: '#fff', borderRadius: 24, padding: 20, marginTop: 16, ...CARD_SHADOW },
  trendCard: {},
  donutCard: {},
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  cardTitle: { fontSize: 15, fontFamily: F.extraBold, color: C.dark },
  cardMeta: { fontSize: 12, fontFamily: F.semiBold, color: C.muted },
  trendBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  trendCol: { flex: 1, alignItems: 'center', gap: 9 },
  trendBar: { width: '60%', borderTopLeftRadius: 7, borderTopRightRadius: 7, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  trendLabel: { fontSize: 11, fontFamily: F.bold, color: '#A0A0B5' },
  trendTip: {
    position: 'absolute', top: -2, alignSelf: 'center', zIndex: 10,
    backgroundColor: C.dark, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8,
  },
  trendTipText: { fontSize: 10.5, fontFamily: F.bold, color: '#fff' },
  nameOverlay: { flex: 1, backgroundColor: 'rgba(20,18,40,0.45)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  nameSheet: { width: '100%', backgroundColor: '#fff', borderRadius: 24, padding: 22 },
  nameTitle: { fontSize: 18, fontFamily: F.extraBold, color: C.dark },
  nameSub: { fontSize: 13, fontFamily: F.medium, color: C.muted, marginTop: 4, marginBottom: 16 },
  nameInput: {
    borderWidth: 1.5, borderColor: C.border, borderRadius: 14, paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10, fontSize: 16, fontFamily: F.semiBold, color: C.dark,
  },
  nameBtns: { flexDirection: 'row', gap: 10, marginTop: 18 },
  nameCancel: { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: '#F0F0F6', alignItems: 'center' },
  nameCancelText: { fontSize: 15, fontFamily: F.bold, color: '#6A6A82' },
  nameSave: { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: C.primary, alignItems: 'center' },
  nameSaveText: { fontSize: 15, fontFamily: F.bold, color: '#fff' },
  gmailRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#F0F0F6' },
  gmailLabel: { fontSize: 14, fontFamily: F.bold, color: C.dark },
  gmailStatus: { fontSize: 12.5, fontFamily: F.medium, color: C.muted, marginTop: 2 },
  gmailAction: { fontSize: 13, fontFamily: F.bold, color: C.primary },
  donutRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  legendList: { flex: 1, gap: 11 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  legendDot: { width: 11, height: 11, borderRadius: 4 },
  legendName: { flex: 1, fontSize: 13, fontFamily: F.semiBold, color: C.text },
  legendPct: { fontSize: 13, fontFamily: F.extraBold, color: C.dark },
  catBreakdown: { gap: 12 },
  catBreakRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  catBreakName: { flex: 1, fontSize: 13.5, fontFamily: F.semiBold, color: C.dark },
  catBreakPct: { width: 42, textAlign: 'right', fontSize: 12, fontFamily: F.medium, color: C.muted },
  catBreakAmt: { minWidth: 72, textAlign: 'right', fontSize: 13.5, fontFamily: F.bold, color: C.dark },
  detailsBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  detailsBtnText: { fontSize: 13, fontFamily: F.bold, color: C.primary },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 12, paddingHorizontal: 2 },
  sectionTitle: { fontSize: 15, fontFamily: F.extraBold, color: C.dark },
  seeAll: { fontSize: 13, fontFamily: F.bold, color: C.primary },
  txnCard: {
    flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: '#fff',
    borderRadius: 18, padding: 13, marginBottom: 9, ...CARD_SHADOW,
  },
  txnIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  txnInfo: { flex: 1, minWidth: 0 },
  txnMerchant: { fontSize: 14.5, fontFamily: F.bold, color: C.dark },
  txnSub: { fontSize: 12, fontFamily: F.medium, color: C.muted, marginTop: 2 },
  txnRight: { alignItems: 'flex-end' },
  txnAmount: { fontSize: 14.5, fontFamily: F.extraBold, color: C.dark },
  txnTime: { fontSize: 11, fontFamily: F.medium, color: C.dimmer, marginTop: 2 },
});
