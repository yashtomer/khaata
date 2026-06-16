import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { useApp } from '../src/context';
import { C, F } from '../src/theme';
import { GOOGLE_WEB_CLIENT_ID, GMAIL_SCOPES } from '../src/gmail';

// Native Google Sign-In: authenticates via Play Services (package + SHA-1),
// no browser redirect URIs — avoids the OAuth "invalid_request" error.
GoogleSignin.configure({
  webClientId: GOOGLE_WEB_CLIENT_ID,
  scopes: GMAIL_SCOPES,
  offlineAccess: false,
});

function WalletIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <Path d="M16 12h.01" />
      <Path d="M3 10h18" />
    </Svg>
  );
}

function MailIcon({ color = '#EA4335' }: { color?: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
      <Path d="m22 7-10 6L2 7" />
    </Svg>
  );
}

function SmsIcon({ color = '#3B82F6' }: { color?: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </Svg>
  );
}

function ShieldIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#A7A7BC" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </Svg>
  );
}

function CheckIcon() {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#12A45A" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20 6 9 17l-5-5" />
    </Svg>
  );
}

export default function Onboarding() {
  const { emailConnected, smsConnected, smsStatus, connectSms, disconnectSms, linkEmail, disconnectEmail } = useApp();
  const [smsLoading, setSmsLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const canContinue = emailConnected || smsConnected;

  const onPressSms = async () => {
    if (smsConnected) {
      disconnectSms();
      return;
    }
    setSmsLoading(true);
    await connectSms();
    setSmsLoading(false);
  };

  const onPressEmail = async () => {
    if (emailConnected) {
      // Tapping a linked account signs out of Gmail.
      await disconnectEmail();
      return;
    }
    setEmailLoading(true);
    // Try a silent restore first (no picker); fall back to the account picker.
    let r = await linkEmail(false);
    if (r !== 'ok') r = await linkEmail(true);
    setEmailLoading(false);
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
          Khaata reads your bank SMS and payment emails, then sorts every spend into the right
          category — no manual entry.
        </Text>

        {/* Connect buttons */}
        <View style={styles.connectList}>
          <TouchableOpacity style={styles.connectBtn} onPress={onPressEmail} activeOpacity={0.8} disabled={emailLoading}>
            <View style={[styles.connectIcon, { backgroundColor: '#FFE8E6' }]}>
              <MailIcon />
            </View>
            <View style={styles.connectInfo}>
              <Text style={styles.connectTitle}>Connect Email</Text>
              <Text style={styles.connectSub}>
                {emailConnected ? 'Reading Gmail payment receipts' : 'Gmail · payment receipts'}
              </Text>
            </View>
            {emailLoading ? (
              <ActivityIndicator color={C.primary} style={{ marginRight: 8 }} />
            ) : emailConnected ? (
              <View style={styles.linkedBadge}>
                <CheckIcon />
                <Text style={styles.linkedText}>Linked</Text>
              </View>
            ) : (
              <View style={styles.connectTag}>
                <Text style={styles.connectTagText}>Connect</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.connectBtn} onPress={onPressSms} activeOpacity={0.8} disabled={smsLoading}>
            <View style={[styles.connectIcon, { backgroundColor: '#E5EEFF' }]}>
              <SmsIcon />
            </View>
            <View style={styles.connectInfo}>
              <Text style={styles.connectTitle}>Connect SMS</Text>
              <Text style={styles.connectSub}>
                {smsConnected && smsStatus === 'ok'
                  ? 'Reading bank & UPI alerts'
                  : smsConnected && smsStatus === 'unsupported'
                  ? 'Demo data (not on device)'
                  : 'Bank & UPI alerts'}
              </Text>
            </View>
            {smsLoading ? (
              <ActivityIndicator color={C.primary} style={{ marginRight: 8 }} />
            ) : smsConnected ? (
              <View style={styles.linkedBadge}>
                <CheckIcon />
                <Text style={styles.linkedText}>Linked</Text>
              </View>
            ) : (
              <View style={styles.connectTag}>
                <Text style={styles.connectTagText}>Connect</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Privacy note */}
        <View style={styles.privacy}>
          <ShieldIcon />
          <Text style={styles.privacyText}>
            We only scan transaction messages. Nothing is shared and you can disconnect anytime.
          </Text>
        </View>

        <View style={{ flex: 1, minHeight: 18 }} />

        {/* Continue button */}
        {canContinue ? (
          <TouchableOpacity style={styles.continueBtn} onPress={() => router.replace('/(tabs)/')} activeOpacity={0.9}>
            <Text style={styles.continueBtnText}>Continue</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.continueBtnDisabled}>
            <Text style={styles.continueBtnDisabledText}>Connect a source to begin</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { flexGrow: 1, paddingHorizontal: 26, paddingBottom: 30, paddingTop: 8 },
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
  connectList: { flexDirection: 'column', gap: 12, marginTop: 24 },
  connectBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16,
    borderRadius: 20, borderWidth: 1.5, borderColor: C.border, backgroundColor: '#fff',
  },
  connectIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  connectInfo: { flex: 1 },
  connectTitle: { fontSize: 15, fontFamily: F.bold, color: C.dark },
  connectSub: { fontSize: 12.5, fontFamily: F.medium, color: '#9595AB', marginTop: 2 },
  linkedBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#E4F8EE', paddingVertical: 7, paddingHorizontal: 12, borderRadius: 14 },
  linkedText: { fontSize: 12, fontFamily: F.bold, color: '#12A45A' },
  connectTag: { backgroundColor: C.primarySoft, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 14 },
  connectTagText: { fontSize: 13, fontFamily: F.bold, color: C.primary },
  privacy: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginTop: 18, paddingHorizontal: 2 },
  privacyText: { flex: 1, fontSize: 11.5, fontFamily: F.medium, color: '#A7A7BC', lineHeight: 17 },
  continueBtn: {
    width: '100%', paddingVertical: 17, borderRadius: 20, backgroundColor: C.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#6358E8', shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.38, shadowRadius: 28, elevation: 10,
  },
  continueBtnText: { fontSize: 16, fontFamily: F.bold, color: '#fff' },
  continueBtnDisabled: { width: '100%', paddingVertical: 17, borderRadius: 20, backgroundColor: '#E6E6EE', alignItems: 'center' },
  continueBtnDisabledText: { fontSize: 16, fontFamily: F.bold, color: '#A9A9BC' },
});
