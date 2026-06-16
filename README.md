# Khaata

A personal-finance / expense tracker for India. Khaata reads your bank & UPI
**SMS** and payment **emails (Gmail)**, parses them into categorized debit
transactions, and shows spending, a tappable 6-month trend, a full per-category
breakdown, and budgets. Off-device (iOS, web, Expo Go) it falls back to a demo
dataset so the UI is always usable.

Built with **Expo SDK 52** + **React Native 0.76** (new architecture),
**expo-router**, TypeScript.

## Features

- **SMS import** (Android) via a local native module (`modules/sms-reader`),
  parsed into amount / merchant / category.
- **Gmail import** via native Google Sign-In (`@react-native-google-signin`),
  metadata-first fetch for speed, full email loaded on demand in the detail view.
- **SMS↔email de-duplication** (same-day, same-amount).
- **On-device categorisation**: user overrides → keyword rules → a 1-NN
  char-n-gram classifier — all offline. Plus an optional **cloud LLM fallback**
  (self-hosted OpenAI-compatible endpoint) for unknown email senders.
- **Persistent learning**: correct a category once and every transaction from
  that merchant (past & future) follows, saved on device.
- **Session persistence**: SMS + Gmail reconnect silently on launch; the
  dashboard Account sheet offers Re-authenticate / Sign out.
- Editable name + Google profile photo on the dashboard.

## Prerequisites

- Node 20+, `npm`
- **JDK 17** (Android Gradle Plugin rejects newer JDKs)
- Android SDK (platform-tools, `platforms;android-35`, `build-tools;35.0.0`, NDK)
- For iOS: macOS with Xcode + CocoaPods

## Setup

```bash
npm install
cp khaata.secrets.example.json khaata.secrets.json   # optional: add your LLM token
```

`khaata.secrets.json` (gitignored) holds the cloud-LLM bearer token; without it
the LLM fallback is simply disabled. Google OAuth client IDs live in
`app.json → extra` (the Android client must be registered with the app package
`com.khaata.app` and the signing SHA-1).

## Run (development)

```bash
npx expo start        # press a (Android), i (iOS), w (web), or scan in Expo Go
```

> Real SMS/Gmail reading only works in a dev build or the installed app — Expo
> Go and web use the demo dataset.

## Build — Android

The native project is generated from config (Continuous Native Generation):

```bash
npx expo prebuild --platform android   # generates ./android
cd android && ./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk
```

Kotlin is pinned to 1.9.24 automatically via the `expo-build-properties` plugin
(RN 0.76 / expo-modules-core compatibility). The release build signs with the
debug keystore by default; for Gmail OAuth to keep working after a rebuild,
register that keystore's SHA-1 with your Google Android OAuth client (or add
your own keystore + signing config).

## Build — iOS (macOS)

```bash
npx expo prebuild --platform ios       # generates ./ios + installs pods
npx expo run:ios --configuration Release
# or open ios/Khaata.xcworkspace in Xcode and Archive
```

iOS does not read SMS (no platform API); it uses Gmail + the demo fallback. Add
an iOS Google OAuth client / URL scheme if enabling Gmail on iOS.

## Project layout

```
app/                 expo-router screens (index, onboarding, (tabs)/*, transaction/[id])
src/
  data.ts            Transaction model, categories, budgets, demo data, formatters
  smsParser.ts       SMS parsing + extractPaidAmount (email totals)
  gmail.ts           Google Sign-In, Gmail fetch/parse, on-demand body
  llm.ts             optional cloud-LLM category fallback
  categorizer.ts     on-device 1-NN category model
  categoryStore.ts   AsyncStorage: overrides, learning, name, photo, session flags
  context.tsx        app state, connect/restore, dedupe
modules/sms-reader/  local Expo native module (Android SMS inbox)
scripts/testParser.ts  parser test (npx tsx scripts/testParser.ts)
```
