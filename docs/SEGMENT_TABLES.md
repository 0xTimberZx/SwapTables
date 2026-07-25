# Segment Tables — pre-round segment betting on recorded winning strings

Status: **DESIGN (pre-implementation)**. Prototype: the interactive board artifact
(load six tokens → approve placements → live table → pari-mutuel settlement). No contract
written yet; this doc is the spec of record for `SegmentBoard` (working name).

Locked dials: `TABLE_SEED = 100 TIMBS`, `RAKE_BASE = 8%`, `RAKE_FLOOR = 1.75%`,
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
toward its **1.75% floor** (§8) and — via broad coverage — makes no-winner sweeps rarer. Cheap
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
RAKE_BASE = 8%   RAKE_FLOOR = 1.75%
```

| Wallets | Rake |
|---|---|
| 1 (solo) | 8.00% |
| 2 | 4.88% |
| 3 | 3.83% |
| 4 | 3.31% |
| 8 | 2.53% |
| → ∞ | 1.75% (floor) |

> **Why the curve moved up (from 5% / 1.5%).** Once the seed is *held until enough distinct
> wallets are seated* (§9.1, §9), the house is carrying more coordination cost and the thin-pool
> subsidy is more valuable, so the whole curve is bumped: solo now pays **8%** and the floor is
> **1.75%**. Note the graduated formula still applies — **two wallets pay 4.88%**, not 8% (only a
> solo pool pays the full base). If the intent is for small pools to bite harder still (e.g. ~8%
> at two wallets), that needs a steeper curve than `FLOOR + (BASE−FLOOR)/n` — flag it and we'll
> reshape the function.

- **Solo pays the top rate** (8%), so a lone farmer's edge off the seed is taxed hardest — real
  friction on solo without forbidding it.
- **Busy pools are cheaper** → the incentive is always "find the crowded table," which is
  what makes the live tables feel alive.
- Never exceeds `RAKE_BASE` (matches "start high, scale down for more players").
- **Count distinct wallets, not bets** — otherwise one wallet splits into six bets to fake a
  crowd and buy itself a discount. The active-ticket gate puts a real cost behind each extra
  wallet, so this holds.
- Rake applies to the **whole pool, seed included** → the house quietly recoups 1.75–8% of its
  own seed on every settled pool; a no-winner pool returns 100% to Treasury regardless.

---

## 9. Table seed & money flow

- **`TABLE_SEED = 100 TIMBS`**, split ~evenly across the seven pools (≈14 each) so every
  real-time per-segment payout has house-side liquidity.
- **Seed is held per pool (`SEED_MIN_WALLETS = 2`).** A pool draws its ≈14 share only once it has
  **≥ 2 distinct wallets**; a solo pool forfeits its share to Treasury. This is the anti-farm guard
  from §9.1 resolved: the seed sweetens *contested* pools only, and a lone actor can no longer skim
  it. This deliberately supersedes the earlier "solo play is winnable off the seed" goal — a
  chosen trade for farm-resistance, paired with the raised solo rake (§8).
- **Seeding *is* the boot condition:** no table starts until it is seeded, and a table only opens
  once it has `SEATS_MIN` seated (see §9.2) — there are no solo tables.
- **Funded from the closing table's swept leftovers first, Treasury tops up the rest** — the
  "close one, open one" loop is partly self-perpetuating instead of a fresh Treasury draw
  every time.
- **No insurance fund.** The seed is the *only* house money at risk, and it is bounded and
  per-table. Worst case (all 40 seeded at once) = 4,000 TIMBS committed; typical 2–4 tables =
  200–400 TIMBS. Cross-subsidy happens **at the Treasury level** (swap fees + token activity
  carry a quiet game week), never inside a pool — so the game can never insolvency-spiral or
  over-promise: it only ever pays out what is in the pool.
- **Farming ceiling:** solo pools now draw **no** seed (above) *and* pay the top 8% rake, so a
  lone actor's edge off a table is ≈ nil — the seed is only ever exposed to pools with ≥ 2 real
  wallets. Turning the rake dial up further only tightens it.

*Open sizing note:* 100 TIMBS is a chip-economics default. To size as a % of runway instead,
we need the Treasury balance + TIMBS pool price (target ≈ 40×seed ≤ a few % of Treasury).

### 9.1 Bet limits & thresholds — resolved

**No hard caps on how much can sit on one area relative to others.** A physical table's
*maximum* exists to bound the **house's** fixed-odds liability (one straight-up whale = a 35×
payout the house must cover). Pari-mutuel removes that reason entirely: the pool is the
counterparty, so a large bet on any spot creates **zero** house liability — it can only ever be
paid from money already in the pool.

Relative-area limits are also the wrong tool here:

- **The price already is the relative limit.** Payout on an area scales inversely with how much
  is on it (§6), so over-concentration thins its own return and ignored areas pay more —
  continuously, with no rule. A hard cap is a blunt duplicate of what the math does smoothly.
- **A relative cap would be ordering-unfair** (whoever bets later gets blocked by earlier bets),
  **gameable** by splitting across wallets (the exact thing distinct-wallet rake fights), and it
  **distorts the signal** the pool is supposed to broadcast.

What we rely on instead — all soft/structural, none timing-dependent:

- **One token per segment = one bet per segment per wallet** — the cleanest concentration limit
  there is; a wallet structurally cannot stack a pool (§4).
- **Min 5**, **graduated rake + solo-flatten**, and the **seven-way seed split** — these make
  concentration self-*taxing* rather than forbidden (§6, §8).
- **Seating / eligibility bounds over area caps** — players-per-table and tables-per-wallet do
  the real anti-farming work (see §9.2).
- **Transparency over caps** — surface live per-pool totals and the current implied per-chip
  return so the crowd rebalances itself; that is the pari-mutuel-native "limit."

### 9.2 Seating, eligibility & the inactive-ticket path

- **Seating — locked band.** A seat requires an active Compete ticket, and a wallet may sit at
  **multiple tables at once** — each seat issues its own six per-table tokens.
  - `SEATS_MIN = 2` — a table won't open/seed below this (no solo tables).
  - `SEATS_TARGET = 4` — the typical live table; the UI shows ~2.
  - `SEATS_SOFT_MAX = 8` — soft cap for pari-mutuel legibility.
  - `SEATS_HARD_MAX = 12` — hard cap, comfortably inside the per-lock settlement gas envelope.
  - **Tables per wallet: uncapped** — gated solely by holding an active ticket. No numeric cap is
    needed because the per-pool seed guard (`SEED_MIN_WALLETS = 2`, §9) removes the cross-table
    solo-farming incentive directly, and rake counts distinct wallets (§8). The safe player count
    is **gas-bound, not chain-bound**: each lock settles one pool, so even the hard cap is a tiny
    winners loop on Arbitrum; the design favors many parallel small tables (≤ ~40) over few large
    ones.
- **Eligibility is continuous.** A seat is valid only while its ticket is active. The moment the
  ticket goes inactive/ineligible (expired, consumed, revoked, …) the wallet can no longer
  **load or place** new chips at any seat.
- **UI freezes; the contract is the authority.** On detecting inactivity the page **freezes in
  place** (no new loads/placements) until the wallet holds an active ticket again. But the freeze
  is a safety on *input only* — settlement is on-chain and must resolve deterministically **with
  the UI closed** (the player can shut the tab). Never make a payout or a return depend on the
  page being open.
- **What happens to that wallet's money — the finality split** (this refines "sweep their
  positions"; do **not** claw placed bets back):
  - **Placed (approved) bets stay in their pools and settle normally.** They are final by the
    core rule, and — critically — every other player's pari-mutuel payout is computed against that
    money; removing it would break pool conservation for the whole pool. Winnings **push-pay to
    the wallet** on each segment lock regardless of ticket status (they were earned before the
    lapse).
  - **Unplaced loaded chips are returned to the wallet** — exactly the retire-at-six dislodge.
    They never entered a pool, so the return is clean.
  - **The inactive better still counts as a distinct wallet** for its pools' rake (§8): it was a
    real participant, and dropping it would retroactively change everyone else's payout.
- **"Sweep on re-entry" is a UI reconciliation, not the settlement.** By the time the wallet
  re-qualifies, the lapsed round has already resolved on-chain (returns + push-paid winnings);
  re-entry just re-syncs the frozen page and reopens play. Nothing is stranded waiting on it.

---

## 10. Segment lock: entropy, trigger & timing

How each segment's character is fixed at lock time. **Chosen: commit–reveal bound to a future
block hash, now; Chainlink VRF as the Phase-2 hardening path behind the same interface.**

### 10.1 Derivation

At table open, *before any bet*, the protocol generates a per-segment secret `sᵢ` (i = 1..6) and
publishes `commitᵢ = keccak256(sᵢ ‖ tableId ‖ i)` on-chain. Each segment has a scheduled **lock
block `Lᵢ`**. The locked character is:

```
charᵢ = jitter( seedᵢ , sᵢ , blockhash(Lᵢ) , velocityᵢ )        // → one of A–Z0–9
```

- `seedᵢ` — initial meter state from the prior recorded winning string (**seed, not answer**).
- `sᵢ` — the secret revealed at lock (committed at open, so it can't be swapped after seeing bets).
- `blockhash(Lᵢ)` — the lock block's hash: **unknowable to everyone, the protocol included, until
  `Lᵢ` is mined** (which is after bets close).
- `velocityᵢ` — accumulated swap velocity/entropy; a **rate/mixing** input only.
- `jitter(...)` reuses TimbPrize's class-preserving mapping (§13.2), so the char inherits an
  already-reviewed uniform mapping.

**Guard #1 holds:** the only secret-holder is the protocol, but `sᵢ` alone doesn't fix `charᵢ` —
`blockhash(Lᵢ)` does, and no one has that before `Lᵢ`. So no party can compute a segment's char
before it locks.
**Guard #2 holds:** swaps enter only through `velocityᵢ` (how fast / how erratically the meter
runs); the char is pinned by the block hash, so no swap sequence shifts *which* char lands.

### 10.2 Trigger & reveal-liveness

- **Normal path:** at `Lᵢ` the protocol submits `reveal(sᵢ)`. The contract checks
  `keccak256(sᵢ ‖ tableId ‖ i) == commitᵢ`, reads `blockhash(Lᵢ)`, computes `charᵢ`, settles pool
  `i`, and push-pays (§7).
- **Reveal window `W`,** with **`W < 256` blocks** so `blockhash(Lᵢ)` is still retrievable (the EVM
  only exposes the last 256 block hashes).
- **Missed reveal → bond slash + permissionless fallback.** If the protocol doesn't reveal in `W`,
  anyone may call a fallback that fixes `charᵢ` from block-hash entropy **without** the secret, so a
  table can never stall; the protocol forfeits a posted bond. Withholding can't help the protocol
  pick an outcome (the block hash dominates regardless), so the only motive to withhold is
  griefing/stall — which the bond + fallback neutralize.

### 10.3 Cadence & bets-closed cutoff

- Six segments lock **one at a time**, staggered across the round (spacing = a dial).
- Each segment `i` has a **bets-closed cutoff `Cᵢ`** a short window before `Lᵢ`: no new placement on
  segment `i` after `Cᵢ`. Since `charᵢ` depends on `blockhash(Lᵢ)` (unknown at `Cᵢ`), sniping can't
  predict the char anyway — the cutoff exists to kill last-block latency games and keep settlement
  clean. Cutoff length = a dial (candidate: a few blocks before `Lᵢ`).
- **Double-Digit** closes at the last segment's cutoff and settles on the sixth lock (needs all six
  chars).

### 10.4 Verifiability

On each lock the contract emits `(tableId, i, sᵢ, Lᵢ, blockhash(Lᵢ), velocityᵢ, charᵢ)`. Anyone can
recompute `charᵢ` and check it against the `commitᵢ` published at open — proving the protocol
neither knew the char early nor swapped secrets after bets landed.

### 10.5 VRF hardening (Phase 2)

Same lock interface, entropy swapped: `charᵢ = jitter(seedᵢ, VRFᵢ, velocityᵢ)` with `VRFᵢ` from
Chainlink VRF requested at `Lᵢ`. Removes the reveal-liveness duty and any sequencer-trust residue,
at the cost of LINK + callback latency across many parallel locks. Because it sits behind the same
interface, the upgrade is a module swap, not a redesign.

---

## 11. Invariants / test checklist (for when this is built)

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
- [ ] An inactive/ineligible ticket blocks new loads/placements but never claws back an
      already-placed bet — finality and pool conservation for co-bettors both hold.
- [ ] Every return and push-paid winning for an inactive better resolves on-chain with no UI
      action; a reverting recipient falls back to a pull-claim rather than bricking settlement.
- [ ] `commitᵢ` is published before any bet on the table; a reveal must match its commit, else the
      fallback fixes the char and the protocol's bond is slashed (§10.2).
- [ ] `charᵢ` depends on `blockhash(Lᵢ)` (or `VRFᵢ`) that is unknowable at the bets-closed cutoff
      `Cᵢ` — no early derivation by anyone, protocol included (guard #1, §10.1).
- [ ] Reveal window `W < 256` blocks so `blockhash(Lᵢ)` is retrievable; the fallback snapshots it.
- [ ] Swap inputs affect only `velocityᵢ`; adding or reordering swaps never shifts `charᵢ`'s
      distribution (guard #2, §10.1).

---

## 12. Open items (not yet decided)

- Exact **seed sizing** vs. Treasury runway (needs Treasury balance + TIMBS price).
- **Lock cadence & cutoff dials** — the lock mechanism is specced (§10); still to set the segment
  spacing across the round and the `Cᵢ` bets-closed length (§10.3), plus the reveal window `W` and
  the reveal-liveness **bond size** (§10.2).
- **Contract shape** — extend TimbPrize/GameRegistry vs. a standalone `SegmentBoard` that reads
  settled segments from TimbPrize and owns chip escrow + pools + the lock logic of §10. (Leaning
  standalone: 40×7 pools + per-table commits is a lot of state to bolt onto TimbPrize.)
- Whether Double-Digit's seed share rolls into segment pools if no DD bets exist.
- **Seed-guard leftover mechanism** — the *threshold* is locked (`SEED_MIN_WALLETS = 2` per pool,
  §9). Still to confirm: a forfeited solo-pool seed share goes to **Treasury** (current default) vs.
  **rolling into the table's qualifying pools**. Overlaps the Double-Digit rollover question below.
- **Confirm the per-lock gas envelope** on the target chain for `SEATS_HARD_MAX` (§9.2) — expected
  trivial on Arbitrum, but measure before finalizing the hard cap.
- **Push vs. pull payout.** Retire-at-six needs push-pay (nothing claimable later), but a push to a
  contract recipient that reverts could brick a whole pool's settlement. Need a **pull-claim
  fallback** (credit an in-contract balance if the push fails) so one griefing recipient can't DoS
  the table.
- **L2 finality for real-time pay** — how many confirmations before a segment lock's push-pay is
  treated as final (reorg safety vs. the "instant settlement" feel).
