# Publishing PUNCH to the Solana dApp Store

Winners must publish within 30 days of results. Checklist:

1. **Release signing key.** Generate a dedicated keystore (never the debug key, never committed):
   `keytool -genkeypair -v -keystore punch-release.jks -alias punch -keyalg RSA -keysize 2048 -validity 10000`.
   Wire it into `android/app/build.gradle` `signingConfigs.release` via `~/.gradle/gradle.properties`, bump
   `android.versionCode` in `app.json` for every upload.
2. **Mainnet.** Run a keeper against mainnet RPC with a funded key, set `EXPO_PUBLIC_KEEPER_URL`, and create the
   public pacts bonded in SKR (`SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3`). Ship with the cluster defaulting to
   mainnet.
3. **Listing assets.** Icon 512×512 (`assets/images/icon-512.png`), at least four phone screenshots (Clock unpaid,
   Clock paid, Floor, Ledger), a 1200×600 banner, short and long description, privacy policy URL.
4. **Publisher Portal.** Create the publisher and app at the Solana dApp Store Publisher Portal, connect a publisher
   wallet, upload the signed release APK and assets, submit for review.
5. **After approval.** Keep the keeper running; the ORE and Seeker-floor milestones in the deck are the follow-ups.
