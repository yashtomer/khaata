# Building Khaata for Android (installable APK)

Khaata now includes a **real SMS-reading feature**, which uses native Android
code. That means it can no longer run in the generic **Expo Go** app — you need
a custom build (a *development build* or a standalone **APK**).

> ⚠️ The cloud sandbox this was developed in cannot build the APK: its network
> policy blocks Google's Android Maven (`dl.google.com`, `maven.google.com`).
> Run one of the options below on a machine (or CI) that can reach those.

---

## What the SMS feature does

- On **Connect SMS**, the app requests the Android `READ_SMS` runtime permission.
- It reads your SMS inbox (`modules/sms-reader`, a Kotlin Expo module).
- It parses **bank / UPI debit messages** into transactions
  (`src/smsParser.ts`) — amount, merchant, and an auto-assigned category — and
  filters out OTPs, credits, and promos.
- Everything stays **on-device**; nothing is uploaded.
- On iOS / web / Expo Go (where the native module isn't present) it falls back
  to the bundled demo data so the UI still works.

`READ_SMS` is a restricted permission on the Google Play Store, but **sideloading
your own APK onto your own phone works without any Play review.**

---

## Option A — EAS Build (cloud, easiest; needs a free Expo account)

```bash
npm install -g eas-cli
eas login                       # your Expo account
eas build:configure
eas build --profile preview --platform android
```

`preview` is configured in `eas.json` to output an **APK**. When the build
finishes EAS gives you a download link / QR — open it on your phone to install.

## Option B — Local build (no account; needs Android SDK + JDK 17/21)

```bash
# one-time: install Android Studio or the command-line SDK, then
export ANDROID_HOME=$HOME/Android/Sdk

npx expo prebuild --platform android   # generates the native android/ project
cd android
./gradlew assembleRelease              # signed-release APK (or assembleDebug)
# → android/app/build/outputs/apk/release/app-release.apk
```

Copy the APK to your phone (USB, Drive, etc.), then enable **Install unknown
apps** for your file manager and tap it. For `assembleDebug` no signing setup is
needed; for `assembleRelease` add a keystore (`android/app/...`) or let Expo
prebuild manage it.

## Option C — Install directly over USB (fastest iteration)

```bash
# phone in Developer Mode + USB debugging, plugged in
npx expo run:android --variant release
```

This builds and installs straight onto the connected device.

---

## After install

1. Open Khaata → onboarding → **Connect SMS**.
2. Grant the SMS permission when prompted.
3. Your real current-month bank/UPI spends populate the dashboard, categories,
   activity, and budgets.
