# SwapTables

Pre-round **segment-betting tables** for [TimbSwap](https://github.com/0xTimberZx/TimbSwap) — a
live, on-chain-settled game where players bet on the six characters of a round's winning string
as they lock, one at a time, in real time. Self-funding **pari-mutuel** pools; no house promise
beyond a bounded per-table seed; no insurance fund.

Repo: `https://github.com/0xTimberZx/SwapTables`

> This repo is the **app layer** (frontend + real-time backend + spec + prototype).
> The on-chain `SegmentBoard` contract lives in the **[TimbSwap](https://github.com/0xTimberZx/TimbSwap)**
> repo alongside the rest of the protocol (one Foundry project, one audit surface). This repo
> only *consumes* its deployed address + ABI — see [`onchain/`](#onchain).

---

## Two rules that must never break (read first)

1. **Seed, not answer.** A table is *seeded* from a previously recorded winning string, but the
   actual locked characters stay **uncomputable from public data until each segment locks**.
   A recorded string can never *be* the answer.
2. **Velocity-only nudge.** Swaps nudge a meter's **speed/entropy, never its direction**. No
   sequence of swaps can bias a segment toward a chosen character. Directional nudging = a
   whale steers a segment onto its own bet = game over.

Everything else is a dial. These two are invariants. Full rationale + the invariant checklist
live in [`docs/SEGMENT_TABLES.md`](docs/SEGMENT_TABLES.md).

---

## How a table works (60-second version)

- Hold an active Compete ticket → sit at a table → receive **six segment tokens** (one per
  segment, unique, untradeable, redeemed every round), **issued per table**.
- **Load all six** with TIMBS chips (5 / 10 / 25 / 50 / 100 / 500 / 1000; min 5), then
  **place + approve** each on the board (final, no undo).
- The table's six meters jitter and **lock one segment at a time**. Each lock **settles that
  segment's pool pari-mutuel and push-pays winners in real time** — no waiting for the whole
  round.
- **Seven pools per table:** six segment pools + one round-wide **Double-Digit** pool (settles
  on the sixth lock).
- **Retire at six:** unplayed chips dislodge back to owners, leftovers sweep to Treasury, a new
  table opens on a different seed string. ~40 tables can run in parallel; the UI shows 2.

### Dials (current)

| Dial | Value | Notes |
|---|---|---|
| `TABLE_SEED` | 100 TIMBS | seven-way split; the only house money at risk; boot condition |
| `RAKE_BASE` | 8% | rake for a solo pool |
| `RAKE_FLOOR` | 1.75% | `rake(n) = FLOOR + (BASE − FLOOR)/n`, n = distinct wallets in pool (2 wallets → 4.88%) |
| `TABLES_MAX` | 40 | expect 2–4 live |
| `SEATS` | min 2 · target 4 · soft 8 · hard 12 | no solo tables; hard cap is gas-bound, not chain-bound |
| `SEED_MIN_WALLETS` | 2 | a pool draws its seed share only with ≥2 distinct wallets (anti-farm) |
| tables / wallet | uncapped | gated only by an active ticket |
| tokens | per-table | six issued each time you sit down |
| payouts | push | auto-credit on each segment lock (retire-at-six leaves nothing to claim) |

---

## Repo structure

```
SwapTables/
├── README.md              ← you are here
├── docs/
│   └── SEGMENT_TABLES.md  ← spec of record (pool math, guards, invariants)
├── prototype/
│   └── board.html         ← interactive board demo (static, no backend; reports to DebugHub)
├── app/                   ← game frontend (table views, board, live feed)          [empty]
├── server/                ← real-time backend (meters, table lifecycle, settlement) [empty]
├── debughub/
│   └── index.html         ← same-origin local diagnostics dashboard (SwapTables)
├── dev-docs/
│   └── debughub-network/  ← DebugHub wiring notes + shared-table schema
├── onchain/
│   ├── addresses.js       ← deployed contract addresses (from TimbSwap/config.js)
│   └── abi/               ← ABIs consumed from the TimbSwap Foundry build (TimbPrize, TIMBSToken)
└── style.css              ← shared ecosystem stylesheet (used by the DebugHub dashboard)
```

- **`docs/SEGMENT_TABLES.md`** — the spec of record (mirrors `TimbSwap/dev-docs/`).
- **`prototype/board.html`** — the interactive board demo; open it in a browser to play a round.
- **`app/` + `server/`** — the two build surfaces this repo exists for (not started).
- **`onchain/`** — the *only* coupling to TimbSwap: addresses + ABIs, no contract source.

<a name="onchain"></a>
## On-chain coupling

The `SegmentBoard` contract is **not** in this repo. It is built, tested, and deployed from the
TimbSwap Foundry project, and it reads settled segments from `TimbPrize`. This repo consumes:

- **`onchain/addresses.js`** — network → `{ SegmentBoard, TimbPrize, TIMBSToken, ... }`.
  Keep in sync with `TimbSwap/config.js` (single source of truth for deploys).
- **`onchain/abi/*.json`** — copy the relevant ABIs out of the TimbSwap build artifacts on each
  contract change. Do not hand-edit.

If `SegmentBoard` ever diverges hard from the rest of the protocol, revisit whether the contract
should move here too — until then, one Foundry project keeps the audit surface single.

---

## Telemetry (DebugHub)

SwapTables reports to the shared **DebugHub** telemetry hub, same as the rest of
the ecosystem. Pages set `window.DEBUGHUB_CONFIG` (`appName: "SwapTables"`) and
load the SDK cross-origin from the MyDapp hub host; events go to a Supabase sink
with a localStorage fallback. A same-origin local dashboard lives at
[`debughub/`](debughub/index.html). Wiring + the shared-table schema are in
[`dev-docs/debughub-network/`](dev-docs/debughub-network/README.md).

> **One-time backend step:** `SwapTables` must be added to the DebugHub app
> whitelist (RLS) before remote telemetry lands — see the schema note. Until then
> the SDK falls back to localStorage and the local dashboard still works.

## Status

**Live on Arbitrum Sepolia.** The mechanic is specced (`docs/SEGMENT_TABLES.md`), the
contracts are built and tested in the TimbSwap Foundry repo, and **generation 1 has run a
complete round end-to-end on testnet** — open → seat → load → place → arm → six locks →
retire → withdraw, with the vault draining to exactly zero. Full record, including the
per-pool numbers and what deployment taught us, in [`docs/VALIDATION.md`](docs/VALIDATION.md).

The segment lock is a **roulette-style spin**: a player-count-driven velocity envelope
(spin-up → run → settle) with a **Model A + pocket-rattle** curve and a concave
player-influence map, six segments spinning **overlapping & synced**, commit–reveal +
future-block entropy now, VRF later with the pre-VRF path kept as a covert fallback (§10).
An interactive tuner for the spin curve lives at
[`docs/tools/spin-tuner.html`](docs/tools/spin-tuner.html) (open in a browser).

**On-chain (in `0xTimberZx/TimbSwap`, per §13):** `SegmentBoard` (state machine +
pari-mutuel settlement), `PoolLedger` (custody + credit ledger, escrow-sacred),
`CommitRevealEntropy` (swappable for VRF), and the long-lived `SeedRegistry`
(cross-generation seed never-reuse) — standalone, **immutable**, migrate-by-generation,
with a halt-only guardian and renounceable owner. Addresses in
[`onchain/addresses.js`](onchain/addresses.js).

Live-validated on real money: escrow conservation (`heldBalance == totalCredited`), the
graduated rake (4.87% at two wallets vs 8% solo), and the §9 seed guard (a solo pool draws
no seed share). Next: the frontend against the live board, plus the open items in
`docs/VALIDATION.md` — an abandon path for under-seated tables, Double-Digit, and
near-capacity gas.

## License

BUSL-1.1 (matches TimbSwap). Change Date 2029-07-25 → MIT. Trademark reserved.
