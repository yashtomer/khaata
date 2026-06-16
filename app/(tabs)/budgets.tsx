import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { useApp } from '../../src/context';
import { CATEGORIES, BUDGETS, getCategoryMap, inr } from '../../src/data';
import { C, F, CARD_SHADOW } from '../../src/theme';
import { Icon } from '../../components/Icon';

function PlusIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#8585A0" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 5v14" />
      <Path d="M5 12h14" />
    </Svg>
  );
}

export default function BudgetsScreen() {
  const { txns } = useApp();

  const { budgets, budgetSpent, totalLimit } = useMemo(() => {
    const catMap = getCategoryMap();
    const totals: Record<string, number> = {};
    txns.forEach(t => (totals[t.cat] = (totals[t.cat] || 0) + t.amount));

    const budgets = BUDGETS.map(b => {
      const cat = catMap[b.cat];
      const spent = totals[b.cat] || 0;
      const over = spent > b.limit;
      const ratio = Math.min(1, spent / b.limit);
      return { key: b.cat, name: cat.name, color: cat.color, bg: cat.bg, paths: cat.paths, spent, limit: b.limit, over, ratio };
    });

    const budgetSpent = BUDGETS.reduce((a, b) => a + (totals[b.cat] || 0), 0);
    const totalLimit = BUDGETS.reduce((a, b) => a + b.limit, 0);

    return { budgets, budgetSpent, totalLimit };
  }, [txns]);

  const overallRatio = Math.min(1, budgetSpent / totalLimit);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Budgets</Text>

        {/* Overall budget card */}
        <LinearGradient colors={['#1B1B2A', '#2E2B45']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.overallCard}>
          <View style={styles.overallTop}>
            <Text style={styles.overallLabel}>Monthly budget</Text>
            <View style={styles.monthChip}>
              <Text style={styles.monthChipText}>June 2026</Text>
            </View>
          </View>
          <View style={styles.overallAmounts}>
            <Text style={styles.overallSpent}>{inr(budgetSpent)}</Text>
            <Text style={styles.overallLimit}> / {inr(totalLimit)}</Text>
          </View>
          <View style={styles.overallBarBg}>
            <LinearGradient colors={['#8E7BF5', '#B49BFA']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.overallBarFill, { width: `${overallRatio * 100}%` as any }]} />
          </View>
          <Text style={styles.overallLeft}>{inr(Math.max(0, totalLimit - budgetSpent))} left to spend</Text>
        </LinearGradient>

        {/* Per-category budgets */}
        <View style={styles.catList}>
          {budgets.map(b => (
            <View key={b.key} style={styles.catCard}>
              <View style={styles.catRow}>
                <View style={[styles.catIcon, { backgroundColor: b.bg }]}>
                  <Icon paths={b.paths} color={b.color} size={20} />
                </View>
                <View style={styles.catInfo}>
                  <Text style={styles.catName}>{b.name}</Text>
                  <Text style={styles.catSub}>{inr(b.spent)} of {inr(b.limit)}</Text>
                </View>
                <View style={[styles.tag, b.over ? styles.tagOver : styles.tagNormal]}>
                  <Text style={[styles.tagText, b.over ? styles.tagOverText : styles.tagNormalText]}>
                    {b.over ? `Over by ${inr(b.spent - b.limit)}` : `${Math.round(b.ratio * 100)}%`}
                  </Text>
                </View>
              </View>
              <View style={styles.barBg}>
                <View style={[styles.barFill, { width: `${b.ratio * 100}%` as any, backgroundColor: b.over ? '#EF4444' : b.color }]} />
              </View>
            </View>
          ))}
        </View>

        <TouchableOpacity style={styles.addBtn} activeOpacity={0.7}>
          <PlusIcon />
          <Text style={styles.addBtnText}>Add a budget</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 20, paddingBottom: 30, paddingTop: 6 },
  title: { fontSize: 23, fontFamily: F.extraBold, color: C.dark, letterSpacing: -0.5, paddingVertical: 8, marginBottom: 2 },
  overallCard: {
    borderRadius: 26, padding: 22, marginBottom: 16,
    shadowColor: '#1B1B2A', shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.3, shadowRadius: 34, elevation: 10,
  },
  overallTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  overallLabel: { fontSize: 13, fontFamily: F.semiBold, color: 'rgba(255,255,255,0.75)' },
  monthChip: { backgroundColor: 'rgba(255,255,255,0.14)', paddingVertical: 5, paddingHorizontal: 11, borderRadius: 14 },
  monthChipText: { fontSize: 13, fontFamily: F.bold, color: '#fff' },
  overallAmounts: { flexDirection: 'row', alignItems: 'baseline', marginTop: 14 },
  overallSpent: { fontSize: 32, fontFamily: F.extraBold, color: '#fff', letterSpacing: -1 },
  overallLimit: { fontSize: 15, fontFamily: F.semiBold, color: 'rgba(255,255,255,0.6)' },
  overallBarBg: { height: 9, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.16)', marginTop: 14, overflow: 'hidden' },
  overallBarFill: { height: '100%', borderRadius: 6 },
  overallLeft: { fontSize: 12.5, fontFamily: F.semiBold, color: 'rgba(255,255,255,0.8)', marginTop: 10 },
  catList: { gap: 11 },
  catCard: { backgroundColor: '#fff', borderRadius: 20, padding: 15, ...CARD_SHADOW },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  catIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  catInfo: { flex: 1, minWidth: 0 },
  catName: { fontSize: 14.5, fontFamily: F.bold, color: C.dark },
  catSub: { fontSize: 12, fontFamily: F.medium, color: C.muted, marginTop: 2 },
  tag: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 11 },
  tagOver: { backgroundColor: '#FDE0E0' },
  tagNormal: { backgroundColor: '#F0F0F6' },
  tagText: { fontSize: 11.5, fontFamily: F.extraBold },
  tagOverText: { color: '#EF4444' },
  tagNormalText: { color: '#8585A0' },
  barBg: { height: 7, borderRadius: 6, backgroundColor: '#F0F0F6', marginTop: 12, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 6 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    marginTop: 14, paddingVertical: 15, borderWidth: 1.6, borderColor: '#CFCFE0',
    borderStyle: 'dashed', borderRadius: 18, backgroundColor: 'transparent',
  },
  addBtnText: { fontSize: 14, fontFamily: F.bold, color: '#8585A0' },
});
