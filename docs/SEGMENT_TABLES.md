# Segment Tables — pre-round segment betting on recorded winning strings

Status: **DESIGN (pre-implementation)**. Prototype: the interactive board artifact
(load six tokens → approve placements → live table → pari-mutuel settlement). No contract
written yet; this doc is the spec of record for `SegmentBoard` (working name).

Locked dials: `TABLE_SEED = 100 TIMBS`, `RAKE_BASE = 5%`, `RAKE_FLOOR = 1.5%`,
`TABLES_MAX = 40` (expect 2–4 live), tokens **per-table**, retire **at six locks**,
payouts **push (auto-credit)**, swap nudge **velocity/entropy only**.

---

## 1. One-paragraph summary

A **table** is a live game bound to one six-character **winning string**. Players hold an
active Compete ticket, sit at a table, and receive **six segment tokens** (one per segment,
unique, untradeable, redeemed every round). They **load** each token with a TIMBS chip
(min 5), then **place** it on the board — token = the segment it bets, board spot = what it
calls for — and **approve** each placement (final, no undo). The table's six segments lock
one at a time as its meters run; the moment a segment locks, that segment's pool settles
**pari-mutuel** and pays winners in real time. When the sixth segment locks the table
**retires**: unplayed chips are dislodged back to owners, leftovers sweep to Treasury, and a
new table opens on a different string. ~40 tables can run in parallel; the UI shows 2.

---

## 2. Winning string: seed, not answer  ⚠️ exploit guard #1

Tables are **tied to previously recorded winning strings**, but a recorded string is public,
so it can never *be* the answer — that would let anyone bet a known outcome risk-free.

- A prior round's string is a **seed** only. The table's six meters start from it and
  **re-jitter live**; the actual locked characters are **unknown until each segment locks**.
- The seed derivation must be non-invertible w.r.t. the final characters (seed feeds the
  initial meter state + entropy schedule, not the lock values).

**Invariant:** at no point before a segment locks can any party compute that segment's
locked character from public data.

---

## 3. Meters, jitter, and swap nudges  ⚠️ exploit guard #2

Each table runs **six parallel segment meters** (all tables' meters run in parallel too).
A meter jitters through the 36-symbol alphabet (`A–Z0–9`) until its segment's lock time.

- **Swaps nudge velocity/entropy, never direction.** A swap adds unpredictability/speed to
  the meter; it **cannot steer** which character a segment lands on. A swapper must not be
  able to predict or choose the resulting symbol.
- This inherits the class-preserving jitter approach already used in TimbPrize (§13.2:
  `mix % 26` letter class, per-round counter carry-over) — reused so nudges add entropy
  without becoming a directional lever.

**Invariant:** no sequence of swaps increases the probability that a chosen segment locks on
a chosen character beyond the uniform baseline.

Rationale: directional nudging = a whale steers a segment onto their own bet before lock =
game over. Velocity-only keeps swaps meaningful to the *feel* and to fee/burn flow (the meter
race routes through the AMM, per PRIZE_GAME_BALANCE_SPEC #2) without being exploitable.

---

## 4. Tokens (per-table)

Six segment tokens are issued **per table** a player sits at (not a global set spread across
tables). Each token:

- is **non-fungible, untradeable, unique to the holder**, and **redeemed every round**;
- represents exactly **one segment** (SEG 1–6) — a token placed on a board spot bets that
  spot *for its segment*;
- must be **loaded** with a TIMBS chip (5 / 10 / 25 / 50 / 100 / 500 / 1000) to go on the
  board. **Load-all-six-first:** all six carry a stake before the board opens for placement.

A chip has exactly two fates, so nothing evaporates:
1. **Rode a bet** → sits in its segment pool → win / lose / rake at settlement.
2. **Never played** (loaded but not placed by lock, or dislodged at retire) → **returned to
   the authorized owner's wallet**.

---

## 5. The board (bets and how they read against a segment's locked char)

Alphabet is 36 symbols `A–Z0–9`. A single-pocket bet backs one symbol; group bets back a set.
"Fair multiple" = `36 / (winning symbols) − 1` — used as a **relative weight**, not a fixed
payout (see §6).

| Bet | Wins when segment n's locked char … | Symbols | Fair multiple |
|---|---|---|---|
| Exactly-X (pocket) | == X | 1 | 35 : 1 |
| Column (2-to-1) | ∈ that column's 12 | 12 | 2 : 1 |
| Dozen (1st/2nd/3rd 12) | ∈ that block of 12 | 12 | 2 : 1 |
| Vowels | ∈ {A E I O U Y} | 6 | 5 : 1 |
| Red / Black | is a red / black pocket char | 18 | 1 : 1 |
| Letter | ∈ A–Z | 26 | 0.4 : 1 |
| Number | ∈ 0–9 | 10 | 2.6 : 1 |
| Low / High | ∈ first-18 (A–R) / last-18 (S–9) | 18 | 1 : 1 |
| Your Ticket | == the bettor's own ticket char for segment n | 1 | 35 : 1 |
| **Double-Digit** (round-wide) | the full six-char string has **any repeat** | — | 1.8 : 1 |

- A token *is* its segment: SEG 3 on "Exactly-C" checks segment 3's locked char.
- **Even / Odd are intentionally absent** — a letter-and-number alphabet has no parity.
  Red / Black are kept because the pocket colours give a well-defined 18/18 split.
- **Letter / Number is the parity stand-in** — the natural binary of an alphanumeric
  alphabet (A–Z vs 0–9). Unlike Red/Black it is **asymmetric** (26 vs 10), so the two sides
  carry very different weights (≈0.4:1 vs 2.6:1); "Number" slots between the 2:1 dozens/columns
  and the 5:1 Vowels. Like every complementary outside pair it is **farm-safe only because of
  one token per segment** (§4, §6.1): a player cannot back both Letter *and* Number on the same
  segment to capture that pool's seed risk-free. Note the high-coverage **Letter** side (~72%)
  raises a *solo* bettor's seed-capture rate versus Red/Black's 50% — still bounded by the
  per-table seed cap and the rake dial (§9); turn the rake up if it is ever abused.
- **Low / High is the symmetric even-money split** — first-18 (A–R) vs last-18 (S–9) over the
  ordered `A–Z0–9`, the analogue of roulette's 1–18 / 19–36. It restores a *third* even-money
  outside bet (alongside Red/Black and the asymmetric Letter/Number) without changing the seed
  math, since each side is exactly 18/36. Same one-token-per-segment guard applies: a player
  can't back both Low and High on one segment.
- **Double-Digit is the only round-wide bet** — it needs all six characters, so it settles
  **last** (see §7), when the sixth segment locks.

---

## 6. Payout: pari-mutuel, per-segment pools

Self-funding, no insurance fund, no house promise beyond the seed. **The pool is the
counterparty.**

**Seven pools per table:** six segment pools (SEG 1–6) + one round-wide **Double-Digit**
pool. A bet lands in the pool of the segment its token bets; Double-Digit bets land in the
DD pool.

At a pool's settlement:

```
pot          = seed_share + Σ(all chips in the pool)
n            = distinct wallets in the pool
rake         = RAKE_FLOOR + (RAKE_BASE − RAKE_FLOOR) / n      // §8
distributable = pot × (1 − rake)                              // rounded down
weightᵢ      = stakeᵢ × fair_multipleᵢ    (winners only)
payoutᵢ      = distributable × weightᵢ / Σ winner weights     // 0 if you lost
```

- The whole pot (seed included) is distributed; **pot conserves** (Σ payouts + rake = pot).
- Losing chips fund the winners. A **no-winner pool** pays nobody → entire pot (seed + all
  stakes, minus nothing, since nothing is paid) sweeps to Treasury at retire.
- **Solo pools flatten odds:** with one wallet in a pool, that wallet takes the whole
  `distributable` regardless of the bet's fair multiple (there is no one to source 35× from
  but the fixed seed). Honest pari-mutuel; the posted multiples only "bite" once a pool has
  ≥ 2 wallets. **UI must show odds as indicative weights, never a guaranteed multiple.**

### 6.1 No house edge — and the structural edge that replaces it

There is **no house edge in the roulette sense**, and there can't be one. Roulette's edge is a
*fixed-odds* edge: 38 pockets, but a straight-up win pays 35:1 as if there were 36 — the house
is the counterparty and structurally underpays true odds (that is what 0 / 00 buy). This board
has neither those pockets nor that mechanism.

Because payout is **pari-mutuel, the house is not the counterparty — the pool is.** Every pot
(stakes + seed share) is redistributed to that pool's winners, so the house's *entire* take is a
closed list: the **rake** (§8), **no-winner pools** sweeping to Treasury (§7), and the tiny
**seed-rake recapture** (§8). Nothing about how a player *places* tokens can add to that list —
the rake is a percent of the pot no matter how the chips are arranged. A placement rule can only
redistribute value **among players**; it cannot manufacture house margin.

What the one-token-per-segment model (§4) creates instead is a **player-vs-player structural
edge** — a forced-diversification / anti-concentration property:

- **No concentration.** You hold exactly one token per segment, so single-pocket stacking
  *within* a segment is structurally impossible. No whale can pile several chips onto one
  high-probability pocket to swamp a pool and skim it. (Two tokens on the same *letter* across
  different segments — SEG 1 on "C", SEG 2 on "C" — are distinct bets in distinct pools, and
  are fine.)
- **It guards the seed — and it is what makes complementary outside bets safe.** Outside pairs
  are near-complementary (Red + Black, and any pair added later, cover ~all 36 symbols). If a
  player could place two tokens in one segment, they could bet *both sides* and win that pool's
  seed share risk-free. One-token-per-segment is precisely the guard against that hedge; the
  seed (§9) stays farmable only within its bounded per-table cap.

Counter-intuitively, the diversification this forces tends to **lower** the house's realised
take, not raise it: because every seated player loads and places a token in **every** segment,
the six segment pools run **crowded** (high distinct-wallet `n`), which drives graduated rake
toward its **1.5% floor** (§8) and — via broad coverage — makes no-winner sweeps rarer. Cheap
for honest crowds, hostile to concentration and seed-farming: a good combination, but not a
house edge.

---

## 7. Real-time settlement, retire-at-six

- Segments stay **open to new bets** until shortly before each one locks (a per-segment
  "bets closed" cutoff). Early segments can be resolving while later segments still take
  action — the table stays live the whole way down.
- When a segment locks, **its pool settles immediately** and **push-pays** winners
  (auto-credit to an in-contract balance). No claim step — because the table retires the
  instant the sixth segment locks, anything "claimable later" would be stranded.
- **Double-Digit settles on the sixth lock** (it needs the complete string), then the table
  **retires**:
  - dislodge unplayed chips → owners' wallets;
  - sweep leftovers (no-winner pools, rake, any dust) → Treasury;
  - open a new table on a different seed string **simultaneously**.

---

## 8. Rake — a dial that scales down with participation

```
rake(n) = RAKE_FLOOR + (RAKE_BASE − RAKE_FLOOR) / n      // n = distinct wallets in pool
RAKE_BASE = 5%   RAKE_FLOOR = 1.5%
```

| Wallets | Rake |
|---|---|
| 1 (solo) | 5.00% |
| 2 | 3.25% |
| 3 | 2.67% |
| 4 | 2.38% |
| 8 | 1.94% |
| → ∞ | 1.50% (floor) |

- **Solo pays the top rate**, so a lone farmer's edge off the seed is taxed hardest — mild
  friction on solo without forbidding it.
- **Busy pools are cheaper** → the incentive is always "find the crowded table," which is
  what makes the live tables feel alive.
- Never exceeds `RAKE_BASE` (matches "start at 5%, scale down for more players").
- **Count distinct wallets, not bets** — otherwise one wallet splits into six bets to fake a
  crowd and buy itself a discount. The active-ticket gate puts a real cost behind each extra
  wallet, so this holds.
- Rake applies to the **whole pool, seed included** → the house quietly recoups 1.5–5% of its
  own seed on every settled pool; a no-winner pool returns 100% to Treasury regardless.

---

## 9. Table seed & money flow

- **`TABLE_SEED = 100 TIMBS`**, split ~evenly across the seven pools (≈14 each) so every
  real-time per-segment payout has house-side liquidity and **solo play is winnable** (a lone
  25-chip winner takes ≈ `seed_share + 25`).
- **Seeding *is* the boot condition:** no table starts until it is seeded.
- **Funded from the closing table's swept leftovers first, Treasury tops up the rest** — the
  "close one, open one" loop is partly self-perpetuating instead of a fresh Treasury draw
  every time.
- **No insurance fund.** The seed is the *only* house money at risk, and it is bounded and
  per-table. Worst case (all 40 seeded at once) = 4,000 TIMBS committed; typical 2–4 tables =
  200–400 TIMBS. Cross-subsidy happens **at the Treasury level** (swap fees + token activity
  carry a quiet game week), never inside a pool — so the game can never insolvency-spiral or
  over-promise: it only ever pays out what is in the pool.
- **Farming ceiling:** with graduated rake, the most a solo actor can bleed from a table ≈ one
  seed, taxed at 5%, and only on a win. Turning the rake dial up further neutralizes it.

*Open sizing note:* 100 TIMBS is a chip-economics default. To size as a % of runway instead,
we need the Treasury balance + TIMBS pool price (target ≈ 40×seed ≤ a few % of Treasury).

---

## 10. Invariants / test checklist (for when this is built)

- [ ] No party can derive a segment's locked char before it locks (guard #1).
- [ ] No swap sequence biases a segment toward a chosen char beyond uniform (guard #2).
- [ ] Every chip ends as exactly one of: paid into a pool outcome, or returned to owner.
      Σ(pool pots) + Σ(returned) == Σ(loaded chips) + Σ(seeds).
- [ ] Per pool: Σ(payouts) + rake == pot (conservation, rounding to Treasury).
- [ ] Distinct-wallet rake: one wallet with k bets in a pool counts as n=1 for rake.
- [ ] Push-pay on each segment lock; nothing claimable remains at retire.
- [ ] Retire at sixth lock: unplayed dislodged, leftovers → Treasury, new table opened.
- [ ] 40 parallel tables × 7 pools settle via lazy/permissionless calls (no unbounded
      push-to-all-winners loop that can run out of gas).

---

## 11. Open items (not yet decided)

- Exact **seed sizing** vs. Treasury runway (needs Treasury balance + TIMBS price).
- **Per-segment "bets closed" cutoff** — how many seconds/segments-ahead before a lock.
- **Contract shape** — extend TimbPrize/GameRegistry vs. a standalone `SegmentBoard` that
  reads settled segments from TimbPrize and owns chip escrow + pools. (Leaning standalone:
  40×7 pools is a lot of state to bolt onto TimbPrize.)
- Whether Double-Digit's seed share rolls into segment pools if no DD bets exist.
