# Live validation — generation 1

Live runs of the SwapTables board on **Arbitrum Sepolia (421614)** — table 1 on
2026-07-26, tables 3 and 4 on 2026-07-27. Every number below was predicted from the spec
(`SEGMENT_TABLES.md`) *before* reading the chain, then reconciled to the wei. This
is the record of what the mechanic actually does with real money, not what it was
designed to do.

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

## Table 3 — Double-Digit, complementary bets, and a lost reveal

Second full run, 2026-07-27, same generation-1 deployment. This one targeted the
three things table 1 left open, and accidentally exercised a fourth.

- **Seed:** TimbPrize round **56** → **`XFZKFM`**, consumed in `SeedRegistry`.
- **Two wallets, complementary:** wallet 1 bet **Letter** on all six segments at
  25-TIMBS chips; wallet 2 bet **Number** on all six at 10. Both placed a
  Double-Digit bet (25 and 10), so the DD pool was contested for the first time.
- **Result string:** **`O8DFRM`** — five letters, one digit, six distinct
  characters.

### Predicted before arming, matched after

| | Predicted | Actual |
|---|---|---|
| Wallet 1 (`0x4253…9800`) | `234427499999999999995` | `234427499999999999995` |
| Wallet 2 (`0xe863…50dA`) | `46885499999999999999` | `46885499999999999999` |
| Swept to Treasury | `63687000000000000006` | `63687000000000000006` |
| `heldBalance == totalCredited` | `281312999999999999994` | `281312999999999999994` |

Vault held 345 TIMBS (100 seed + 175 + 70). After both withdrawals,
`heldBalance() == totalCredited() == 0`.

### What this run establishes

- **A single winner takes the entire distributable.** Every segment pool paid
  exactly `46885499999999999999`, whichever side won and despite stakes of 25 vs
  10 — with one winner, `totalWeight` equals that winner's own weight, so
  `distributable × amt / totalWeight` collapses and both the stake and the fair
  multiple cancel. Six segments × that figure is the whole credited total.
- **Double-Digit settles, and settles correctly when it loses.** Contested, so it
  drew its ~14.29 seed share; `O8DFRM` has no repeated character, so it paid
  nobody and its full 49.285714285714285714 pot swept. The losing branch is the
  harder one to get right, and it is the one that ran.
- **Complementary Letter/Number gives exactly one winner per segment**, which is
  what makes the per-segment figure constant and the arithmetic checkable.

DD priced against reality: a repeat among six draws from 36 symbols occurs with
probability `1 − (36·35·34·33·32·31)/36⁶ ≈ 35.6%`, so fair odds are ≈1.811:1
against the paid **1.8:1**. The 18000 weight is very close to correct.

---

## Table 4 — the fallback path, and Double-Digit winning

Third run, 2026-07-27, same generation-1 deployment. Purpose-built to exercise
`lockSegmentFallback`, the one settle path that had never executed on chain.

- **Seed:** TimbPrize round **57** → **`6I8RGW`**.
- **Two wallets, complementary**, 5-TIMBS chips throughout: wallet 1 **Letter** on
  all six, wallet 2 **Number** on all six, both with a Double-Digit bet. Vault held
  **170** (100 seed + 2 × 35).
- **Method:** armed at pick time, then *deliberately never revealed*. Waited for the
  64-block reveal window to lapse and settled the whole table with
  `lockSegmentFallback`, which takes no secret.
- **Result string:** **`337LBO`** — three letters, three digits, and a repeated `3`.

### Predicted before arming, matched after

| | Predicted | Actual |
|---|---|---|
| Wallet 1 | `80860499999999999996` | `80860499999999999996` |
| Wallet 2 | `80860499999999999996` | `80860499999999999996` |
| Total credited | `161720999999999999992` | `161720999999999999992` |
| Unowed → Treasury | `8279000000000000008` | `8279000000000000008` |

Per pool: pot `24285714285714285714`, rake keeps `1182714285714285715`,
distributable `23102999999999999999`. DD paid `11551499999999999999` to each wallet,
1 wei of dust left unowed.

### What this run establishes

- **`lockSegmentFallback` settles a table.** Six segments locked with no passphrase,
  no reveal, entropy from the lock-block hash alone. This was the last untested code
  path in the money flow.
- **The 64-block reveal boundary is exact.** Rejected at age 52, accepted at age 68:

  ```
  4:49:01  lock block 11360489, L1 now 11360541  age 52 of 256  → RevealWindowOpen
  4:52:29  lock block 11360489, L1 now 11360557  age 68 of 256  → all six locked
  ```

- **L1 timing confirmed a second time, independently.** 16 blocks between 4:49:01 and
  4:52:29 is **13.0 s/block** — L1 Ethereum, not Arbitrum's 0.25s L2. A separate
  measurement from table 3's, agreeing. Discovery #8 is settled fact, not inference.
- **Double-Digit's *win* branch ran.** Table 3's string had six distinct characters so
  DD lost; here the repeated `3` paid both wallets. Both DD branches are now live-tested.
- **Operator liveness without the secret.** A table whose reveal is lost is recoverable
  by anyone after ~13 minutes, with no operator cooperation — the property that makes
  the commit–reveal scheme safe to run without a trusted settler.

---

# Generation 2

Deployed 2026-07-27. `SegmentBoard 0xAfC3a78a4F906C5CEb806d0d580d9175B2105924`,
`PoolLedger 0x65ABf55FD57a34c527B07Bd6D90d91D2FbDa220f`,
`CommitRevealEntropy 0x3ddD099953409D5104CF5081E18DB88Cc842a2c2`, `SeedRegistry`
reused. Dials compressed 10x for testing: entry 04:00, bets close 05:30, pick
06:00. See `GEN2_DEPLOY.md`.

## Table 1 — `cancelTable`

The under-seated escape hatch, which generation 1 predates and could never run.

- Seed round 58 -> `2X8BMQ`, one wallet seated, entry allowed to close.
- `cancelTable(1)` — permissionless, no arm, nothing settled.

| | |
|---|---|
| Vault before | `100` (the seed) |
| Vault after | `0` |
| Credited | `0` throughout |

Nothing stranded. This is the path that would have rescued the 100 TIMBS an empty
table stranded on generation 1 (discovery #7), and it is now proven on chain.

**Note on where the seed goes.** It is *pulled* from `seedFunder` at `openTable`
but *pushed* to `treasury` on cancel — the transaction shows
`PoolLedger -> TimbTreasury, 100 TIMBS`. Every cancel therefore moves the float
one-way from the ops wallet to the Treasury, and the ops wallet needs refilling.
All protocol money either way, but it is asymmetric and was previously unwritten.

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

### 8. `block.number` on Arbitrum is the **L1** block number — the horizon is ~51 min, not ~65s

`REVEAL_WINDOW` (64) and `BLOCKHASH_HORIZON` (256) were documented as ~16s and
~65s, from Arbitrum's ~0.25s L2 block time. That is wrong. On Arbitrum
`block.number` returns the L1 block number, so both windows count **L1 blocks at
~12s**:

| | blocks | actual |
|---|---|---|
| `REVEAL_WINDOW` — fallback opens | 64 | **~13 minutes** |
| `BLOCKHASH_HORIZON` — table dies | 256 | **~51 minutes** |

Measured, not inferred. Table 3 armed at block `11359219` — an L1 Sepolia
height, while `eth_blockNumber` simultaneously read `291764724` on L2, a gap of
280 million. `lockSegmentFallback` still returned `RevealWindowOpen` **12 minutes**
after arming, putting fewer than 64 blocks in that span (~11–12s each), and the
table then locked successfully **20 minutes** after arming — flatly impossible
under the 65-second reading.

Consequences:
- `rearmTable` is still correct to exist, but it guards a slow leak rather than a
  near-instant trap. An operator who loses a reveal has under an hour to recover.
- Any tooling comparing a stored `lockBlock` against `eth_blockNumber` is
  comparing two different chains' counters and will produce nonsense. The console
  did exactly this and reported a live table as long dead.

### 9. A lost passphrase is a liveness risk, not just a security one

Table 3's six secrets derive from an operator passphrase. A page reload cleared
the input mid-round, and because the table was already armed, the reveal was
temporarily unrecoverable — with `retire()` demanding all six segments and both
lock paths needing the passphrase or the fallback window. The table survived only
because the real horizon is ~51 minutes and the passphrase was recoverable from
scrollback.

The passphrase must therefore be (a) private — deriving it from the seed string
or any other on-chain value hands everyone the outcome in advance, defeating
guard #1 — and (b) durable, because losing it after arming can strand a table.
The console now persists it and offers the fallback path directly.

### 10. `O` and `0` are the same glyph to a reader in a monospace face

`O8DFRM` was read as `08DFRM`. Not cosmetic: Letter and Number are opposite sides
of the same bet, so one misread character moves an entire segment's payout
between wallets. The misread implied 4 letters / 2 digits and a wallet-1 credit of
`187541999999999999996`; the chain paid the 5/1 figure. The credits are what
revealed the character — which is backwards, and the reason the result tiles now
dot the zero, widen the O, and label each tile `LTR` or `NUM`.

### 11. `retire` and `cancelTable` sweep the whole ledger, not one table

Found by reading the `cancelTable` transaction to check where the seed went.
Both close-out paths end the same way:

```solidity
uint256 leftover = ledger.unowed();
if (leftover > 0) ledger.sweep(treasury, leftover);
```

`unowed()` is **global** — `balanceOf(this) - totalCredited` — not per table. Pools
are only credited at lock time, so until a table settles, its seed *and every chip
its players have loaded* are indistinguishable from surplus. Closing out any one
table sweeps all of it.

Proven in `tests/MultiTableSweep.t.sol`: two tables open, table A settles and
retires, and A's retire moves table B's entire 400 TIMBS — 100 seed plus **300 of
player chips** — to Treasury. Table B is then insolvent; its next `lockSegment`
reverts `ExceedsUnowed`. Swept 433.07 = table A's own 33.07 leftover plus all of
table B.

Why three clean runs missed it: we have only ever had one table open at a time.
The escrow-sacred invariant also still holds in its narrow form — `totalCredited`
stays fully backed — so every check we ran passed. What is not protected is escrow
that has not been credited *yet*, which is every live table's stake.

`TABLES_MAX` is 40 and the spec expects 2-4 tables live in parallel, so at any
scale beyond one this is the normal path.

**No funds lost.** Generations 1 and 2 have only ever run a single table.

**Fix (generation 3):** per-table accounting — the board tracks what each table took
in and pays out only that table's remainder, instead of asking the ledger for a
figure that spans every table. Contract change, so it cannot be patched on a live
generation. The test asserts the current wrong behaviour and is named `KNOWNBUG` so
it must be inverted when fixed rather than quietly passing.

---

# Still open

- ~~**Double-Digit is untested on-chain**~~ — settled live on table 3 (contested,
  lost, pot swept). See above.
- ~~**Fallback path untested on-chain**~~ — settled table 4 end to end, six
  segments with no secret. Both the too-early guard and the success branch have
  now run live.
- ~~**`cancelTable` untested on-chain**~~ — ran on generation 2, table 1.
- **`rearmTable` untested on-chain** — and untestable on this
  deployment: the generation-1 board predates both. Needs a generation-2 board.
  `cancelTable` is not hypothetical: an empty table opened on 2026-07-27 stranded
  its 100-TIMBS seed, recoverable only through the ledger owner's
  `ownerWithdraw` (safe there only because nothing was credited).
- **Multi-table and near-capacity behaviour untested** — two tables, two seats each.
  The 12-seat settlement loop has not been exercised at size, and the per-lock gas
  envelope (§12) is still unmeasured on real hardware.
