# Live validation — generation 1

First end-to-end run of the SwapTables board on **Arbitrum Sepolia (421614)**,
2026-07-26. Every number below was read off-chain after the fact and reconciled
against the spec (`SEGMENT_TABLES.md`). This is the record of what the mechanic
actually does with real money, not what it was designed to do.

## Deployment under test

| Contract | Address |
|---|---|
| `SegmentBoard` | `0x25D47477f7bf912791B9a6033d810283f33bF13D` |
| `PoolLedger` | `0xf3686b4E86e2b21FaDF36FE43b87EAF9D35FE409` |
| `SeedRegistry` | `0x2460C8ed63414F36838542982A5Ab263C9Fcb914` |
| `CommitRevealEntropy` | `0x3280249A9935D1858B9c8A1573a1C81a2f4132A5` |

Dials: `entryWindow 2400s / pickDelay 2700s / betsCloseLead 300s` (§10.3's
40 / 45 / 5 minutes). `treasury` = TimbTreasury (sweeps); `seedFunder` = an ops
EOA (seed float).

## Table 1

- **Seed:** TimbPrize round **55** → `0x54514a444950` = **`TQJDIP`**. Consumed in
  `SeedRegistry`, so it can never seed another table in any generation (§10.1).
- **Opened** `1785096376`, **pick** `1785099076`.
- **Two wallets**, each loading six 25-TIMBS chips (150 each). One wallet left a
  single chip unplaced, so **five segment pools were contested and one was solo**.
- Full lifecycle exercised: `openTable → sit → loadTokens → place → armTable →
  lockSegment ×6 → retire → withdraw`.

### Money in / out

| | TIMBS |
|---|---|
| Seed pulled from `seedFunder` | 100 |
| Chips loaded (2 × 150) | 300 |
| **Total in** | **400** |
| Credited to players | 353.774999999999999995 |
| Swept to Treasury | 46.225 |

### Per-pool settlement

| Pool type | n | pot | rake | to winner |
|---|---|---|---|---|
| Contested (×5) | 2 | 64.285714 | **4.87%** | 61.155 |
| Solo (×1) | 1 | 25.000000 | **8.00%** | 23.000 |

Rake follows §8's `FLOOR + (BASE−FLOOR)/n` exactly: 4.87% at two wallets,
the full 8% base for the lone bettor.

### Final credits

| Wallet | Credit | Composition |
|---|---|---|
| `0x4253…9800` | `206464999999999999997` | 3 contested wins + the solo pool |
| `0xe863…50dA` | `147309999999999999998` | 2 contested wins + 25 refunded chip |

Both figures were **predicted to the wei** from the spec before reading the chain.

## Invariants confirmed on real money

- **Escrow is sacred.** After retire, `heldBalance() == totalCredited() ==
  353774999999999999995`, and the two individual credits summed to exactly that.
  Nothing stranded, nothing over-promised.
- **Conservation.** `400 in = 353.775 credited + 46.225 swept`, exact.
- **Graduated rake (§8)** fired per-pool on distinct-wallet count.
- **Seed guard (§9)** held: the solo pool drew **no** seed share (25 → 23), while
  each contested pool drew its ~14.29. The anti-farm rule works on live data —
  crowding is rewarded, lone farming is not.
- **Unplayed chips refunded** at retire, exactly 25.
- **Full drain.** After both withdrawals, `heldBalance() == totalCredited() == 0`.
  Every token entered, moved, and left as designed.

The 46.225 sweep = ~15.65 rake from contested pools + 2 from the solo pool +
28.57 of undrawn seed (the solo and Double-Digit pools never claimed their
shares).

---

# Discoveries

Things deployment taught that the spec and the test suite did not.

### 1. A treasury *contract* cannot fund a pull-based seed
`treasury` was used for two jobs with opposite requirements: sweeps are **pushed**
(any address works), but the seed was **pulled** via `transferFrom` (needs the
holder to `approve`). TimbTreasury has no generic approve and no arbitrary
execute — only internal router approvals — so it can never grant an allowance.
Because `treasury` was immutable, generation 0 could never fund a table and was
retired unused.

**Fixed:** `seedFunder` split from `treasury`. Sweeps still go to the real
treasury; an ops wallet supplies the float. `seedFunder` is owner-settable (it can
only ever be a source of funds it approved itself, so it cannot reach escrow).

### 2. Commitments bind to a table id, and getting it wrong is silent
`salt = keccak256(tableId, segment)`. A commitment computed against the wrong id
opens fine and takes bets — then **every** `lockSegment` reverts `BadReveal`, after
money is committed, leaving only the fallback path.

**Fixed:** `nextTableId()`, `saltFor()`, `commitmentFor()`, `commitmentsFor()`
added so commitments are derived on-chain against the id that will actually be
assigned. A test demonstrates the wrong-id failure explicitly.

### 3. `RED_MASK` width is load-bearing
A well-meaning edit narrowed `0x555555555` to `0x55555555` — 32 bits instead of
36 — silently colouring symbols `6789` black and turning the even-money Red/Black
bet into a **16/20 split**. It compiles, looks like a typo fix, and would have
quietly underpaid Red bettors forever.

**Fixed:** restored to 36 bits, with a regression test asserting exactly 18 red
pockets across all 36 symbols.

### 4. `PoolLedger.setBoard` is one-time — and that bites
Retiring a board means retiring its ledger too. Generation 0 burned a perfectly
good ledger this way.

**Practice:** never point a ledger at a throwaway/test board; verify `board()`
reads zero before claiming one.

### 5. Entry and bets close at the same instant
`entryWindow (2400) == pickDelay (2700) − betsCloseLead (300)`, so sit, load and
place all share **one 40-minute window**. That matches §10.3, but it is tight for
manual multi-wallet operation — a second wallet that needs funding and an approval
mid-window will miss it. (It did, on the first attempt.)

**Practice:** fund and approve every wallet **before** calling `openTable`. The
clock only starts at open.

### 6. Remix compiles without via-IR — so the contract must too
Foundry's config uses `via_ir`, which hides stack-depth problems that Remix (an
optimizer-only build) surfaces immediately. Deep nested access in the settlement
loop blew the 16-slot limit there.

**Fixed:** stack pressure reduced so the contract builds under both.

### 7. A table that never fills would strand its chips
The run made the failure mode concrete: a table below `SEATS_MIN` can never be
armed, so it never locks, never retires, and any chips already loaded are stuck.
Only the seed was recoverable (`ownerWithdraw`). This was the single known way
player funds could stick.

**Fixed:** `cancelTable()` — permissionless once a table is past its entry cutoff
with too few seats. Refunds **every** chip, placed or not (no char was ever locked,
so nothing can have won or lost), then returns the seed to the treasury. The
deployed generation-1 board predates this and does not have it.

---

# Still open

- **Double-Digit is untested on-chain** — no DD bets were placed in this run.
- **Fallback path untested on-chain** — every segment settled via the happy
  reveal path. `lockSegmentFallback` is covered by tests but has not run live.
- **Multi-table and near-capacity behaviour untested** — one table, two seats.
  The 12-seat settlement loop has not been exercised at size, and the per-lock gas
  envelope (§12) is still unmeasured on real hardware.
