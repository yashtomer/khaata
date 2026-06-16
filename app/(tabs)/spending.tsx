import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useApp } from '../../src/context';
import { CATEGORIES, inr, getCategoryMap } from '../../src/data';
import { C, F, CARD_SHADOW } from '../../src/theme';
import { DonutChart } from '../../components/DonutChart';
import { Icon } from '../../components/Icon';

export default function SpendingScreen() {
  const { txns, setFilter } = useApp();

  const { monthTotal, breakdown, donutSegs } = useMemo(() => {
    const totals: Record<string, number> = {};
    txns.forEach(t => (totals[t.cat] = (totals[t.cat] || 0) + t.amount));
    const monthTotal = txns.reduce((a, t) => a + t.amount, 0);

    let breakdown = CATEGORIES.map(c => ({
      key: c.key, name: c.name, short: c.short, color: c.color, bg: c.bg, paths: c.paths,
      amount: totals[c.key] || 0,
      count: txns.filter(t => t.cat === c.key).length,
    })).filter(b => b.amount > 0).sort((a, b) => b.amount - a.amount);

    const maxAmt = breakdown.length ? breakdown[0].amount : 1;
    const donutSegs = breakdown.map(b => ({ pct: (b.amount / monthTotal) * 100, color: b.color }));

    return { monthTotal, breakdown: breakdown.map(b => ({ ...b, ratio: b.amount / maxAmt })), donutSegs };
  }, [txns]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Spending</Text>
          <View style={styles.monthChip}>
            <Text style={styles.monthChipText}>June 2026</Text>
          </View>
        </View>

        {/* Donut card */}
        <View style={[styles.card, styles.donutCard]}>
          <DonutChart
            segments={donutSegs}
            size={168}
            holeRatio={0.54}
            centerLabel="Total spent"
            centerValue={inr(monthTotal)}
            centerSub={`${txns.length} transactions`}
          />
        </View>

        {/* Category list */}
        <View style={styles.catList}>
          {breakdown.map(b => (
            <TouchableOpacity
              key={b.key}
              style={styles.catCard}
              onPress={() => { setFilter(b.key); router.push('/(tabs)/activity'); }}
              activeOpacity={0.8}
            >
              <View style={styles.catRow}>
                <View style={[styles.catIcon, { backgroundColor: b.bg }]}>
                  <Icon paths={b.paths} color={b.color} size={20} />
                </View>
                <View style={styles.catInfo}>
                  <Text style={styles.catName}>{b.name}</Text>
                  <Text style={styles.catCount}>{b.count} transaction{b.count !== 1 ? 's' : ''}</Text>
                </View>
                <View style={styles.catRight}>
                  <Text style={styles.catAmount}>{inr(b.amount)}</Text>
                  <Text style={styles.catPct}>{Math.round((b.amount / monthTotal) * 100)}%</Text>
                </View>
              </View>
              <View style={styles.barBg}>
                <View style={[styles.barFill, { width: `${b.ratio * 100}%` as any, backgroundColor: b.color }]} />
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 20, paddingBottom: 30, paddingTop: 6 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, marginBottom: 2 },
  title: { fontSize: 23, fontFamily: F.extraBold, color: C.dark, letterSpacing: -0.5 },
  monthChip: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.border, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 14 },
  monthChipText: { fontSize: 13, fontFamily: F.bold, color: C.text },
  card: { backgroundColor: '#fff', borderRadius: 26, padding: 24, ...CARD_SHADOW },
  donutCard: { alignItems: 'center', marginBottom: 16 },
  catList: { gap: 11 },
  catCard: { backgroundColor: '#fff', borderRadius: 20, padding: 15, ...CARD_SHADOW },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  catIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  catInfo: { flex: 1, minWidth: 0 },
  catName: { fontSize: 14.5, fontFamily: F.bold, color: C.dark },
  catCount: { fontSize: 12, fontFamily: F.medium, color: C.muted, marginTop: 2 },
  catRight: { alignItems: 'flex-end' },
  catAmount: { fontSize: 15, fontFamily: F.extraBold, color: C.dark },
  catPct: { fontSize: 11.5, fontFamily: F.bold, color: C.dim, marginTop: 2 },
  barBg: { height: 7, borderRadius: 6, backgroundColor: '#F0F0F6', marginTop: 12, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 6 },
});
