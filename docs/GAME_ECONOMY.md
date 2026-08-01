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

Roulette's half-back rule, transplanted: when a **contested** pool settles
with no winner, half the pot returns to its bettors pro-rata as credit, half
feeds the jackpot. Session length is bankroll length — players who lose
*slower* play *longer*, and the half that leaves them funds the thing that
brings them back. Explicitly **not** applied to solo pools (breaks the
reserve; a lone farmer would be subsidised for betting into nothing).

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
3. **gen-7** (rules): la partage (M3) on contested dead pools, plus the
   bonus-chip rule — the Repeats-a-Digit stake now requires a full six-token
   load, matching what `place` has always required of segment bets. Without
   it a seated-but-unfunded wallet could buy into the DD pool, and with the
   jackpot live, into a strike, while contributing nothing to the six
   segment pools. Built and compiling; **not deployed**.
4. **M4** rides the gen-6 settle path; **M5** is app-only and can ship any
   time.

## Open questions

1. Jackpot slice percentage and floor (20% / 50 TIMBS are placeholders), and
   `FLOAT_TARGET` for the reserve waterfall (should cover several rounds of
   worst-case round caps — e.g. 3 × MAX_ROUND_UNDERWRITE = 4,500).
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
