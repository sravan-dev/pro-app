# Tijus LMS (Android)

One app for students and tutors. Package: `app.tijusacademy.com`. Talks to the
live API at https://login.tijusacademy.com (set in `app/build.gradle.kts`, `BASE_URL`).

- **Students:** see live/upcoming/past classes, book a 1-on-1 from a tutor's open slots, join.
- **Tutors:** schedule and edit classes (course + optional student), end live classes,
  publish/remove availability slots, join.
- **Join** opens the web room (`/call/<id>?autojoin=1`) inside the app, signed in with the
  app's session cookie, so video, chat and whiteboard match the web. Hanging up calls
  `window.TijusApp.leave()` to close the screen.
- Staff roles (admin, manager, advisor) are refused at sign-in; they use the web portal.

## Build

Needs JDK 17 and the Android SDK (`local.properties` -> `sdk.dir=...`).

    ./gradlew assembleDebug      # app/build/outputs/apk/debug/app-debug.apk

Release (Play Store / sideload) needs a keystore. Create one once and keep it safe —
losing it means you can't update the app:

    keytool -genkeypair -v -keystore tijus-release.jks -alias tijus -keyalg RSA -keysize 2048 -validity 10000

Then add `android/keystore.properties` (git-ignored):

    storeFile=../tijus-release.jks
    storePassword=...
    keyAlias=tijus
    keyPassword=...

and run `./gradlew bundleRelease` (Play Store .aab) or `./gradlew assembleRelease` (.apk).
Bump `versionCode` in `app/build.gradle.kts` for every release.
