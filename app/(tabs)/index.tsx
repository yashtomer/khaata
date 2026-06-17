import React, { useMemo, useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal, Pressable, PanResponder, ActivityIndicator, Image, Animated, Dimensions, Switch, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useApp } from '../../src/context';
import { CATEGORIES, BUDGETS, TREND, MONTHS, monthLabel, inr, inrCompact, getCategoryMap } from '../../src/data';
import { C, F, CARD_SHADOW } from '../../src/theme';
import { DonutChart } from '../../components/DonutChart';
import { Icon } from '../../components/Icon';

const HAMBURGER = ['M4 6h16', 'M4 12h16', 'M4 18h16'];
const REFRESH = ['M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8', 'M21 3v5h-5', 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16', 'M3 21v-5h5'];
const ICON_MAIL = ['M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'm22 6-10 7L2 6'];
const ICON_SMS = ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'];
const TRASH = ['M3 6h18', 'm5 6 1 14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-14', 'M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2', 'M10 11v6', 'M14 11v6'];

export default function HomeScreen() {
  const {
    txns, setSelectedTxnId, userName, photoUrl,
    emailConnected, linkEmail, disconnectEmail, logout,
    smsConnected, connectSms, disconnectSms, smsStatus,
    autoSync, setAutoSync,
  } = useApp();
  const [drawerMounted, setDrawerMounted] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [gmailBusy, setGmailBusy] = useState(false);
  const [smsBusy, setSmsBusy] = useState(false);
  const [activeTrend, setActiveTrend] = useState<number | null>(null);
  // The month the dashboard is scoped to; null = current month.
  const [selMonth, setSelMonth] = useState<{ year: number; month: number } | null>(null);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [recentLimit, setRecentLimit] = useState(8); // how many recent txns are shown (grows on scroll)
  const [selCat, setSelCat] = useState<string | null>(null); // tapped category → filter the list below

  // Last 12 months, newest first, for the dashboard month picker.
  const monthOptions = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      return { year: d.getFullYear(), month: d.getMonth(), label: monthLabel(d.getMonth(), d.getFullYear()) };
    });
  }, []);
  const selMonthKey = selMonth ? `${selMonth.year}-${selMonth.month}` : `${new Date().getFullYear()}-${new Date().getMonth()}`;
  const pickMonth = (m: { year: number; month: number }) => {
    setSelMonth(m);
    setRecentLimit(8);
    setMonthPickerOpen(false);
  };

  // Side drawer: slides in from the left, dim overlay fades. `drawerMounted`
  // keeps the Modal alive through the close animation, then unmounts.
  const DRAWER_W = Math.min(340, Dimensions.get('window').width * 0.86);
  const drawerAnim = useRef(new Animated.Value(0)).current; // 0 = closed, 1 = open
  const openDrawer = () => { setDrawerMounted(true); setDrawerOpen(true); };
  const closeDrawer = () => setDrawerOpen(false);
  useEffect(() => {
    if (!drawerMounted) return;
    Animated.timing(drawerAnim, {
      toValue: drawerOpen ? 1 : 0,
      duration: drawerOpen ? 240 : 200,
      useNativeDriver: true,
    }).start(({ finished }) => { if (finished && !drawerOpen) setDrawerMounted(false); });
  }, [drawerOpen, drawerMounted]);

  const onGmailConnect = async () => { setGmailBusy(true); const r = await linkEmail(false); if (r !== 'ok') await linkEmail(true); setGmailBusy(false); };
  const onGmailSync = async () => { setGmailBusy(true); await linkEmail(false); setGmailBusy(false); };
  const onGmailDisconnect = async () => { setGmailBusy(true); await disconnectEmail(); setGmailBusy(false); };
  const onSmsConnect = async () => { setSmsBusy(true); await connectSms(); setSmsBusy(false); };
  const onSmsSync = onSmsConnect;
  const onSmsDisconnect = () => disconnectSms();
  const onLogout = async () => { setDrawerOpen(false); await logout(); router.replace('/onboarding'); };

  // Pull-to-refresh: re-sync the connected sources for the latest messages.
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        emailConnected ? linkEmail(false) : Promise.resolve('ok' as const),
        smsConnected ? connectSms() : Promise.resolve(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const avatarInitial = (userName || '?').trim().charAt(0).toUpperCase() || '?';

  const { monthTotal, monthSpent, monthInvested, monthCount, breakdown, donutSegs, allCatsOrdered, recent, delta, trend, headerMonth, avgLabel } = useMemo(() => {
    const now = new Date();
    // Dashboard is scoped to the selected month, defaulting to the current one.
    const curMonth = selMonth ? selMonth.month : now.getMonth();
    const curYear = selMonth ? selMonth.year : now.getFullYear();
    const monthTxns = txns.filter(t => t.month === curMonth && t.year === curYear);

    const catMap = getCategoryMap();
    const totals: Record<string, number> = {};
    monthTxns.forEach(t => (totals[t.cat] = (totals[t.cat] || 0) + t.amount));
    const monthTotal = monthTxns.reduce((a, t) => a + t.amount, 0);
    // Investments aren't spending — money moved to an asset. Split them out so
    // the hero shows "spent" vs "invested" separately, and the spend donut/trend
    // exclude investments.
    const monthInvested = totals['investments'] || 0;
    const monthSpent = monthTotal - monthInvested;

    // Donut = spending only (exclude investments).
    let breakdown = CATEGORIES.filter(c => c.key !== 'investments').map(c => ({
      key: c.key, name: c.name, short: c.short, color: c.color, bg: c.bg,
      amount: totals[c.key] || 0,
    })).filter(b => b.amount > 0).sort((a, b) => b.amount - a.amount);

    const donutSegs = monthSpent > 0 ? breakdown.map(b => ({ pct: (b.amount / monthSpent) * 100, color: b.color })) : [];

    // Every category, in Budgets order (budgeted ones first, then the rest),
    // for the "Spend category" breakdown — shown whether or not it has spend.
    const order = [
      ...BUDGETS.map(b => b.cat),
      ...CATEGORIES.map(c => c.key).filter(k => !BUDGETS.some(b => b.cat === k)),
    ].filter((k, i, arr) => arr.indexOf(k) === i);
    const allCatsOrdered = order
      .map(k => {
        const c = catMap[k] || catMap.other;
        return c && { key: k, name: c.name, desc: c.desc, color: c.color, amount: totals[k] || 0 };
      })
      .filter(Boolean) as Array<{ key: string; name: string; desc: string; color: string; amount: number }>;

    // Recent activity for the selected month (full sorted list; the screen
    // paginates it via recentLimit as you scroll).
    const recent = [...monthTxns].sort((a, b) => b.day - a.day || b.id - a.id);

    // Trend window is always the last 6 months ending at the real current month
    // (it doesn't shift when you select a past month); the selected month is
    // highlighted. Falls back to the demo TREND when data spans a single month.
    // Trend is spending only (exclude investments, so a big SIP doesn't dwarf it).
    const byMonth: Record<string, number> = {};
    txns.forEach(t => { if (t.cat === 'investments') return; const k = `${t.year}-${t.month}`; byMonth[k] = (byMonth[k] || 0) + t.amount; });
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
    const delta = monthSpent - prev;

    return { monthTotal, monthSpent, monthInvested, monthCount: monthTxns.length, breakdown, donutSegs, allCatsOrdered, recent, delta, trend, headerMonth: monthLabel(curMonth, curYear), avgLabel };
  }, [txns, selMonth]);

  const catMap = getCategoryMap();
  // The list below the Spend-category card: all month txns, or just the tapped category.
  const shownTxns = selCat ? recent.filter(t => t.cat === selCat) : recent;
  const BAR_H = 78;
  const TREND_N = 6;
  const activeBar = activeTrend != null ? trend[activeTrend] : null;

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
          setRecentLimit(8);
        }
        setActiveTrend(null);
      },
      onPanResponderTerminate: () => setActiveTrend(null),
    })
  ).current;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={200}
        onScroll={e => {
          const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
          if (contentOffset.y + layoutMeasurement.height >= contentSize.height - 260) {
            setRecentLimit(l => (l < shownTxns.length ? l + 12 : l));
          }
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} colors={[C.primary]} />}
      >
        {/* Header — hamburger opens the account & sync drawer */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.menuBtn} onPress={openDrawer} activeOpacity={0.6} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon paths={HAMBURGER} color={C.dark} size={26} strokeWidth={2.3} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.avatar} onPress={openDrawer} activeOpacity={0.8}>
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarText}>{avatarInitial}</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Hero card */}
        <LinearGradient colors={['#6358E8', '#8E7BF5', '#A78BF8']} start={{ x: 0.1, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
          <View style={styles.heroBubble} />
          <View style={styles.heroRow}>
            <TouchableOpacity style={styles.monthPill} onPress={() => setMonthPickerOpen(true)} activeOpacity={0.8}>
              <Text style={styles.monthPillText}>{headerMonth}</Text>
              <Text style={styles.monthPillChevron}>▾</Text>
            </TouchableOpacity>
            <Text style={styles.heroCount}>{monthCount} spends</Text>
          </View>
          <Text style={styles.heroLabel}>Total spent</Text>
          <Text style={styles.heroAmount}>{inr(monthSpent)}</Text>
          <View style={styles.heroStatsRow}>
            <View style={styles.deltaPill}>
              <Text style={styles.deltaPillText}>
                {delta >= 0 ? '↑' : '↓'} {inr(Math.abs(delta))} vs last month
              </Text>
            </View>
            {monthInvested > 0 && (
              <View style={styles.investPill}>
                <Text style={styles.investPillText}>＋ {inr(monthInvested)} invested</Text>
              </View>
            )}
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
                  <Text style={[styles.trendAmt, (isActive || t.isSelected) && { color: C.primary, fontFamily: F.extraBold }]} numberOfLines={1}>
                    {t.total > 0 ? inrCompact(t.total) : ''}
                  </Text>
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
              centerValue={inr(monthSpent)}
            />
          </View>
          {/* All categories, in Budgets order */}
          <View style={styles.catBreakdown}>
            {allCatsOrdered.map(b => (
              <TouchableOpacity
                key={b.key}
                style={[styles.catBreakRow, selCat === b.key && styles.catBreakRowActive]}
                onPress={() => { setSelCat(selCat === b.key ? null : b.key); setRecentLimit(8); }}
                activeOpacity={0.7}
              >
                <View style={[styles.legendDot, { backgroundColor: b.color }]} />
                <View style={styles.catBreakInfo}>
                  <Text style={styles.catBreakName} numberOfLines={1}>{b.name}</Text>
                  <Text style={styles.catBreakDesc} numberOfLines={1}>{b.desc}</Text>
                </View>
                <Text style={styles.catBreakPct}>{monthTotal > 0 ? Math.round((b.amount / monthTotal) * 100) : 0}%</Text>
                <Text style={styles.catBreakAmt}>{inr(b.amount)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Recent activity — filtered to the tapped category, if any */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {selCat ? (catMap[selCat] || catMap.other).name : 'Recent activity'}
          </Text>
          {selCat ? (
            <TouchableOpacity onPress={() => { setSelCat(null); setRecentLimit(8); }}>
              <Text style={styles.seeAll}>✕ Clear</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => router.push('/(tabs)/activity')}>
              <Text style={styles.seeAll}>See all</Text>
            </TouchableOpacity>
          )}
        </View>
        {selCat && shownTxns.length === 0 && (
          <View style={styles.emptyCat}>
            <Text style={styles.emptyCatText}>No {(catMap[selCat] || catMap.other).name} transactions in {headerMonth}.</Text>
          </View>
        )}
        {shownTxns.slice(0, recentLimit).map(t => {
          const cat = catMap[t.cat] || catMap.other;
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
        {recentLimit < shownTxns.length && (
          <TouchableOpacity style={styles.loadMore} onPress={() => setRecentLimit(l => l + 12)} activeOpacity={0.85}>
            <Text style={styles.loadMoreText}>Show more ({shownTxns.length - recentLimit} left)</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Month picker (tap the hero month pill) */}
      <Modal visible={monthPickerOpen} transparent animationType="fade" onRequestClose={() => setMonthPickerOpen(false)}>
        <Pressable style={styles.mpOverlay} onPress={() => setMonthPickerOpen(false)}>
          <Pressable style={styles.mpSheet} onPress={e => e.stopPropagation()}>
            <Text style={styles.mpTitle}>Select month</Text>
            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {monthOptions.map(m => {
                const active = `${m.year}-${m.month}` === selMonthKey;
                return (
                  <TouchableOpacity key={m.label} style={[styles.mpRow, active && styles.mpRowActive]} onPress={() => pickMonth(m)} activeOpacity={0.8}>
                    <Text style={[styles.mpRowText, active && styles.mpRowTextActive]}>{m.label}</Text>
                    {active && <Icon paths={['M20 6 9 17l-5-5']} color={C.primary} size={16} strokeWidth={3} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Account & sync side drawer (opens from the left) */}
      <Modal visible={drawerMounted} transparent animationType="none" statusBarTranslucent onRequestClose={closeDrawer}>
        <Animated.View style={[styles.drawerOverlay, { opacity: drawerAnim }]}>
          <Pressable style={{ flex: 1 }} onPress={closeDrawer} />
        </Animated.View>
        <Animated.View
          style={[
            styles.drawerPanel,
            {
              width: DRAWER_W,
              transform: [{ translateX: drawerAnim.interpolate({ inputRange: [0, 1], outputRange: [-DRAWER_W, 0] }) }],
            },
          ]}
        >
          <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'bottom']}>
            <ScrollView contentContainerStyle={styles.drawerScroll} showsVerticalScrollIndicator={false}>
              {/* Profile — name + photo come from the signed-in Google account */}
              <View style={styles.drawerProfile}>
                <View style={styles.drawerAvatar}>
                  {photoUrl ? (
                    <Image source={{ uri: photoUrl }} style={styles.drawerAvatarImg} />
                  ) : (
                    <Text style={styles.drawerAvatarText}>{avatarInitial}</Text>
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.drawerName} numberOfLines={1}>{userName || 'Welcome'}</Text>
                  <Text style={styles.drawerProfileSub} numberOfLines={1}>
                    {emailConnected ? 'Gmail connected' : 'Not signed in'}
                  </Text>
                </View>
                <TouchableOpacity onPress={closeDrawer} style={styles.drawerClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Text style={styles.drawerCloseText}>✕</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.drawerSection}>SYNC SOURCES</Text>

              {/* Gmail — tap the refresh icon to pull new emails */}
              <View style={styles.syncRow}>
                <View style={[styles.syncIcon, { backgroundColor: '#FDE7E3' }]}>
                  <Icon paths={ICON_MAIL} color="#EA4335" size={18} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.syncTitle}>Sync Gmail</Text>
                  <Text style={[styles.syncStatus, emailConnected && styles.syncStatusOn]} numberOfLines={1}>
                    {emailConnected ? (gmailBusy ? 'Syncing…' : 'Connected') : 'Not connected'}
                  </Text>
                </View>
                {emailConnected ? (
                  <View style={styles.syncActions}>
                    <TouchableOpacity style={styles.refreshBtn} onPress={onGmailSync} disabled={gmailBusy} activeOpacity={0.7}>
                      {gmailBusy ? <ActivityIndicator size="small" color={C.primary} /> : <Icon paths={REFRESH} color={C.primary} size={19} strokeWidth={2.1} />}
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.removeBtn} onPress={onGmailDisconnect} disabled={gmailBusy} activeOpacity={0.7} hitSlop={6}>
                      <Icon paths={TRASH} color="#EF4444" size={17} strokeWidth={2} />
                    </TouchableOpacity>
                  </View>
                ) : gmailBusy ? (
                  <ActivityIndicator color={C.primary} />
                ) : (
                  <TouchableOpacity style={styles.syncConnect} onPress={onGmailConnect} activeOpacity={0.85}>
                    <Text style={styles.syncConnectText}>Connect</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* SMS — tap the refresh icon to re-read the inbox */}
              <View style={styles.syncRow}>
                <View style={[styles.syncIcon, { backgroundColor: '#E0EEFF' }]}>
                  <Icon paths={ICON_SMS} color="#3B82F6" size={18} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.syncTitle}>Sync SMS</Text>
                  <Text style={[styles.syncStatus, smsConnected && styles.syncStatusOn]} numberOfLines={1}>
                    {smsConnected ? (smsBusy ? 'Syncing…' : (smsStatus === 'unsupported' ? 'Connected · no messages' : 'Connected')) : 'Not connected'}
                  </Text>
                </View>
                {smsConnected ? (
                  <View style={styles.syncActions}>
                    <TouchableOpacity style={styles.refreshBtn} onPress={onSmsSync} disabled={smsBusy} activeOpacity={0.7}>
                      {smsBusy ? <ActivityIndicator size="small" color={C.primary} /> : <Icon paths={REFRESH} color={C.primary} size={19} strokeWidth={2.1} />}
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.removeBtn} onPress={onSmsDisconnect} disabled={smsBusy} activeOpacity={0.7} hitSlop={6}>
                      <Icon paths={TRASH} color="#EF4444" size={17} strokeWidth={2} />
                    </TouchableOpacity>
                  </View>
                ) : smsBusy ? (
                  <ActivityIndicator color={C.primary} />
                ) : (
                  <TouchableOpacity style={styles.syncConnect} onPress={onSmsConnect} activeOpacity={0.85}>
                    <Text style={styles.syncConnectText}>Connect</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Auto-sync toggle */}
              <View style={styles.autoRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.syncTitle}>Auto-sync</Text>
                  <Text style={styles.syncStatus}>Fetch new messages automatically</Text>
                </View>
                <Switch
                  value={autoSync}
                  onValueChange={setAutoSync}
                  trackColor={{ true: C.primary, false: '#D8D5E6' }}
                  thumbColor="#fff"
                  ios_backgroundColor="#D8D5E6"
                />
              </View>

              <View style={{ flex: 1, minHeight: 24 }} />

              <TouchableOpacity style={styles.drawerSignOut} onPress={onLogout} activeOpacity={0.85}>
                <Text style={styles.drawerSignOutText}>Log out</Text>
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </Animated.View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 20, paddingBottom: 30, paddingTop: 6 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, marginBottom: 2 },
  menuBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...CARD_SHADOW },
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
  monthPillChevron: { fontSize: 10, color: 'rgba(255,255,255,0.85)' },
  mpOverlay: { flex: 1, backgroundColor: 'rgba(20,18,40,0.45)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  mpSheet: { width: '100%', backgroundColor: '#fff', borderRadius: 24, padding: 16 },
  mpTitle: { fontSize: 16, fontFamily: F.extraBold, color: C.dark, marginBottom: 8, paddingHorizontal: 4 },
  mpRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, paddingHorizontal: 14, borderRadius: 12 },
  mpRowActive: { backgroundColor: C.primarySoft },
  mpRowText: { fontSize: 15, fontFamily: F.semiBold, color: C.dark },
  mpRowTextActive: { color: C.primary, fontFamily: F.bold },
  loadMore: { alignItems: 'center', paddingVertical: 14, marginTop: 2 },
  loadMoreText: { fontSize: 13, fontFamily: F.bold, color: C.primary },
  heroCount: { fontSize: 12, fontFamily: F.semiBold, color: 'rgba(255,255,255,0.8)' },
  heroLabel: { fontSize: 13, fontFamily: F.semiBold, color: 'rgba(255,255,255,0.85)', marginTop: 18 },
  heroAmount: { fontSize: 40, fontFamily: F.extraBold, color: '#fff', letterSpacing: -1.2, marginTop: 2 },
  heroStatsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  deltaPill: { backgroundColor: 'rgba(255,255,255,0.16)', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20 },
  deltaPillText: { fontSize: 12.5, fontFamily: F.bold, color: '#FFD0C2' },
  investPill: { backgroundColor: 'rgba(255,255,255,0.16)', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20 },
  investPillText: { fontSize: 12.5, fontFamily: F.bold, color: '#CFFAFE' },
  card: { backgroundColor: '#fff', borderRadius: 24, padding: 20, marginTop: 16, ...CARD_SHADOW },
  trendCard: {},
  donutCard: {},
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  cardTitle: { fontSize: 15, fontFamily: F.extraBold, color: C.dark },
  cardMeta: { fontSize: 12, fontFamily: F.semiBold, color: C.muted },
  trendBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  trendCol: { flex: 1, alignItems: 'center', gap: 7 },
  trendAmt: { fontSize: 9.5, fontFamily: F.bold, color: '#9A9AAE' },
  trendBar: { width: '60%', borderTopLeftRadius: 7, borderTopRightRadius: 7, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  trendLabel: { fontSize: 11, fontFamily: F.bold, color: '#A0A0B5' },
  trendTip: {
    position: 'absolute', top: -2, alignSelf: 'center', zIndex: 10,
    backgroundColor: C.dark, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8,
  },
  trendTipText: { fontSize: 10.5, fontFamily: F.bold, color: '#fff' },
  // Side drawer
  drawerOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(20,18,40,0.45)' },
  drawerPanel: {
    position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: C.bg,
    borderTopRightRadius: 26, borderBottomRightRadius: 26,
    shadowColor: '#000', shadowOffset: { width: 8, height: 0 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 16,
  },
  drawerScroll: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 20 },
  drawerProfile: { flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 22 },
  drawerAvatar: {
    width: 52, height: 52, borderRadius: 17, backgroundColor: C.primary,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  drawerAvatarImg: { width: '100%', height: '100%' },
  drawerAvatarText: { fontSize: 21, fontFamily: F.extraBold, color: '#fff' },
  drawerName: { fontSize: 18, fontFamily: F.extraBold, color: C.dark, letterSpacing: -0.3 },
  drawerProfileSub: { fontSize: 12.5, fontFamily: F.medium, color: C.muted, marginTop: 2 },
  drawerClose: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#ECEAF3', alignItems: 'center', justifyContent: 'center' },
  drawerCloseText: { fontSize: 14, fontFamily: F.bold, color: '#6A6A82' },
  drawerSection: { fontSize: 11, fontFamily: F.extraBold, color: C.dimmer, letterSpacing: 1, marginTop: 8, marginBottom: 10 },
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 18, padding: 14, marginBottom: 10, ...CARD_SHADOW },
  syncIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  syncTitle: { fontSize: 14, fontFamily: F.bold, color: C.dark },
  syncStatus: { fontSize: 12, fontFamily: F.medium, color: C.muted, marginTop: 2 },
  syncStatusOn: { color: '#16A34A' },
  syncActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  refreshBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#F0EEFB', alignItems: 'center', justifyContent: 'center' },
  removeBtn: { width: 36, height: 38, borderRadius: 12, backgroundColor: '#FDE7E3', alignItems: 'center', justifyContent: 'center' },
  syncConnect: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 11, backgroundColor: '#F0EEFB' },
  syncConnectText: { fontSize: 13, fontFamily: F.bold, color: C.primary },
  autoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14, marginTop: 4, ...CARD_SHADOW },
  drawerSignOut: { paddingVertical: 15, borderRadius: 15, backgroundColor: '#FDE7E3', alignItems: 'center', marginTop: 8 },
  drawerSignOutText: { fontSize: 14.5, fontFamily: F.bold, color: '#EF4444' },
  donutRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  legendList: { flex: 1, gap: 11 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  legendDot: { width: 11, height: 11, borderRadius: 4 },
  legendName: { flex: 1, fontSize: 13, fontFamily: F.semiBold, color: C.text },
  legendPct: { fontSize: 13, fontFamily: F.extraBold, color: C.dark },
  catBreakdown: { gap: 2 },
  catBreakRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, paddingHorizontal: 8, marginHorizontal: -8, borderRadius: 12 },
  catBreakRowActive: { backgroundColor: C.primarySoft },
  catBreakInfo: { flex: 1, minWidth: 0 },
  emptyCat: { backgroundColor: '#fff', borderRadius: 16, padding: 18, alignItems: 'center', ...CARD_SHADOW },
  emptyCatText: { fontSize: 13, fontFamily: F.medium, color: C.muted, textAlign: 'center' },
  catBreakName: { fontSize: 13.5, fontFamily: F.semiBold, color: C.dark },
  catBreakDesc: { fontSize: 11, fontFamily: F.medium, color: C.dimmer, marginTop: 1 },
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
