import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import { router } from 'expo-router';
import { useApp } from '../../src/context';
import { CATEGORIES, dayLabel, getCategoryMap, inr, monthLabel } from '../../src/data';
import { C, F, CARD_SHADOW } from '../../src/theme';
import { Icon } from '../../components/Icon';

function SearchIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#B0B0C2" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={11} cy={11} r={8} />
      <Path d="m21 21-4.3-4.3" />
    </Svg>
  );
}

export default function ActivityScreen() {
  const { txns, filter, setFilter, setSelectedTxnId, monthFilter, setMonthFilter } = useApp();

  const { groups, filterChips } = useMemo(() => {
    // Scope to the tapped month (from the trend chart) when one is set.
    const inMonth = monthFilter
      ? txns.filter(t => t.year === monthFilter.year && t.month === monthFilter.month)
      : txns;

    const catMap = getCategoryMap();
    const totals: Record<string, number> = {};
    inMonth.forEach(t => (totals[t.cat] = (totals[t.cat] || 0) + t.amount));

    const sorted = [...inMonth].sort(
      (a, b) => b.year - a.year || b.month - a.month || b.day - a.day || b.id - a.id
    );
    const filt = filter === 'all' ? sorted : sorted.filter(t => t.cat === filter);

    const groups: Array<{ label: string; items: typeof sorted }> = [];
    filt.forEach(t => {
      const lbl = dayLabel(t.day, t.month, t.year);
      let g = groups.find(x => x.label === lbl);
      if (!g) { g = { label: lbl, items: [] }; groups.push(g); }
      g.items.push(t);
    });

    // Build filter chips from categories that have transactions
    let activeCats = CATEGORIES.filter(c => totals[c.key] > 0).sort((a, b) => (totals[b.key] || 0) - (totals[a.key] || 0));
    const filterChips = [{ key: 'all', label: 'All' }, ...activeCats.map(c => ({ key: c.key, label: c.short }))];

    return { groups, filterChips, catMap };
  }, [txns, filter, monthFilter]);

  const catMap = getCategoryMap();

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Activity</Text>

        {/* Month scope chip (set by tapping a bar on the home trend chart) */}
        {monthFilter && (
          <TouchableOpacity style={styles.monthChip} onPress={() => setMonthFilter(null)} activeOpacity={0.8}>
            <Text style={styles.monthChipText}>{monthLabel(monthFilter.month, monthFilter.year)}</Text>
            <Text style={styles.monthChipX}>✕</Text>
          </TouchableOpacity>
        )}

        {/* Search bar */}
        <View style={styles.searchBar}>
          <SearchIcon />
          <Text style={styles.searchPlaceholder}>Search merchant or amount</Text>
        </View>

        {/* Filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {filterChips.map(c => (
            <TouchableOpacity
              key={c.key}
              onPress={() => setFilter(c.key)}
              style={[styles.chip, filter === c.key && styles.chipActive]}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipText, filter === c.key && styles.chipTextActive]}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Grouped transactions */}
        <View style={styles.groups}>
          {groups.map(g => (
            <View key={g.label} style={styles.group}>
              <Text style={styles.groupLabel}>{g.label}</Text>
              <View style={styles.groupItems}>
                {g.items.map(t => {
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
                        <View style={styles.txnMeta}>
                          <Text style={styles.txnCat}>{cat.name}</Text>
                          <View style={[styles.srcBadge, t.source === 'sms' ? styles.srcSms : styles.srcEmail]}>
                            <Text style={[styles.srcText, t.source === 'sms' ? styles.srcSmsText : styles.srcEmailText]}>
                              {t.source === 'sms' ? 'SMS' : 'Email'}
                            </Text>
                          </View>
                        </View>
                      </View>
                      <View style={styles.txnRight}>
                        <Text style={styles.txnAmount}>− {inr(t.amount)}</Text>
                        <Text style={styles.txnTime}>{t.time}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingBottom: 30 },
  title: { fontSize: 23, fontFamily: F.extraBold, color: C.dark, letterSpacing: -0.5, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 20, marginBottom: 14,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.border, borderRadius: 16, padding: 12,
  },
  searchPlaceholder: { fontSize: 14, fontFamily: F.medium, color: '#B0B0C2' },
  monthChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
    marginHorizontal: 20, marginBottom: 12, paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: 14, backgroundColor: C.primarySoft,
  },
  monthChipText: { fontSize: 13, fontFamily: F.bold, color: C.primary },
  monthChipX: { fontSize: 13, fontFamily: F.bold, color: C.primary },
  chipsRow: { paddingHorizontal: 20, paddingBottom: 16, gap: 8 },
  chip: {
    paddingVertical: 9, paddingHorizontal: 16, borderRadius: 14,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.border,
  },
  chipActive: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { fontSize: 13, fontFamily: F.bold, color: '#6A6A82' },
  chipTextActive: { color: '#fff' },
  groups: { paddingHorizontal: 20, gap: 18 },
  group: {},
  groupLabel: { fontSize: 12, fontFamily: F.bold, color: '#A0A0B5', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10, paddingLeft: 2 },
  groupItems: { gap: 9 },
  txnCard: { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: '#fff', borderRadius: 18, padding: 13, ...CARD_SHADOW },
  txnIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  txnInfo: { flex: 1, minWidth: 0 },
  txnMerchant: { fontSize: 14.5, fontFamily: F.bold, color: C.dark },
  txnMeta: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 3 },
  txnCat: { fontSize: 12, fontFamily: F.semiBold, color: C.muted },
  srcBadge: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: 7 },
  srcSms: { backgroundColor: '#E5EEFF' },
  srcEmail: { backgroundColor: '#FFE8E6' },
  srcText: { fontSize: 10.5, fontFamily: F.bold },
  srcSmsText: { color: '#3B82F6' },
  srcEmailText: { color: '#EA4335' },
  txnRight: { alignItems: 'flex-end' },
  txnAmount: { fontSize: 14.5, fontFamily: F.extraBold, color: C.dark },
  txnTime: { fontSize: 11, fontFamily: F.medium, color: C.dimmer, marginTop: 2 },
});
