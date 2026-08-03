# SwapTables game economy — feeding the pot, feeding the drive

Draft, 2026-07-31. Design doc, nothing built. Companion to
`UNDERWRITE_SPEC.md` (thin-pool fairness) and `GEN4_DEPLOY.md` (encore rounds).
All claims below were checked in simulation; the sims live with the session
notes, the conclusions live here.

## The one law

**More players at the table must never make any player's outcome worse.**

Every mechanism below was tested against this monotonicity law. The original
underwrite draft failed it — a solo bettor's underwritten 810 collapsed to 61
the moment one opponent joined and lost — which would teach players to want
empty pools. Fixed by making the reserve top up *thin contested* pools to the
same target: pool money pays first, the reserve covers the shortfall, caps
apply to the reserve's contribution only. A joiner can now only raise you.

This law is also the house's alignment story: rake is graduated (8% solo → 
1.75% crowded — and 0% uncontested per Layer 0), so **the house earns most when
tables are busy, players win most when tables are busy, and the jackpot grows
fastest when tables are busy.** Everyone in the system wants the same thing:
a full table.

## Flow of funds (target state)

```
stakes ──┬─ winners ─────────────── push-paid at each lock (+ reserve top-up, M1)
         ├─ rake (contested only) ─┬─ half → UnderwriteReserve   (activity-matched income)
         │                         └─ half → Treasury
         └─ ALL dead pots ───────── WATERFALL:
                                      reserve, until it holds FLOAT_TARGET
                                      overflow → half la partage · half Rolling Jackpot
seed ────── per table from funder ── unchanged (§9 guards intact)
Treasury ─┬─ seeds + backstops the UnderwriteReserve   (operator-approved, budgeted)
          └─ optional jackpot bonus drops for events   (operator-approved, budgeted)
```

**Solvency rule — no minting, only recycling.** TIMBS is never created for
these mechanisms. Treasury's contributions to the reserve and jackpot are
budgeted from what the game itself has *earned*: cumulative
`Treasury → (reserve + jackpot)` must never exceed cumulative
`(rake + sweeps) → Treasury`. The game economy is closed — subsidies are
deferred revenue given back, not inflation. In lean periods the caps simply
bind sooner (payouts floor at par and pool money); in busy periods the rake
funds the wiggle room. Track it as two running counters on the reserve
contract so the invariant is checkable on-chain, not just policy.

Why this shape — the two-regime stress test (sim-verified). A first draft
routed only solo forfeits to the reserve and gave contested dead pots straight
to la partage + jackpot. Stress-tested against the two regimes the table
actually produces, it **bled in both**:

| Regime | first draft | waterfall + rake share |
|---|---|---|
| winner-heavy (crowds on short odds, correlated wins) | −25 / round | **+21 / round** |
| loser-heavy (spread long shots, frequent forfeits) | −16 / round | **+12 / round** |

The monotonic top-up (M1) creates liability precisely in *winner-heavy, busy*
rounds — which produce no forfeits. The only income that scales with the same
activity is **rake**, so the reserve takes a rake share; and the reserve gets
**first call on every dead pot** until it holds a float, because solvency
comes before sizzle. Winner-heavy rounds are now the reserve's *best* regime:
the crowd that creates the top-ups pays the rake that funds them.

How each world feels: in a cold streak, forfeits fill the reserve and the
overflow visibly builds the jackpot — losing rounds literally grow the pot
everyone is chasing, and la partage slows the bleed. In a hot streak, payouts
flow, the rake share quietly self-insures them, and the jackpot grows slower —
which nobody minds, because they are winning.

## The mechanisms, ranked by leverage

### M1 — Monotonic underwrite (gen-6, accounting change)

`UNDERWRITE_SPEC.md`, amended per the audit: applies to solo **and** thin
contested pools as a shortfall top-up toward `stake × fair × 0.90`, capped per
pool / per round / never above what makes a crowd worse. What it buys:
long-shot bets are real at every table size, and nobody ever wins less than
they staked. What it costs: bounded reserve variance, self-funded at ~10% of
solo turnover.

### M2 — Rolling Double-Digit jackpot (the "play and play" engine)

**Status: IMPLEMENTED 2026-07-31** (`DD_JACKPOT.md`) — cross-generation
`DDJackpot` contract, trusted-board registry, 20%/50-TIMBS meter
(owner-tunable, slice ≤ 50%), §9 two-wallet guard, permissionless strike
fired by the auto-pilot after the sixth lock. Deploy pending.

Double-Digit is already the game's rarest, most legible event (~36% of rounds
even *can* pay it — 1 - (35·34·33·32·31)/36^5 = 0.356; the felt's old ~38%
was wrong). Make it progressive:

- Unclaimed DD pots and half of contested no-winner pots roll into a
  **jackpot pool that persists across tables** (same cross-generation shape as
  SeedRegistry — deploy once, never redeploy).
- Each table's DD pool draws a **metered slice** of the jackpot (e.g. 20%,
  min 50 TIMBS), not the whole thing — the gen-4 encore plan's anti-drain
  reserve logic, reused verbatim.
- **Jackpot slice pays only if ≥2 distinct wallets bet DD** (§9 guard again),
  so it cannot be farmed by a lone wallet grinding empty tables.

This is the classic variable-ratio hook done honestly: the number on the
banner only ever climbs until somebody takes it, everyone at the table can see
it, and the last lock of every round is a jackpot moment. The stream banner
gets `JACKPOT 1,240 TIMBS` next to the pot, and the drumroll's sixth reveal
becomes appointment television.

### M3 — La partage on contested dead pools (bankroll preservation)

**Status: simulated 2026-08-03 ([`RESERVE_SOLVENCY.md`](RESERVE_SOLVENCY.md)) —
approved in the overflow-funded form only.**

Roulette's half-back rule, transplanted: when a **contested** pool settles
with no winner, half the pot returns to its bettors pro-rata as credit. Session
length is bankroll length — players who lose *slower* play *longer*. Explicitly
**not** applied to solo pools (breaks the reserve; a lone farmer would be
subsidised for betting into nothing).

The half-back is paid **out of the overflow earmark**, never off the top of the
dead pot. That distinction is the whole verdict:

- **overflow-funded** leaves top-ups, coverage and the reserve's floor identical
  to today — zero cost by construction, because the earmark is by definition the
  money the reserve does not need. It returns ~331/round in a cold streak and
  pays nothing in a hot one, which is exactly when bankroll preservation is and
  is not wanted.
- **off the top** cuts winner-heavy underwrite coverage from 54% to 32%. Dead
  pots are scarce precisely where the reserve is already short, so halving them
  takes from the wrong pocket.

The farm-resistance table below always said overflow-only; this prose used to say
off-the-top and split it with the jackpot. Overflow-only is correct.

Two prerequisites: `overflowEarmark` is today a **counter with no spend path**,
so M3 is a reserve change rather than a board change; and the waterfall's
half-la-partage / half-jackpot split has to be enforced, because at a raised
`floatTarget` the half-backs would otherwise consume the whole earmark and
quietly starve M2.

### Dead-pot stake-back — closed, not affordable

Returning every stake from a no-winner pool was weighed on the same simulation
and rejected: underwrite coverage collapses to 9.6% / 4.0%, so M1 stops
functioning in both regimes. It also makes betting into a pool you expect to die
free, which is a farm surface §9's two-wallet rule does not cover.

### M4 — Encore tables (already designed, now load-bearing)

`GEN4_DEPLOY.md`'s encore rounds: a table that retires holding a surplus
re-offers itself instead of dying. With M2 the encore banner is not just "the
table is still open" but "**the pot is still on the table**" — the strongest
possible come-back hook, and it needs no new design work beyond what the gen-4
plan already holds (metered reserve, minimum-chip scaling).

### M5 — Status layer (free retention, no token flow)

The 7-day wallet performance card already on the roadmap, plus a per-table
history of winning strings. Streaks, biggest single hit, jackpot honour roll
on the stream page. Costs nothing, farms nothing, and gives the stream a
protagonist ("♠·9dE is up 400 this week").

### M6 — Tip the dealer (gen-6, `GEN6_DEALER_TIP.md`)

The wallet that opens a table is the dealer — it commits the secrets and runs
the reveals. After the sixth lock (never before: a sealed outcome is what
makes a tip gratitude rather than a bribe), any seated wallet can move part of
its credit to the opener with one click. Zero rake, credit-to-credit only, no
subsidy involved so §9 has nothing to guard. Pays the person doing the work of
hosting rounds, gives the drumroll an outro beat, and feeds M5 ("top-tipped
dealer this week").

## Farm-resistance checklist

Every subsidy traced against a lone-wallet attacker:

| Flow | Attack | Guard |
|---|---|---|
| Underwrite | solo-farm long shots | RTP < 1 (0.90) — grinding it loses 10% forever; caps bound variance |
| Jackpot slice | lone wallet grinds DD on empty tables | pays only with ≥2 distinct DD wallets; metered slice |
| La partage | bet into empty pools for half-back | contested pools only, and only from waterfall overflow — an empty reserve pays no half-backs |
| Encore carry | "bet 5 to drain the carry" | gen-4 plan's min-chip scaling + metered reserve, unchanged |

The recurring pattern is §9's: **no subsidy flows to a pool with fewer than
two distinct wallets.** One rule, four mechanisms.

## Sequencing

1. **gen-5** (timing): adaptive entry, late loading, arm-on-funded — plus
   underwrite **Layer 0** (never rake an uncontested pool; one line).
2. **gen-6** (accounting): monotonic underwrite (M1) + reserve, dealer tips
   (M6 — one appended table field + one ledger `moveCredit`). The jackpot
   contract (M2) can deploy alongside — it is additive and cross-generation.
3. **gen-7** (rules): the bonus-chip rule — the Repeats-a-Digit stake now
   requires a full six-token load, matching what `place` has always required of
   segment bets. Without it a seated-but-unfunded wallet could buy into the DD
   pool, and with the jackpot live, into a strike, while contributing nothing to
   the six segment pools. Built and tested; **not deployed** —
   [`GEN7_DEPLOY.md`](GEN7_DEPLOY.md) is the runbook, and it carries a trap
   worth reading before the deploy: the script mints a fresh UnderwriteReserve
   every generation and the gen-6 float does not travel with it.
   **M3 no longer rides this generation** — it turned out to be a reserve change,
   not a board change (the earmark needs a spend path), so it is independent of
   the board's generation clock entirely.
4. **M4** rides the gen-6 settle path; **M5** is app-only and can ship any
   time. `setFloatTarget(10_000e18)` is a one-call change on the live reserve
   and needs no generation at all.

## Trust posture

The opener's selection edge — it can compute both the reveal and the fallback
outcome once armed, and pick between them — is recorded in
[`ENTROPY_TRUST.md`](ENTROPY_TRUST.md). **Fixed in generation 8**
([`GEN8_VRF.md`](GEN8_VRF.md)): one Chainlink VRF draw per segment, no secret,
no fallback path, so there is no longer a second outcome to select. It did cost
a board generation, as predicted — the old entropy seam was all `view` and a
view cannot wait for an oracle. Built and tested; not yet deployed, so every
live generation still carries the edge until it is.

## Open questions

1. Jackpot slice percentage and floor (20% / 50 TIMBS are placeholders).
   ~~`FLOAT_TARGET`~~ **Answered 2026-08-03: 4,500 is too low.** The waterfall
   pins free float at the target, and the 10% fraction cap then limits any one
   grant to ~450, so loser-heavy rounds cover only 62% of what M1 asks for while
   1.48M sits parked in overflow. Raising it to 10,000 takes coverage to 91% and
   still leaves ~905K of overflow. `setFloatTarget` is an owner call on the live
   reserve — no redeploy. See [`RESERVE_SOLVENCY.md`](RESERVE_SOLVENCY.md).
1c. **New, unresolved: the reserve is income-bound in winner-heavy rounds.** M1
   asks for 288/round there and the reserve takes in 155/round, so it grants
   ~155 — about half the promise — and that number does not move for any float
   target, fraction cap or pool/round cap. The levers are a bigger rake share, a
   lower `PAYOUT_RATIO_BPS`, or budgeted Treasury support. It degrades
   gracefully (winners get less top-up, never less than the pool pays), so this
   is a tuning question, not a solvency emergency.
1b. Rake share (50/50 reserve/Treasury is the sim-tested placeholder — Treasury
   keeps half of a busier game rather than all of a subsidised one).
2. Does la partage credit auto-stake into the encore round (stickier, but more
   contract surface) or sit as withdrawable credit (simpler, chosen for now)?
3. ~~Should the jackpot accept outside top-ups?~~ **Answered: yes, budgeted.**
   Treasury may route TIMBS into the reserve and jackpot, bounded by the
   solvency rule above — only earned revenue is recycled, never minted. Bonus
   drops become a stream-event tool ("tonight's jackpot is boosted"), sized by
   what the rake has actually brought in. The jackpot still needs a guardian +
   halt, since it custodies meaningful TIMBS.
