# Building the TA Diary Android APK

The app is a static web app wrapped as a native Android app with
[Capacitor](https://capacitorjs.com/). The wrapper loads the same
`index.html` / `app.js` / `styles.css` / `seed.js` inside an Android WebView.

## One-time setup (already done in this repo)

- `capacitor.config.json` — app id `com.arulm.tadiary`, name **TA Diary**, `webDir: www`
- `scripts/copy-web.mjs` — copies the web files into `www/`
- `android/` — the generated native project

Requirements on the build machine:

- **Node.js** (installs Capacitor)
- **JDK 17** (`java -version`)
- **Android SDK** with platform **android-34** and **build-tools 34.0.0**
  (Android Studio installs these). Set `ANDROID_HOME`, or keep
  `android/local.properties` pointing at the SDK with **forward slashes**:
  `sdk.dir=C:/Users/<you>/AppData/Local/Android/Sdk`

## Build the (debug) APK

```bash
npm install
npm run apk
```

`npm run apk` = copy web assets → `npx cap copy android` → `gradlew assembleDebug`.

Output APK:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

Copy that file to a phone and open it to install (enable *Install unknown apps*
for your file manager). The debug APK is signed with the Android debug key, so
it installs fine for personal/internal use.

## After changing any web file

Re-run `npm run apk` (it re-copies `www/` and rebuilds).

## Cloud (Supabase) vs offline

The APK bundles whatever `config.js` contains at build time:

- Placeholder values → **offline/local mode** (PINs + data stored on the device).
- Real Supabase URL + anon key → **cloud mode** (login + sync via Supabase).

Edit `config.js` before running `npm run apk` to choose.

> Note: OCR (diary photo → text), Supabase sync, and Google Fonts load from the
> internet at runtime. Core TA/Diary/Visit features work fully offline.

## Release (Play Store / signed) APK — optional

For a Play Store upload you need a release keystore and an `.aab`:

```bash
cd android
./gradlew bundleRelease   # or assembleRelease for a signed APK
```

Configure signing in `android/app/build.gradle` with your own keystore first.
