# Product

<!-- impeccable:product-schema 1 -->

## Platform

android

## Stack

Expo (React Native 0.86) + expo-router, Uniwind (Tailwind 4) + HeroUI Native, Solana Kit v7 with `@solana-program/memo`, Mobile Wallet Adapter via `@wallet-ui/react-native-kit`, TanStack Query, MMKV, Reanimated. Scaffolded from the official `expo-kit-wallet` Solana Mobile template.

## Users

Habit-seekers who happen to hold crypto: solo people already trying to keep streaks (fitness, language, sleep, deep work) who want real consequences on a missed day. Crypto is the mechanism, not the identity. They open the app once a day, for seconds, under low motivation.

## Product Purpose

PUNCH is an on-chain punch card. A user stakes SKR as a commitment bond, punches in once per calendar day, and keeps their streak. Miss a day and the stake is redistributed to everyone who punched in that day. Success means the app is opened daily without willpower, and the streak number is the reason.

## Positioning

Other habit apps nag; PUNCH makes the streak expensive. The differentiator is a real, liquid, self-funding penalty: the money a slacker loses is paid directly to the people who showed up, with no treasury, no subscription, and no lender of last resort. Nothing a neighbouring habit tracker could copy without also being a Solana app.

## Operating Context

- Daily single-tap session, normally under 15 seconds, usually first thing in the morning.
- Seeker Android device; devnet cluster selected in-app, switchable in Settings.
- The hackathon submission window: functional APK, GitHub repo, demo video, pitch deck, due 2026-10-08 (per the official CLOCK IN builder guide). dApp Store publication is required only after winning, within 30 days of results.
- Demo video shot on an emulator or device against devnet.

## Capabilities and Constraints

- Connect a wallet through Mobile Wallet Adapter; the address is the identity, no separate accounts.
- Punch in once per local calendar day. Each punch is a memo-program transaction carrying a signed payload (address, day, streak count), so every punch is independently verifiable on chain.
- The bond is an SPL Token delegate approval to the keeper; tokens stay in the member's wallet. Missed-shift penalties settle as SPL `TransferChecked` by the keeper (Rust/Axum, `keeper/`), computed from the punch records and split between bonded members who punched.
- SKR is the staking and reward asset. SKR exists only on mainnet; the app reads the mint from configuration and ships pointing at a devnet stand-in mint, with the mainnet SKR mint (`SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3`) ready to swap in. This substitution must be stated plainly in submission copy.
- Devnet only for the hackathon build. Cluster is user-selectable.
- No custom on-chain program: Memo, SPL Token and System only. Every record touches a per-pact clock PDA so `getSignaturesForAddress` is the index. Settlement is deterministic over on-chain records; the keeper is a trusted settler and the README says so.
- Seeker Genesis Token holders are verified by the keeper (mainnet, full four-field check) and marked on the roster.
- One participant, team PRITU, track CLOCK IN HACKATHON.

## Brand Commitments

Name: PUNCH. Voice: direct, terse, unsentimental — it states the number and the consequence, it does not cheerlead.

## Evidence on Hand

None yet: no real user research, testimonials, metrics, or press. No logo or brand assets exist. Future work must not invent any of these.

## Product Principles

1. The streak number is the interface; everything else is supporting evidence.
2. One tap does the job — if punching in takes longer than ten seconds the product has failed.
3. Never soften the consequence. The rule is the value proposition.
4. Every claim the UI makes must be checkable against a transaction the user can open.
5. Ship the demo before the roadmap; this is a hackathon submission, not a company.

## Accessibility & Inclusion

No product-specific requirement was established. Minimum floor: legible contrast in both light and dark themes, text scaling respected for numbers, and every action reachable without gesture-only affordances.
