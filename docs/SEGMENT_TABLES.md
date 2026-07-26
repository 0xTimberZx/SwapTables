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

## 10. Segment lock: the spin — entropy, velocity & timing

Each segment is a **roulette spin**. The meter is the ball: it spins up, runs, decays, and settles
into one character. Swaps are the only thing players push on, and they move the *ball's speed*, never
where it lands. **Chosen: commit–reveal bound to a future block hash now; Chainlink VRF as the
Phase-2 entropy, with the pre-VRF path kept as a covert fallback (§10.6).**

### 10.1 Derivation

At table open, *before any bet*, the protocol generates a per-segment secret `sᵢ` (i = 1..6) and
publishes `commitᵢ = keccak256(sᵢ ‖ tableId ‖ i)` on-chain. Each segment settles at a **settle block
`Lᵢ`** (the pick moment, §10.3). The locked character is:

```
charᵢ = jitter( seedᵢ , entropyᵢ , spinPathᵢ )        // → one of A–Z0–9
   entropyᵢ  = VRFᵢ  (Phase 2)  |  sᵢ ⊕ blockhash(Lᵢ)  (now / covert fallback)
   spinPathᵢ = the accumulated velocity envelope over the spin (swap-driven, §10.2)
```

- `seedᵢ` — a **prior winning TimbSwap string** used only to randomize the meter's *start position*
  (**seed, not answer**), drawn via `entropyᵢ`. A string is **never reused** — a used-seed registry
  enforces uniqueness across all tables and segments.
- `entropyᵢ` — the unpredictable term. Now: `sᵢ` (revealed at settle) mixed with `blockhash(Lᵢ)`,
  **unknowable to everyone, the protocol included, until `Lᵢ` is mined** (after bets close). Phase 2:
  Chainlink `VRFᵢ`.
- `spinPathᵢ` — how the meter actually travelled (its velocity envelope): a **rate/mixing** input
  only, fed by swaps. It changes the journey, not the landing.
- `jitter(...)` reuses TimbPrize's class-preserving mapping (§13.2), so the char inherits an
  already-reviewed uniform mapping.

**Guard #1 holds:** the char is pinned by `entropyᵢ`, and no party has it before `Lᵢ` — the
protocol's secret alone doesn't determine the char; the future block hash (or VRF) does.
**Guard #2 holds:** swaps enter only through `spinPathᵢ` (how fast / how erratically the ball runs);
the landing is fixed by `entropyᵢ`, so no swap sequence shifts *which* char lands.

### 10.2 The spin: velocity envelope (dealer strategy)

The meter runs on a velocity envelope shaped by **player count** — the mechanical version of a dealer
choosing how hard to spin. Player count never moves the **landing time** (the pick is fixed, §10.3);
it shapes *how the ball gets there*. Under the current tuned values (see table below) a busy table
spins up hard and fast, and stays lively — faster and more jittery — right to the wire; a thin table
is slower and calmer into a pick that lands at the same instant for both.

**Normalized spin clock.** Let `τ ∈ [0,1]` run from the spin-commit (40-min mark) to the pick
(`τ=1`). The meter's velocity is **Model A** (logistic spin-up → glide-down) with a **pocket-rattle**
overlay near the end:

```
v(τ; n) = v_run(n) · R(τ; n) · G(τ; n) · [ 1 + rattle(τ) ]  +  swapPerturbation(τ)

  R(τ; n) = 1 / (1 + e^(−k(n)·(τ − τ₀)))                     // logistic spin-up, τ₀ ≈ 0.1
  G(τ; n) = 1                                        for τ < τ_s(n)   // running plateau
          = resid(n) + (1−resid(n))·((1−τ)/(1−τ_s(n)))^γ   for τ ≥ τ_s(n)   // glide to the wire
  rattle(τ) = β · e^(−ζ(τ−τ_r)) · cos(ω(τ−τ_r))   for τ > τ_r (≈0.9), else 0   // pocket bounce, β→0 at τ=1
```

- `R` — the spin-up: rises to the plateau at steepness `k(n)`.
- `G` — the glide: flat until settle-onset `τ_s(n)`, then decays toward the **wire residual**
  `resid(n)` (the jitter still visible at the pick before the lock).
- `rattle` — cosmetic damped-cosine wobble in the last ~10% so the meter bounces between candidate
  chars like a ball between frets; amplitude `β` decays to 0 exactly at the pick.
- `swapPerturbation` — swap-driven jitter, scaled by the current envelope and **decaying through the
  last 5 min** (§10.3). This is the only player-*action* input, and it moves `spinPath`, not the
  landing (guard #2).

At `τ=1` the meter locks to the entropy-selected char (§10.1) and reconciles against **TimbPrize's
settled result** (§10.3 / §13.4).

**Player → influence map (anchored at n=3).** Concave, so the low end is expressive:

```
p(n) = ln(n − 2) / ln(HARD − 2) ,  clamped to [0,1] ;  n = 2 clamps to the n=3 floor
```

A 2-seat table (`SEATS_MIN`, §9.2) spins at the **floor envelope**; the crowd effect begins at n=3.
The four coefficients move off `p(n)`. **Values below are the first tuned pass from the tuner
(§10.2 tool), superseding the original directional guesses:**

| n | p(n) | `v_run` 0.55→1.20 | `τ_s` 0.40→0.39 | `resid` 0.120→0.145 | `k` 12→16 |
|---|------|-------------------|-----------------|---------------------|-----------|
| 2 | — (floor) | 0.55 | 0.40 | 0.120 | 12.0 |
| 3 | 0.00 | 0.55 | 0.40 | 0.120 | 12.0 |
| 4 | 0.30 | 0.75 | 0.40 | 0.128 | 13.2 |
| 5 | 0.48 | 0.86 | 0.40 | 0.132 | 13.9 |
| 6 | 0.60 | 0.94 | 0.39 | 0.135 | 14.4 |
| 8 | 0.78 | 1.06 | 0.39 | 0.139 | 15.1 |
| 12| 1.00 | 1.20 | 0.39 | 0.145 | 16.0 |

Fixed dials (not n-varying): `τ₀ = 0.05`, `γ = 1.28`, rattle `β = 0.31 / ζ = 3.5 / ω = 10 / τ_r =
0.72`, swap-noise `= 0.21` (reels only).

3→4 is the biggest single step; 8→12 barely moves — diminishing returns, by design.

**Two deliberate shifts from the original directional guess (confirmed intentional):**
1. **`τ_s` is nearly flat (~0.40 for all n)** — every ball settles early and glides the back ~60% of
   the spin, regardless of crowd. The "busy settles *sooner*" lever is intentionally off.
2. **`resid` is inverted** — busy tables carry *more* wire jitter (0.145) than thin ones (0.120).
   So the crowd effect is carried by **peak speed** (`v_run` 0.55→1.20) and **wire liveliness**:
   busy = faster and more alive at the pick, thin = slower and calmer.

These are a **provisional baseline** — accepted for now, to be re-felt against real play before final
lock. The model and player map are settled; only these numeric values are open to revisit.

**Where it runs.** The envelope is *display/velocity* dynamics only — the char is entropy-pinned
(§10.1) — so the curve can live off-chain / in the frontend meter with just a `spinPath` summary
committed for verification (§10.5). Not gas-bound, so the richer model is affordable.

**Tuner.** An interactive sandbox for these coefficients lives at
[`docs/tools/spin-tuner.html`](tools/spin-tuner.html) — five reels at n=3/4/5/8/12, the live
`v(τ;n)` curves, sliders for every dial (defaults reproduce the table above), and a copy-to-spec
button. Open it in a browser to tune the ranges by feel; the coefficient values here get set from it.

### 10.3 Timing marks (per segment — all dials)

Measured within the segment window; candidate values are the user's:

- **Entry — open → 40-min mark.** Anyone may join / place before the 40-min mark. **After 40 min no
  new entries**: the spin is locked in and the ball is committed to its envelope. (Seats can fill any
  time in this window; swaps start pushing velocity as soon as `SEATS_MIN` is met, §10.2.)
- **Bets close — last 5 min.** No new bets in the final 5 minutes. Swaps still land and add **large
  jitter**, but their influence **decays** to nothing by the 1-min mark (curve below).
- **The pick — 1-min mark, +55s.** By the 1-min mark swap influence ≈ 0. **55 seconds later** (~5s
  before end) the meter makes a **definitive pick**, displays it while settling, and **reconciles
  against TimbPrize's settled result** — a pull-read (there is no separate `TimbSettler` contract and
  no hook; "settler" is a role on TimbPrize, §13.4), not literal microseconds; `Lᵢ` is that settle
  block.
- **Six segments — overlapping & synced.** The six per-segment windows **run concurrently on the
  same clock** (all share the entry / bets-close / pick marks), so a round is one ~segment-length
  window with six balls spinning at once, not six in series. Double-Digit reads all six picks and
  settles on the shared pick (§6.1).

Because the char depends on `entropyᵢ` unknowable until `Lᵢ`, closing bets early isn't what stops
sniping (nothing to snipe) — it keeps the last minute a pure settle with no new stakes landing on a
ball already committed.

**Swap-influence decay (the last 5 min).** After bets close, swaps keep landing but their pull on the
meter fades to zero by the 1-min mark, so the finish reads clean. This is the amplitude term behind
`swapPerturbation` (§10.2). Over minutes-remaining `m`:

```
swapAmp(m) = a_run                                for m > 5      // open run: ambient jitter
           = a_peak · ( (m − 1) / (5 − 1) ) ^ d   for 1 ≤ m ≤ 5  // final window: huge → 0
           = 0                                     for m < 1      // last ~minute: pure settle
```

with `a_peak ≫ a_run` — bets close with a **burst** of "huge" jitter that then decays under exponent
`d` (**chosen: `d = 2`**; still a dial):

| minutes left | 5 | 4 | 3 | 2 | 1 | pick (~0:05) |
|---|---|---|---|---|---|---|
| weight (d=2) | 1.00 | 0.56 | 0.25 | 0.06 | 0.00 | 0.00 |

Front-loaded on purpose: a swap at the 4-min mark still shoves the meter hard, one at 2-min barely
registers, and by 1-min swaps do nothing. **Why we can afford "huge":** the char is entropy-pinned
(§10.1), so even a violent late swap *cannot* move the outcome (guard #2) — the burst is pure theatre,
and the decay just makes sure the pick doesn't *look* swayed either. `t_close = 5 min`, `t_zero =
1 min`, `a_peak`, `a_run`, and `d` are all dials.

### 10.4 Trigger & reveal-liveness

- **Normal path:** at `Lᵢ` the protocol submits `reveal(sᵢ)`. The contract checks
  `keccak256(sᵢ ‖ tableId ‖ i) == commitᵢ`, mixes in `blockhash(Lᵢ)`, computes `charᵢ`, settles pool
  `i`, and push-pays (§7).
- **Reveal window `W < 256` blocks** so `blockhash(Lᵢ)` is still retrievable (the EVM only exposes
  the last 256 block hashes).
- **Missed reveal → bond slash + permissionless fallback.** If the protocol doesn't reveal in `W`,
  anyone may fix `charᵢ` from block-hash entropy **without** the secret, so a table can never stall;
  the protocol forfeits a posted bond. Withholding can't steer the outcome (the block hash dominates
  regardless), so its only motive is griefing/stall — which the bond + fallback neutralize.

### 10.5 Verifiability

On each pick the contract emits enough to recompute `charᵢ` (`seedᵢ`, the entropy inputs actually
used, `spinPathᵢ` summary, `Lᵢ`, `charᵢ`) and check it against the `commitᵢ` published at open —
proving the protocol neither knew the char early nor swapped secrets after bets landed. **Tension to
resolve (§12):** full public verifiability of *which entropy path ran* partly conflicts with the
covert fallback (§10.6); the plan is to emit enough to verify the char is correct **given the entropy
actually used**, without surfacing a prominent "fell back" flag.

### 10.6 VRF era & the covert fallback

Phase 2 makes `entropyᵢ = VRFᵢ` (Chainlink), removing the reveal-liveness duty and any
sequencer-trust residue. The pre-VRF path (§10.1 `sᵢ ⊕ blockhash`) is **not retired** — it stays as a
**silent fallback**: if a VRF request fails or stalls, the char is fixed from the pre-VRF path with
**identical settle timing and UX and no "degraded" flag**, so an attacker can't detect a weak window
and time an attack to it.

**Honest caveat — this is defense-in-depth, not the security boundary.** Chainlink VRF requests and
fulfillments are on-chain observable, so a determined expert may still infer that a fallback ran. The
real guarantee is that **the fallback path is itself unpredictable** (future block hash), so even a
*detected* fallback gives no predictive edge. Not advertising the fallback (no distinct event, flag,
or UX change) simply raises the attacker's cost — it never carries the safety on its own. Same lock
interface either way, so the VRF upgrade is a module swap, not a redesign.

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
      fallback fixes the char and the protocol's bond is slashed (§10.4).
- [ ] `charᵢ` depends on `entropyᵢ` (VRF or `sᵢ ⊕ blockhash(Lᵢ)`) unknowable until the pick block
      `Lᵢ` — no early derivation by anyone, protocol included (guard #1, §10.1).
- [ ] Reveal window `W < 256` blocks so `blockhash(Lᵢ)` is retrievable; the fallback snapshots it.
- [ ] Swap inputs affect only `spinPathᵢ` (velocity); adding or reordering swaps never shifts
      `charᵢ`'s distribution (guard #2, §10.1/§10.2).
- [ ] **Seed uniqueness:** no winning TimbSwap string is ever reused as a `seedᵢ` — the used-seed
      registry rejects repeats across all tables and segments (§10.1).
- [ ] **Covert fallback is silent:** a VRF-era fallback to the pre-VRF path emits no distinguishing
      flag and does not change settle timing or UX; and the fallback char is itself unpredictable, so
      detection grants no edge (§10.6).
- [ ] **No new entries after the 40-min mark; no new bets in the last 5 min**; swap influence decays
      to ≈0 by the 1-min mark and the pick lands ~55s later (§10.3).
- [ ] **Escrow is sacred:** neither guardian nor owner can reduce the escrow-backing balance below
      `Σ(open pots + unsettled bets + unclaimed winnings)`. The guardian moves **no** funds; owner
      withdrawals are capped to protocol-owned balance only; neither role can alter a settled outcome
      or block a pull-claim (§13.2).
- [ ] **Renounce is terminal:** after ownership is renounced / the guardian retired, every privileged
      entrypoint reverts, and normal play + pull-claims keep working with no admin present (§13.2).

---

## 12. Open items (not yet decided)

> **Generation 1 ran live on Arbitrum Sepolia** — a full round settled and the vault drained to
> zero, confirming escrow conservation, the graduated rake and the §9 seed guard on real money.
> Numbers and deployment findings: [`VALIDATION.md`](VALIDATION.md).

- **Abandon path for an under-seated table** (found in live testing). A table that never reaches
  `SEATS_MIN` cannot be armed (§10.3) → never locks → never retires, so any chips already loaded
  are stranded; only the seed is recoverable (`ownerWithdraw`). Needs a permissionless cancel for
  a table past its entry cutoff with `seatCount < SEATS_MIN`, refunding chips and returning the
  seed. **This is the one known way player funds can be stuck.**
- **Seed funding is a pull, so the funder must be able to `approve`** — a treasury *contract*
  usually cannot. Resolved in §13.1 by splitting `seedFunder` from `treasury`; noted here because
  it is a deployment-time footgun, not just a code detail.
- Exact **seed sizing** vs. Treasury runway (needs Treasury balance + TIMBS price).
- **Spin-envelope tuning** — model + player map are locked, and a **provisional tuned baseline** is in
  the §10.2 table (flat `τ_s`, inverted `resid` — both confirmed intentional). Values stay open to
  re-feel against real play before final lock. The swap-influence **decay curve** is now specced
  (§10.3, decay exponent `d = 2` chosen); still to set its amplitude dials (`a_peak`, `a_run`) and the
  reveal window `W` + reveal-liveness **bond size** (§10.4).
- **`n=2` spin-eligibility** — a 2-seat table currently spins at the floor envelope (§10.2). Confirm
  that vs. raising spin-eligibility to 3 (would need `SEATS_MIN` 2→3 in §9.2).
- **Settle-reconcile mechanics** — approach is decided: SegmentBoard **pull-reads** TimbPrize's
  settled result (no `TimbSettler` contract, no hook — §13.4), keeper sequences for a tight reconcile.
  Still to pin: same-block vs. next-block read, and reorg-safety confirmations before push-pay is final.
- **Verifiability vs. covert fallback** — reconcile emitting enough to prove `charᵢ` fair against
  *not* surfacing a "fell back" flag (§10.5/§10.6).
- **Contract shape** — decided: standalone, **immutable**, four-module split, migrate-by-generation,
  **halt-only guardian + owner protocol-fund moves** (escrow untouchable), both **renounceable** and
  removed at maturity → zero-privilege end-state (§13). No open sub-details.
- **Swap-velocity data source** — the off-chain meter needs a TimbSwap Router/pair **Swap event or
  volume getter**; no Router ABI is vendored in this repo yet (only TimbPrize's `ScrollNudged`). Pull
  it from the TimbSwap Foundry build. Not a contract dependency (§13.1), only a frontend feed.
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

(L2 finality / reorg-safety for the push-pay is folded into **Settle-reconcile mechanics** above.)

---

## 13. Contract shape

> **Where it's built.** This repo is the **app layer** — it vendors no Solidity. `SegmentBoard` and
> its modules are built in the **TimbSwap Foundry project** (`0xTimberZx/TimbSwap`); this section is
> the design of record. `onchain/addresses.js` carries `SegmentBoard = 0x0` until first deploy.
> Chain: **Arbitrum Sepolia (421614)**.

### 13.1 Modules — split for auditability

Four pieces, not a monolith, so the money-safety surface can be audited in isolation:

- **`SegmentBoard`** (core) — table lifecycle, seats, per-segment commit/reveal, the pick,
  retire-at-six, settlement orchestration. The state machine.
- **`PoolLedger`** — chip escrow, the 7 pools per table, pari-mutuel math, rake, conservation. Every
  money invariant in §11 must be verifiable against *this contract alone*.
- **`IEntropy`** — pluggable entropy. `CommitRevealEntropy` now; `HybridEntropy` (VRF with the silent
  block-hash fallback, §10.6) later. The covert fallback lives **inside** the module, so it's never a
  contract swap.
- **`ISeedSource`** — thin adapter over TimbPrize; reads a settled `bytes6` winning string and
  enforces never-reuse (§13.4).

**No on-chain swap coupling.** The velocity envelope is display-only and the char is entropy-pinned
(§10.2), so swap flow is a **frontend** input to the meter, not a contract dependency. `SegmentBoard`
on-chain needs only entropy + seed + pools + settle.

### 13.2 Immutable, migrate-by-generation

No proxies; logic and on-chain params are fixed at deploy. Upgrades — VRF (§10.6), re-tuned economics
— ship as a **new generation**: a fresh deploy that new tables open on, while old tables **drain**.

**Why immutability is cheap here:** tables **retire at six** (§7) — there is no long-lived per-table
state to migrate. A new generation just becomes the target for new tables; the frontend re-points and
old tables finish on the old contract. Short table life turns "migration" into "stop opening on the
old one."

- **Covert fallback survives immutability** — it's intra-module (inside `HybridEntropy`), not a
  contract swap, so nothing about the generation model exposes it.
- **Accepted cost** — on-chain economic dials (rake, band, seed policy, timing marks, Treasury) are
  fixed per generation; re-tuning them = a redeploy. Tolerable given short table life. Spin
  coefficients are off-chain (§10.2), so *those* re-tune freely with no redeploy.
- **Safety within immutability (decided):** two limited, event-logged roles.
  - **Guardian — halt only.** Can pause *new-table-open* and *new-bets*; can **never** move funds,
    change an outcome, or block exits. Pull-claim (§13.3) stays open so players can always withdraw
    even while halted.
  - **Owner — protocol-fund moves only.** May move **protocol-owned balances** (accrued rake awaiting
    Treasury sweep, uncommitted seed float, stray/rescued tokens, contract ETH not backing a pot) to
    another contract — e.g. to seed a new generation or route to Treasury. **Hard boundary: the owner
    can never touch player escrow.** Every owner withdrawal is capped on-chain so the escrow-backing
    balance never drops below `Σ(open pots + unsettled bets + unclaimed winnings)` (§11). Player funds
    are provably untouchable — that is what keeps conservation (§8/§11) credible.
  - **Player funds never need cross-contract migration:** tables retire-at-six and old generations
    drain, so stakes always settle out on the contract they were placed on. Owner fund-moves are
    protocol ops, not pots.
  - **Both roles are launch-phase scaffolding.** Guardian and owner are training wheels for the beta
    window and are **one-way renounceable** — owner → `address(0)`, guardian permanently disabled,
    each making its calls forever uncallable. They are **removed once the game is finalized and stable
    on the live website**, leaving a **zero-privilege, fully immutable** generation: no halt, no
    fund-move, no admin at all. That renounced state is the real target; the roles just get it there
    safely.
  - **Timelock:** skipped for the beta window — the role is temporary, narrow (protocol funds only),
    and capped — so owner moves stay **instant** until renounce. (Revisit only if the window runs long.)

### 13.3 State & settlement — no unbounded loops

- **Keyed mappings only:** `tableId → segment → pool → better`. No iteration over seats or pools in
  any settle path (§11).
- **Push-pay per segment lock**, bounded to that one pool's winners, with a **pull-claim fallback**
  if a push reverts (§7, §11) — one griefing recipient can't DoS the table, and nothing stays
  claimable at retire on the happy path.
- **Permissionless `settleSegment`:** reads entropy at `Lᵢ`, pulls TimbPrize's settled result
  (§13.4), reverts if that round isn't settled yet. A keeper sequences both calls when it wants them
  tight (§10.3) — no hook, no privileged settler on our side.
- **Pack the hot seat struct** (pool id, amount, wallet, flags) into minimal storage slots — written
  ~3k×/round across 40 tables.

### 13.4 Seed & reconcile — real TimbPrize binding

TimbPrize is itself a 6-position `bytes6` segment engine; we consume its results, we don't extend it.

- **Seed:** `ISeedSource.readSeed(round) → bytes6`, backed by TimbPrize `roundWinningString(round)` /
  `getRoundResult(round)`. Require the round settled (mirror TimbPrize's `RoundNotSettled` guard), then
  mark it **used** so no string is ever reused (§10.1). `bytes6` is exactly our six-char format.
- **Reconcile:** there is **no `TimbSettler` contract** and **no callback/hook** — "settler" is a
  *role* on TimbPrize and settlement is its `settleSegment()`. So SegmentBoard **pull-reads** the
  settled result; a same-block reconcile is just a keeper sequencing both calls in one tx.
- **Cross-generation uniqueness:** to keep never-reuse across immutable generations, the used-round
  registry lives in a small **append-only `SeedRegistry`** (authorized writers = deployed generations)
  that outlives any single generation — the one shared, long-lived piece of state.
