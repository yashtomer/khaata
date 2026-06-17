import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Redirect } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useApp } from '../src/context';
import { C, F } from '../src/theme';

function WalletIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <Path d="M16 12h.01" />
      <Path d="M3 10h18" />
    </Svg>
  );
}

/** The multi-colour Google "G" mark. */
function GoogleG() {
  return (
    <Svg width={20} height={20} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

function CheckDot() {
  return (
    <View style={styles.checkDot}>
      <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M20 6 9 17l-5-5" />
      </Svg>
    </View>
  );
}

const FEATURES = [
  'Reads your bank SMS & Gmail receipts automatically',
  'Sorts every spend into the right category',
  'Private — your data stays on your device',
];

export default function Onboarding() {
  const { loggedIn, login } = useApp();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  // Already signed in (e.g. navigated back here) → straight to the dashboard.
  if (loggedIn) return <Redirect href="/(tabs)" />;

  const onContinue = async () => {
    setError(false);
    setLoading(true);
    const r = await login();
    setLoading(false);
    if (r === 'ok') router.replace('/(tabs)');
    else setError(true);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Logo */}
        <View style={styles.logoRow}>
          <View style={styles.logoIcon}>
            <WalletIcon />
          </View>
          <Text style={styles.logoText}>Khaata</Text>
        </View>

        {/* Preview card */}
        <LinearGradient colors={['#6358E8', '#8E7BF5', '#B49BFA']} start={{ x: 0.1, y: 0 }} end={{ x: 1, y: 1 }} style={styles.previewCard}>
          <View style={styles.bubble1} />
          <View style={styles.bubble2} />
          <Text style={styles.previewMonth}>June 2026</Text>
          <Text style={styles.previewAmount}>₹48,890</Text>
          <View style={styles.previewBadge}>
            <View style={styles.greenDot} />
            <Text style={styles.previewBadgeText}>Auto-tracked from 22 messages</Text>
          </View>
        </LinearGradient>

        {/* Headline */}
        <Text style={styles.headline}>Track every rupee,{'\n'}automatically.</Text>
        <Text style={styles.desc}>
          Khaata turns your bank SMS and payment emails into a clear, categorised view of where
          your money goes — no manual entry.
        </Text>

        {/* Feature bullets */}
        <View style={styles.features}>
          {FEATURES.map(f => (
            <View key={f} style={styles.featureRow}>
              <CheckDot />
              <Text style={styles.featureText}>{f}</Text>
            </View>
          ))}
        </View>

        <View style={{ flex: 1, minHeight: 24 }} />

        {/* Continue with Google */}
        <TouchableOpacity style={styles.googleBtn} onPress={onContinue} activeOpacity={0.85} disabled={loading}>
          {loading ? (
            <ActivityIndicator color={C.primary} />
          ) : (
            <>
              <GoogleG />
              <Text style={styles.googleBtnText}>Continue with Google</Text>
            </>
          )}
        </TouchableOpacity>
        {error && <Text style={styles.errorText}>Sign-in didn't complete. Please try again.</Text>}

        <Text style={styles.legal}>
          By continuing you agree to let Khaata read your transaction messages on this device.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { flexGrow: 1, paddingHorizontal: 26, paddingBottom: 28, paddingTop: 8 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  logoIcon: {
    width: 38, height: 38, borderRadius: 12, backgroundColor: C.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#6358E8', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 18, elevation: 8,
  },
  logoText: { fontSize: 20, fontFamily: F.extraBold, color: C.dark, letterSpacing: -0.3 },
  previewCard: {
    height: 172, borderRadius: 28, marginTop: 30, overflow: 'hidden',
    shadowColor: '#6358E8', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.3, shadowRadius: 40, elevation: 10,
  },
  bubble1: { position: 'absolute', top: -30, right: -20, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.14)' },
  bubble2: { position: 'absolute', bottom: -44, left: -26, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.10)' },
  previewMonth: { position: 'absolute', left: 24, top: 26, fontSize: 13, fontFamily: F.semiBold, color: 'rgba(255,255,255,0.85)' },
  previewAmount: { position: 'absolute', left: 24, top: 44, fontSize: 34, fontFamily: F.extraBold, color: '#fff', letterSpacing: -1 },
  previewBadge: {
    position: 'absolute', left: 24, top: 110,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.18)', paddingVertical: 5, paddingHorizontal: 11, borderRadius: 20,
  },
  greenDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#7DF3C0' },
  previewBadgeText: { fontSize: 12, fontFamily: F.semiBold, color: '#fff' },
  headline: { fontSize: 25, fontFamily: F.extraBold, color: C.dark, letterSpacing: -0.6, lineHeight: 30, marginTop: 26 },
  desc: { fontSize: 14, fontFamily: F.medium, color: C.muted, lineHeight: 22, marginTop: 10 },
  features: { gap: 14, marginTop: 24 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#16A34A', alignItems: 'center', justifyContent: 'center' },
  featureText: { flex: 1, fontSize: 14, fontFamily: F.semiBold, color: C.text, lineHeight: 19 },
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 11,
    width: '100%', paddingVertical: 16, borderRadius: 18, backgroundColor: '#fff',
    borderWidth: 1.5, borderColor: '#E4E2EE',
    shadowColor: '#1A1730', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.08, shadowRadius: 20, elevation: 4,
  },
  googleBtnText: { fontSize: 15.5, fontFamily: F.bold, color: '#3C4043' },
  errorText: { fontSize: 12.5, fontFamily: F.semiBold, color: '#EF4444', textAlign: 'center', marginTop: 12 },
  legal: { fontSize: 11.5, fontFamily: F.medium, color: '#A7A7BC', lineHeight: 17, textAlign: 'center', marginTop: 16, paddingHorizontal: 8 },
});
