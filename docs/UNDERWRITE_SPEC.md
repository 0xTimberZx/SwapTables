# Uncontested pools — underwriting thin tables

Draft, 2026-07-31. **Spec for review; nothing built.** Written after the gen-4
sessions, from a question with an ugly answer: *what does a solo player get for
landing a single letter?*

## The problem, measured

A pool with one bet in it (`n = 1`) settles like this today:

```solidity
pot          = your chip                       // no seed share: n < SEED_MIN_WALLETS (§9)
rake(1)      = 175 + (800-175)/1 = 800 bps     // 8%, the maximum
distributable= pot * 0.92
yourShare    = distributable * w_i / totalW    // = 1, you are the only weight
```

**A solo winner receives 0.92× their own stake.** On a 25 chip: hit *Exactly A*
and collect 23 TIMBS. Miss, and the chip forfeits to Treasury at retire.

| | solo, today |
|---|---|
| Win *Exactly A* (p = 1/36) | 23.00 on a 25 stake |
| Expected value | **0.64 TIMBS — 2.6% of stake** |

The advertised **35×** is not a payout multiplier. It is `WEIGHT_SCALE`, used
only to divide a pot *between* winners. Pari-mutuel means you win other
people's money; alone in a pool there is none, so the multiple cancels out.

This is not a bug — it is §9's anti-farm guard working. If a solo pool drew the
seed share, one wallet could bet 5 and take ~19 ("bet 5 to win 14"). But the
side effect is a player who wins and still loses money, which is the worst
sentence a game can produce.

**It is common, not exotic.** Three players across six segments plus
Double-Digit leaves most pools solo. Table 2 forfeited two whole pools
(SEG 4 · 10, SEG 6 · 25) exactly this way.

## The fork

Pari-mutuel with thin liquidity cannot pay long odds. Either:

1. **A pool pays only what is in it** (today) — long shots are worthless alone,
   and no outside money is ever at risk; or
2. **Something outside the pool tops it up** — players get real odds, and the
   protocol takes variance.

This spec proposes (2), bounded, and funded from money the game already
forfeits.

## Proposal — three layers

### Layer 0 — never rake an uncontested pool

One line, no new money, removes the insult:

```solidity
uint256 rakeBps = (n >= SEED_MIN_WALLETS)
    ? RAKE_FLOOR + (RAKE_BASE - RAKE_FLOOR) / n
    : 0;                       // solo: nothing to take a cut of but the player's own chip
```

Solo winner gets par (25 → 25). Ship this even if nothing else lands: the rake
exists to price a *contest*, and there is no contest.

Expected value is still poor (par × p(win)); Layer 1 is what makes the bet real.

### Layer 1 — top every thin winner up to a target RTP

**Audit finding (2026-07-31):** the first draft underwrote *solo* pools only.
Simulated, that fails monotonicity — a solo bettor's 810 collapsed to 61 the
moment one opponent joined and lost, so joining a pool would *hurt* the player
already in it. The fix is a **shortfall top-up**: the pool pays first, and the
reserve tops any winner up to the same target. A joiner can only raise you.

```
target   = stake * (36 / symbols) * PAYOUT_RATIO      // PAYOUT_RATIO = 0.90
poolPay  = winner's pari-mutuel share (unchanged math)
topUp    = min( target - poolPay,
                MAX_UNDERWRITE_PAYOUT, reserve * MAX_RESERVE_FRACTION )
pay      = max( poolPay + max(topUp, 0), stake )       // never below par
```

Once `poolPay` alone clears the target (a genuinely busy pool), the reserve
contributes nothing — the mechanism fades out exactly where pari-mutuel starts
working on its own.

`PAYOUT_RATIO` applies uniformly, so **every bet type returns the same 90%** —
no spot is a better or worse deal than another:

| Bet | symbols | p(win) | fair total | pays @ 0.90 | RTP |
|---|---|---|---|---|---|
| Exactly / Your Ticket | 1 | 0.028 | 36.00× | 32.40× | 0.90 |
| Numbers | 10 | 0.278 | 3.60× | 3.24× | 0.90 |
| Column / Dozen | 12 | 0.333 | 3.00× | 2.70× | 0.90 |
| Vowels | 6 | 0.167 | 6.00× | 5.40× | 0.90 |
| Colour / Low-High | 18 | 0.500 | 2.00× | 1.80× | 0.90 |
| Letters | 26 | 0.722 | 1.38× | 1.25× | 0.90 |

Solo *Exactly A* on a 25 chip goes from **23** to **810**.

### Layer 2 — fund the reserve from forfeits

Pools that settle with no winner currently sweep to Treasury. Route them to an
`UnderwriteReserve` instead and the backstop is **self-funding**: money lost by
losers pays the long shots of winners, which is what a pool would have done if
the table were busy.

At a 90% target, forfeits run ≈10% of turnover long-run, so the reserve accretes
in expectation. Seed it once from Treasury to cover early variance.

## The caps are the whole design

Underwriting at fair odds is roughly **EV-neutral before rake** — the risk is
**variance**, not expectation. A single 1000-chip hit on *Exactly* would want
32,400 TIMBS. Hence three ceilings, and a par floor that can never revert:

```
MAX_UNDERWRITE_PAYOUT   1000 TIMBS   // per winning pool
MAX_ROUND_UNDERWRITE    1500 TIMBS   // per table per round, first-settled-first-served
MAX_RESERVE_FRACTION    10%          // of reserve, per pool
PAYOUT_RATIO            90%          // house edge — uniform across every bet type
```

`MAX_ROUND_UNDERWRITE` bounds the seven-pot worst case: one wallet solo on all
seven pots at 25-chip stakes would otherwise draw ~5,670 in a single swept
round. With the round cap, a table can never extract more than 1,500 from the
reserve regardless of how many pots hit.

### Decision record — cap TIMBS, never the multiple

Two alternatives were considered and rejected (2026-07-31):

- **(a) lower the max multiple 35 → 25.** Clips exactly one bet: *Exactly*
  falls to RTP 0.72 while every other spot keeps ~1.0 — the marquee bet becomes
  the worst deal on the board. Breaks the uniformity that makes the felt fair.
- **(b) cap the multiple at 5× (one-seventh of the table's pots).** *Exactly*
  falls to RTP 0.17 and dies. The seven-pot intuition is real but it is a
  *round-exposure* concern, not a per-pot pricing concern — a player's seven
  pots are seven separate stakes, not one bankroll split seven ways.

Both also fail in contested pools, where the multiple is a **relative weight**,
not a payout: two winners splitting a pot receive the same total at weight 35,
25 or 5 — capping it there changes nothing about exposure and only shifts money
from long-shot winners to short-odds winners.

Rule of thumb this design keeps: **odds stay honest at every stake; exposure is
bounded in TIMBS.** A small chip earns its true multiple; a whale's payout is
clipped by the caps; and no bet type is ever quietly priced worse than another.

| chip on *Exactly* | target | after caps |
|---|---|---|
| 5 | 162 | 162 |
| 10 | 324 | 324 |
| 25 | 810 | 810 |
| 50 | 1,620 | 1,000 |
| 100 | 3,240 | 1,000 |
| 1000 | 32,400 | 1,000 → **par only** |

Large solo stakes on long shots are deliberately *not* underwritten
meaningfully. That is the anti-drain property (§9's concern, in a new place)
and it is also the right incentive: **to win big on a long shot you still need
other players in the pool.**

## The incentive trap — do not skip this

If underwriting were generous, a solo pool would become *safer* than a contested
one: guaranteed 90% RTP without sharing. That inverts the social pull the whole
game rests on.

With the top-up, the worked example (25 on *Exactly A*) is monotonic:

- solo → pool pays 25, reserve tops up to **810**
- one opponent joins and loses → pool pays 61, reserve tops up to **810** (same)
- table fills, pot swells past the target → pool pays it all, reserve pays
  **nothing**, and the payout scales unbounded with the crowd

**The acceptance criterion is monotonicity:** for every stake and bet type,
another player joining the table must never reduce any existing player's
payout. Any parameter set that violates it is wrong.

## Accounting and safety

Money now enters a pool from **outside** at settle time, which is new. The
`PoolLedger` invariant must survive it:

- `heldBalance >= totalCredited + Σ tableEscrow` — the reserve must **transfer
  in before crediting**, mirroring `fundSeed`, never crediting against an IOU.
- **Settlement must never revert.** If the reserve cannot cover the capped
  amount, pay what it can, floor at par, and emit the shortfall. A pick that
  cannot settle is far worse than a payout that is smaller than advertised.
- Emit `PoolUnderwritten(tableId, pool, target, paid, reserveAfter)` so the
  stream and the audit trail can show it plainly.
- Reserve is its own contract with a **halt** and no owner withdrawal path
  beyond a guardian drain to Treasury; it holds player-facing money.

## Treasury backstop (operator-approved)

The reserve is **seeded and backstopped by Treasury, within a budget** — the
operator has approved parking TIMBS outside Treasury and pulling from it when
the reserve runs thin, with one hard rule: **nothing is minted.** Cumulative
Treasury support may never exceed what the game has paid Treasury in rake and
sweeps — subsidies are recycled earnings, not inflation (`GAME_ECONOMY.md`,
solvency rule). If the budget is exhausted, the caps bind and payouts floor at
par — settlement never depends on Treasury generosity. Forfeit routing keeps it self-funding in expectation
(~10% of solo turnover accretes, sim-checked over 200k rounds with negligible
drawdown); Treasury absorbs early variance and any cap-shortfall events, via
the same approve/transferFrom pattern as the table seed.

## App impact

- Felt: the **35×** label needs honesty. Show the *actual* projected return for
  the current pool state — the pools panel already computes this — and mark a
  spot as *underwritten* vs *contested*.
- Stream: pools panel gains an underwrite line; the ticker can call it out when
  a solo winner is topped up (good television — it is the moment the house pays).
- Console: reserve balance and per-round underwrite exposure belong on the
  Tables board.

## Sequencing

This is an **accounting change**, so by the house rule it deserves its own
generation rather than riding along with gen-5's adaptive entry (a *timing*
change). Two clean options:

1. **gen-5 = adaptive entry + late loading** (already specced), then
   **gen-6 = underwriting**; or
2. ship **Layer 0 alone inside gen-5** — it is one line and needs no reserve,
   no new contract and no new money — and leave Layers 1–2 for gen-6.

Recommend (2): it removes the worst sentence in the game immediately, at
effectively zero risk, while the reserve design gets the attention it deserves.

## Open questions

1. **Is 90% the right RTP?** It is a conventional slot-ish number and makes the
   reserve accrete. Higher is friendlier for a testnet trying to attract play;
   lower builds the buffer faster.
2. **Should Double-Digit be underwritten at all?** It is round-wide and already
   the rarest outcome (~38% of rounds per the felt); its exposure profile is
   different from a segment pool.
3. **Does underwriting apply when the solo bettor is the table operator?** On a
   two-wallet friends session that is most of the time, and it means the house
   paying itself. Perhaps exclude `seedFunder`/operator wallets.
4. **Forfeits currently fund Treasury.** Diverting them changes protocol
   revenue — is the reserve a Treasury sub-account, or genuinely separate?
