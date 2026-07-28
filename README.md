# SwapTables

**Pre-round segment-betting tables for [TimbSwap](https://github.com/0xTimberZx/TimbSwap).**

A live, on-chain-settled game: players bet on the six characters of a round's
winning string as they lock, one at a time, in real time. Pools are
self-funding and **pari-mutuel** — no house promise beyond a bounded per-table
seed, and no insurance fund.

- **Network:** Arbitrum Sepolia · **Status:** live (generation 1 validated end-to-end)
- **Repo scope:** app layer — frontend, real-time backend, spec, and diagnostics
- **License:** BUSL-1.1 (→ MIT on 2029-07-25)

> **Where the contract lives.** The on-chain `SegmentBoard` is **not** in this
> repo — it's built, tested, and deployed from the
> [TimbSwap](https://github.com/0xTimberZx/TimbSwap) Foundry project so the whole
> protocol keeps one audit surface. This repo only *consumes* its address + ABI
> (see [On-chain coupling](#on-chain-coupling)).

---

## Two invariants (read first)

Everything else in the game is a tunable dial. These two are not:

1. **Seed, not answer.** A table is *seeded* from a previously recorded winning
   string, but the actual locked characters stay **uncomputable from public data
   until each segment locks**. A recorded string can never *be* the answer.
2. **Velocity-only nudge.** Swaps nudge a meter's **speed/entropy, never its
   direction**. No sequence of swaps can bias a segment toward a chosen
   character — directional nudging would let a whale steer a segment onto its own
   bet, and that's game over.

Full rationale and the invariant checklist:
[`docs/SEGMENT_TABLES.md`](docs/SEGMENT_TABLES.md).

---

## How a table works

A 60-second tour of one round:

1. **Sit down.** Hold an active Compete ticket, take a seat, and receive **six
   segment tokens** — one per segment, unique and untradeable, reissued every
   round.
2. **Load & place.** Fund all six with TIMBS chips (5 / 10 / 25 / 50 / 100 / 500
   / 1000; min 5), then place and approve each on the board. Placement is final —
   no undo.
3. **Watch it lock.** The six meters jitter and **lock one segment at a time**.
   Each lock **settles that segment's pool pari-mutuel and push-pays winners
   immediately** — no waiting for the full round.
4. **Retire at six.** Unplayed chips return to their owners, leftovers sweep to
   Treasury, and a fresh table opens on a different seed string.

**Seven pools per table:** six segment pools plus one round-wide **Double-Digit**
pool (settles on the sixth lock). About 40 tables can run in parallel; the UI
surfaces two.

### Current dials

| Dial | Value | Notes |
|---|---|---|
| `TABLE_SEED` | 100 TIMBS | seven-way split; the only house money at risk; boot condition |
| `RAKE_BASE` | 8% | rake for a solo pool |
| `RAKE_FLOOR` | 1.75% | `rake(n) = FLOOR + (BASE − FLOOR)/n`, n = distinct wallets (2 wallets → 4.88%) |
| `TABLES_MAX` | 40 | expect 2–4 live |
| `SEATS` | 2 min · 4 target · 8 soft · 12 hard | no solo tables; hard cap is gas-bound |
| `SEED_MIN_WALLETS` | 2 | a pool draws its seed share only with ≥2 distinct wallets (anti-farm) |
| tables / wallet | uncapped | gated only by an active ticket |
| tokens | per-table | six issued each time you sit down |
| payouts | push | auto-credited on each lock (nothing left to claim at retire) |

---

## Repository layout

```
SwapTables/
├── app/
│   ├── index.html          table console
│   └── play.html           the segment board ("the felt") — the page players use
├── docs/
│   ├── SEGMENT_TABLES.md   spec of record (pool math, guards, invariants)
│   ├── VALIDATION.md       end-to-end testnet validation record
│   ├── PLAY_STYLE.md       spin-curve / feel notes
│   ├── GEN{2,3,4}_DEPLOY.md generation deploy logs
│   └── tools/spin-tuner.html  interactive spin-curve tuner (open in a browser)
├── onchain/
│   ├── addresses.js        deployed addresses (mirrors TimbSwap/config.js)
│   └── abi/                ABIs consumed from the TimbSwap build (TimbPrize, TIMBSToken)
├── debughub/
│   ├── index.html          same-origin local diagnostics dashboard
│   └── sdk/debugger.js      DebugHub SDK (v1.3.1)
├── server/                 real-time backend — meters, lifecycle, settlement [not started]
└── style.css               shared ecosystem stylesheet
```

---

## On-chain coupling

The `SegmentBoard` contract is built, tested, and deployed from the TimbSwap
Foundry project, where it reads settled segments from `TimbPrize`. This repo
consumes only two things — no contract source:

- **`onchain/addresses.js`** — network → `{ SegmentBoard, TimbPrize, TIMBSToken, … }`.
  Keep in sync with `TimbSwap/config.js`, the single source of truth for deploys.
- **`onchain/abi/*.json`** — copied from the TimbSwap build artifacts on each
  contract change. Do not hand-edit.

If `SegmentBoard` ever diverges hard from the rest of the protocol, revisit
whether it should move here — until then, one Foundry project keeps the audit
surface single.

---

## Telemetry (DebugHub)

SwapTables uses the ecosystem's **DebugHub** SDK for diagnostics. The playable
board is deliberately wired **local-only**:

- **The felt (`app/play.html`) self-hosts the SDK** from
  [`debughub/sdk/debugger.js`](debughub/sdk/debugger.js) and sets only
  `window.DEBUGHUB_CONFIG = { appName: "SwapTables" }` — **no Supabase keys**.
  With no sink configured, telemetry never leaves the device.
- **`#debug` snapshot.** Append `#debug` to the URL to arm a floating snapshot
  button. It reads *this device's* local telemetry, renders it to a shareable
  image, and hands it to the OS share sheet — **nothing is uploaded or
  downloaded**. This is the private path for a friend to send you what they saw.
- **Local dashboard.** [`debughub/`](debughub/index.html) is a same-origin
  viewer over `localStorage`, needing no backend.

Wiring notes and the shared-table schema live in
[`dev-docs/debughub-network/`](dev-docs/debughub-network/README.md). A page that
*wants* to report to the shared cross-origin hub can opt in by adding
`supabaseUrl` / `supabaseKey` to its config — the felt intentionally does not.

---

## Status

**Live on Arbitrum Sepolia.** The mechanic is specced
([`docs/SEGMENT_TABLES.md`](docs/SEGMENT_TABLES.md)), the contracts are built and
tested in the TimbSwap Foundry repo, and **generation 1 has run a complete round
end-to-end on testnet** — open → seat → load → place → arm → six locks → retire →
withdraw, with the vault draining to exactly zero. The full record, per-pool
numbers, and deployment lessons are in [`docs/VALIDATION.md`](docs/VALIDATION.md).

**The segment lock is a roulette-style spin:** a player-count-driven velocity
envelope (spin-up → run → settle) with a Model A + pocket-rattle curve and a
concave player-influence map. Six segments spin overlapping and synced.
Randomness is commit–reveal + future-block entropy today, with VRF planned and
the pre-VRF path kept as a covert fallback (§10). Tune the curve at
[`docs/tools/spin-tuner.html`](docs/tools/spin-tuner.html).

**On-chain (in [`0xTimberZx/TimbSwap`](https://github.com/0xTimberZx/TimbSwap), per §13):**
`SegmentBoard` (state machine + pari-mutuel settlement), `PoolLedger` (custody +
credit ledger, escrow-sacred), `CommitRevealEntropy` (swappable for VRF), and the
long-lived `SeedRegistry` (cross-generation seed never-reuse) — standalone,
immutable, migrate-by-generation, with a halt-only guardian and renounceable
owner. Addresses in [`onchain/addresses.js`](onchain/addresses.js).

**Live-validated on real money:** escrow conservation
(`heldBalance == totalCredited`), the graduated rake (4.87% at two wallets vs 8%
solo), and the §9 seed guard (a solo pool draws no seed share).

**Next:** the frontend against the live board, plus the open items in
`docs/VALIDATION.md` — an abandon path for under-seated tables, Double-Digit, and
near-capacity gas.

---

## License

BUSL-1.1 (matching TimbSwap). Change Date 2029-07-25 → MIT. Trademark reserved.
