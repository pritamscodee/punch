# PUNCH

**A time clock for your habit, bonded in SKR.** Punch in once per shift. Miss a shift and your penalty is paid
straight to the people who showed up. No treasury, no subscription, no house cut.

Built for the Solana Mobile **CLOCK IN** hackathon. Android only, Mobile Wallet Adapter, live on devnet.

| | |
|---|---|
| App | Expo / React Native 0.86, expo-router, Solana Kit 7, Mobile Wallet Adapter (`@wallet-ui/react-native-kit`) |
| Keeper | Rust, Axum 0.8, Postgres (NeonDB) via sqlx, hand-rolled Solana JSON-RPC client |
| On chain | SPL Memo + SPL Token + System program. No custom program. |
| Bond asset | **SKR** on mainnet (`SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3`), **tSKR** devnet stand-in for testing |

## How it works

1. **Join a pact.** One wallet signature creates your token account, **approves** the keeper as SPL delegate for
   your bond, and writes a `JOIN` record. The bond never leaves your wallet.
2. **Punch in.** Once per shift, one tap, one signature: an SPL Memo `PUNCH1|IN|<pact>|<shift>|<you>`.
3. **Settle.** When a shift closes, the keeper reads the pact's on-chain history, and for every bonded member who did
   not punch in, moves one penalty through their delegate approval, split evenly between the bonded members who did.
   It writes a `SETTLE` record so a shift is never charged twice.

Every number in the app resolves to a transaction you can open in Solana Explorer.

### The protocol, without a custom program

Each PUNCH transaction carries a memo and a **zero-lamport transfer to the pact's clock address**, a PDA derived from
`["punch-clock", pactId]` under the Memo program that nobody can sign for. So `getSignaturesForAddress(clock)`
returns the complete history of a pact, memo text included: no indexer, no account rent, no program to audit.
Pact definitions also touch a registry PDA (`["punch-registry"]`), which makes every pact discoverable on chain.

```
PUNCH1|PACT|<id>|<name>|<mint>|<decimals>|<bond>|<penalty>|<period>|<origin>|<settler>
PUNCH1|JOIN|<id>|<owner>
PUNCH1|IN|<id>|<shift>|<owner>
PUNCH1|SETTLE|<id>|<shift>|<slashed>|<paid>|<missed>|<punched>
```

Rules, enforced the same way in `src/features/punch/protocol` (app) and `keeper/src/protocol.rs` (keeper):

- A punch counts only for the shift the **cluster's block time** puts it in. No backdating.
- Only members count, and you are on the hook from the first **full** shift after you join.
- The keeper verifies each `JOIN`/`IN` claim against the transaction's actual signers before it moves tokens.
- Only **bonded** members (approval and balance cover one penalty) are charged *or paid*. Joining with an empty wallet
  to farm payouts gets nothing.
- The app warns before you join a pact whose settler is not the PUNCH keeper.

### Seeker integration

- **Mobile Wallet Adapter** for every signature; Seed Vault on Seeker.
- **Seeker Genesis Token** verification: the keeper checks each member's SGT on mainnet per Solana Mobile's published
  procedure (mint authority, metadata pointer authority and address, and token group membership must all match).
  Verified members wear a SEEKER mark on the floor roster. The address checked is always one that signed a `JOIN`.
- Haptics on the punch key, local shift-close reminders, deep links (`punch://pact/DEMO`), QR invites, Android share.

## Run it

### App (Android)

Requirements: Node 20+, JDK 17, Android SDK, a device or emulator with a Solana wallet installed
(Seed Vault on Seeker, Phantom or Solflare on any Android, or the
[mock MWA wallet](https://github.com/solana-mobile/mock-mwa-wallet) for an emulator).

```bash
npm install
npm run android           # development build on a connected device or emulator
```

Release APK:

```bash
npx expo prebuild -p android
cd android && ./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk
```

Point the app at a keeper with `EXPO_PUBLIC_KEEPER_URL=https://… npx expo prebuild -p android`, or change it at runtime
in **Settings → Keeper**. On an emulator against a local keeper, use `http://10.0.2.2:8787`.

### Keeper

```bash
cd keeper
cp .env.example .env
cargo run -- keygen          # paste the KEEPER_SECRET line into .env
# fund the printed address with devnet SOL (https://faucet.solana.com)
cargo run -- setup           # creates the tSKR test mint and registers the DAWN and DEMO pacts
cargo run -- serve           # HTTP API on :8787 + settlement loop every 30 s
cargo test
```

`DATABASE_URL` takes a NeonDB (or any Postgres) connection string; the schema in `keeper/migrations` is applied at
startup. Without it the keeper runs on in-memory storage. Deploy on Render with the Blueprint in `render.yaml` (Docker, `keeper/Dockerfile`).

| Endpoint | |
|---|---|
| `GET /health` | keeper address, store backend |
| `GET /v1/config` | settler, tSKR mint, registry |
| `GET /v1/pacts`, `GET /v1/pacts/:id` | verified pact summaries incl. Seeker members |
| `GET /v1/pacts/:id/settlements` | settlement history |
| `POST /v1/pacts/:id/settle` | settle closed shifts now |
| `GET /v1/wallets/:owner` | exact payouts earned and lost |
| `POST /v1/faucet` `{ "owner": "…" }` | devnet test kit: 100 tSKR (+0.05 SOL when empty) |

### Public pacts on devnet

| Code | Shift | Penalty | Bond |
|---|---|---|---|
| `DAWN` | 24 h, closes 00:00 UTC | 10 tSKR | 50 tSKR |
| `DEMO` | 5 min | 5 tSKR | 50 tSKR |

`DEMO` exists so you can see a full punch → miss → settle cycle in minutes.

## Trust model, stated plainly

- Funds stay in members' wallets until a settlement. The keeper can move at most what each member approved, only one
  penalty per missed shift, and only to members who punched that shift. Revoking the approval in any wallet ends it.
- The keeper is a trusted settler: it decides *when* to settle. Its rules are deterministic over public on-chain data,
  so anyone can recompute every settlement from the clock address history.
- SKR exists only on mainnet. This build runs on devnet with **tSKR**, a stand-in mint issued by the keeper's faucet.
  The mainnet SKR mint is wired in and selectable when the app's cluster is mainnet.

## Repository map

```
src/app/                      routes: (tabs)/ Clock · Floor · Ledger, pact/[id], pact/new, settings/
src/features/punch/protocol   records, ledger rules, PDAs (mirror of keeper/src/protocol.rs)
src/features/punch/data-access  RPC history cache, MWA transactions, keeper API, reminders
src/features/punch/ui         TIME CLOCK design system: gauge, hazard band, keycap punch key, shift grid
keeper/                       Rust Axum keeper: settlement, faucet, SGT verification, Postgres store
```

## License

MIT. See [LICENSE](LICENSE).
