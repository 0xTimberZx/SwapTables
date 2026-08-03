# Reserve solvency — M3, dead-pot stake-back, and what the sim actually found

2026-08-03. The two-regime re-simulation `GAME_ECONOMY.md` says M3 and dead-pot
stake-back owe before either can be recommended. Model is
[`tools/reserve-sim.js`](tools/reserve-sim.js) — reproducible, deterministic
seed, 4,000 tables per regime, dials overridable by env (`FT`, `FR`, `PC`, `RC`).

The settle path is read out of the **deployed** contracts, not the design doc:
`_settlePool` → `_weigh` → `_underwrite` → `grantTopUp` → `retire` →
`recordIncome`. One locked character decides every bet in a pool, as `_wins`
does on chain — that correlation is what makes dead pots cluster, and resolving
bets independently would have flattered every mechanism under test.

## Answers

| mechanism | verdict |
|---|---|
| **M3 la partage, overflow-funded** | **Yes.** Costs the reserve nothing, measurably. |
| **M3 la partage, off the top** | **No.** Takes from the regime that already cannot pay. |
| **Dead-pot stake-back** | **No.** Switches M1 off. |

### M3, overflow-funded — free

Paying the half-back **out of the overflow earmark** (money already above
`floatTarget`) leaves top-ups, coverage, minimum float and the reserve's
trajectory *bit-identical* to base in both regimes. It is not "cheap"; it is
zero-cost by construction, because the earmark is defined as the money the
reserve does not need.

| loser-heavy | top-ups/rnd | covered | min float | back to players/rnd |
|---|---|---|---|---|
| gen-6 as deployed | 311.1 | 62.3% | 2,495 | 0 |
| + M3 overflow-funded | 311.1 | 62.3% | 2,495 | **330.9** |

And in winner-heavy it pays **nothing at all** — there is no overflow in a hot
streak — which is the behaviour you want: bankroll preservation fires in cold
streaks, when players are losing, and stays silent when they are winning. This
is what `GAME_ECONOMY.md`'s farm-resistance table already specified ("only from
waterfall overflow — an empty reserve pays no half-backs"). The **prose** of the
M3 section describes the off-the-top version instead. The prose is the wrong one.

### M3, off the top — no

Halving every contested dead pot before it reaches the reserve cuts the
reserve's primary income:

| covered | winner-heavy | loser-heavy |
|---|---|---|
| gen-6 as deployed | 54.0% | 62.3% |
| M3 off the top | **31.8%** | 57.8% |

Winner-heavy loses a *third* of its underwrite coverage, and 90% of rounds that
ask for a top-up get less than they asked for. Dead pots are scarce in exactly
the regime where the reserve is already short, so taking half of them is taking
from the wrong pocket.

### Dead-pot stake-back — no

Returning every stake from a no-winner pool removes the reserve's activity-matched
income outright. Coverage collapses to **9.6% / 4.0%**, the float bottoms at 53,
and 96–98% of rounds are short. M1 stops functioning in both regimes — the
promise that a long shot is real at every table size becomes a promise the
reserve cannot keep. It is also a farm surface: a pool that dies would cost its
bettors nothing, so betting into a pool you expect to die becomes free.

## The bigger finding: the reserve is structurally short in winner-heavy

This is worth more than either mechanism above.

| winner-heavy | per round |
|---|---|
| top-ups **wanted** by M1 | 288.5 |
| reserve **income** (dead pots + half the rake) | 154.7 |
| top-ups actually **granted** | 155.7 |

Granted tracks income almost exactly. That is not a coincidence — it is the
equilibrium: the float buffer drains, then the 10%-of-free-float cap throttles
grants down to whatever is coming in. **M1 keeps its promise a little over half
the time**, and no dial changes that:

| float target | fraction cap | pool/round caps | winner-heavy covered |
|---|---|---|---|
| 4,500 | 10% | 1,000 / 1,500 | 54.0% |
| 20,000 | 50% | 1,000 / 1,500 | 55.4% |
| 20,000 | 100% | unbounded | **55.4%** |

Infinite money, no caps, same answer. Winner-heavy is **income-bound**, not
cap-bound. Fixing it needs one of: a larger rake share to the reserve (currently
half), a lower `PAYOUT_RATIO_BPS` (currently 0.90), or budgeted Treasury support
via `fundBudgeted` — which works today and is bounded by the solvency rule.

## The cheap win: `floatTarget` is too low — and it is a setter

Loser-heavy tells the opposite story. There the money is abundant (1.48M parked
to overflow across 4,000 tables) yet coverage is only 62.3% — because the
waterfall pins free float at `floatTarget`, so the 10% cap limits any single
grant to ~450 TIMBS.

| floatTarget | covered | rounds paid short | overflow left over |
|---|---|---|---|
| 4,500 (current) | 62.3% | 44% | 1,481,115 |
| 10,000 | **91.3%** | 23% | 905,156 |
| 20,000 | 94.1% | 7% | 853,251 |

`setFloatTarget` is an owner call on the **live** reserve — no redeploy, no
generation. Raising it to 10,000 buys +29 points of coverage and still leaves
plenty of overflow.

**But note the competition.** With la partage drawing on the earmark, at
`floatTarget` 10,000 the half-backs consume the *entire* overflow (226/round
paid, 0 left). La partage and the Rolling Jackpot spend the same pot.
`GAME_ECONOMY.md`'s waterfall already says overflow splits half/half between
them — that split has to be enforced, not assumed, or M3 quietly starves M2.

## Recommended order

1. **`setFloatTarget(10_000e18)` on the live reserve.** One call, no deploy,
   +29 points of loser-heavy coverage. Serves a promise M1 has already made.
2. **Watch the winner-heavy shortfall.** It is real but it degrades gracefully —
   nobody is owed money they do not get, they simply get less top-up than the
   target. Address it with `fundBudgeted` from earned revenue before touching
   `PAYOUT_RATIO_BPS`, which is immutable per generation.
3. **M3 only as overflow-funded, and only with the 50/50 jackpot split wired.**
   It is free, it fires when players need it, and it needs `overflowEarmark` to
   become spendable — today the earmark is a counter with no spend path, so M3
   is a reserve change, not a board change.
4. **Dead-pot stake-back: closed.** Not affordable in any regime tested.

## Caveats, stated

The bet mix inside each regime is a stylised choice, not measured play — there
is not enough live history to fit one. Table sizes (4–12 seats), chips (5–100)
and the DD participation rate (50%) are likewise assumptions. What the sim
establishes is the **direction and rough magnitude** of each mechanism's effect
on reserve solvency, and the two findings that are dial-invariant — the
winner-heavy income shortfall and the `floatTarget` ceiling — are robust across
every parameter setting tried.
