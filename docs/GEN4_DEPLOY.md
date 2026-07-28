# Generation 4 — plan (encore rounds + on-chain Compete gate)

Draft, 2026-07-29. Nothing here is executed. This is the spec to build against;
the build is deliberately **held until after the first friends session** on
gen-3 — two cold wallets are the cheapest audit of the edge cases encore rounds
create, and they are far better found before an immutable deploy than after.

Generation 3 fixed how money is *held* (per-table escrow). Generation 4 changes
how a table *lives*: a table stops being one spin and becomes a chain of rounds
that keep offering themselves while there is a pot worth playing for. This is the
first generation where a table is not born to die at retire.

## Scope — two changes, decided

Held to gen-3's discipline of one accounting change per generation. Encore rounds
IS that change; the Compete gate rides along because it is small, already
half-shipped, and closes a real hole.

1. **Encore rounds** — a table that ends a round holding more than it started
   with re-offers itself for another 40-minute seating instead of retiring.
2. **On-chain Compete gate** — `sit()` requires `GameRegistry.activeTicketOf(msg.sender) != 0`
   and plays that ticket's `string6`. Today the gate is UI-only (a direct
   `sit()` call bypasses it); gen-4 makes it real. `activeTicketOf` is a public
   mapping on the deployed registry (`0xBAb1CBaF0dE094322A49B379d0AC4510D1F78530`),
   so this is a single external read.

**Not in gen-4** (stay on the gen-5 list): rake-as-dial, ticket secrecy,
Ticket-Any, auto-seating. Each is its own change and none is load-bearing yet.

## Decisions (from the round-5 review)

- **Rake ships every settle.** Treasury takes its graduated 2–8% the moment a
  round settles. Protocol revenue is never gambled into an encore, and each
  round's books stay one-round-simple.
- **Only unclaimed pots carry.** The no-winner forfeits — and only those — feed
  the encore. (Table 5: 2.23 rake shipped, 147.86 unclaimed would have carried.)
- **The carry is a metered reserve, not a one-shot seed.** See below — this is
  the anti-drain design and the heart of the generation.

## The drain problem, and the reserve that answers it

**The attack.** In pari-mutuel the sole winner of a contested pool takes
`chips + seed share`. If an encore dumped a large surplus straight in as the
round's seed — say 1000, i.e. ~143 per pool — then being the only winner of one
pool with a single 5-chip stake nets ~143 for 5. Dump the whole reserve into one
round and minimum-stakers strip it. "Bet 5 to drain 1000."

**The fix has two levers, because there are two problems.** "Bet 5 to win 143"
is a *leverage* problem (payout ÷ stake). Piling a huge seed into one round is an
*accessibility* problem (only whales can afford to chase it). Each wants its own
lever; together they let an encore be both big and fair.

### Lever 1 — minimum stake scales with the pot (the primary drain fix)

The direct answer to leverage: **the minimum chip to sit an encore rises with the
seed on offer**, so you cannot chase a fat pot with a trivial stake.

```
seedShare = roundSeed / POOLS                       // what a contested pool draws
minChip   = smallest CHIPS tier >= seedShare / MAX_LEVERAGE   // MAX_LEVERAGE ~ 10
```

- A 100 seed → share ~14.3 → `minChip` 5 (unchanged; ordinary tables feel
  identical).
- A 200 seed → share ~28.6 → `minChip` 5 still (28.6/10 = 2.9).
- A 1000 seed → share ~143 → `minChip` 25 (143/10 = 14.3, rounds to the 25 tier):
  to chase that pot you stake at least 25 a token. You can still *win* the 1000 —
  you simply had to risk real money, so it is fair EV, not free extraction.

This preserves the big-prize draw (the whole point of an encore) while removing
the asymmetry. It is the lever that actually kills "bet 5 to drain 1000."

### Lever 2 — a metered reserve caps the per-round seed (keeps Lever 1 humane)

Left alone, Lever 1 has a failure mode: a table that runs five encores and piles
up 2000 would set a `minChip` so high the friends are priced out — the opposite
problem. Capping the per-round seed keeps the scaled minimum in a reasonable band.

```
reserve[table]                       // unclaimed pots accumulate here
SEED_CAP                             // max seed a single round may draw (e.g. 200)
BASE_SEED = 100                      // the ordinary first-round seed, unchanged
```

- At settle, a round's **unclaimed pots are added to `reserve[table]`** (rake has
  already shipped to Treasury; credited winnings have already left).
- An encore's **seed = `min(reserve, SEED_CAP)`**; only that leaves the reserve,
  the remainder stays. A big reserve **bleeds out over many encores**, never in
  one, and only while nobody keeps winning it back.
- The new round's own unclaimed pots top the reserve back up at settle.
- When the table finally **closes** (an encore offered, fewer than `SEATS_MIN`
  sit by the deadline), the remaining `reserve` sweeps to Treasury in one call.

**Together:** the encore seed is `min(reserve, SEED_CAP)`, and the minimum chip to
sit *that* round scales to it. The cap keeps the seed — and therefore the entry
floor — friendly; the scaled floor keeps even the capped prize un-drainable. Two
knobs, `SEED_CAP` and `MAX_LEVERAGE`, both set once at deploy and both only ever
loosenable in a later generation.

**Two gen-3 mechanics already blunt the attack**, and both stay:

- A pool draws its seed share only with **≥2 wallets** contesting it
  (`SEED_MIN_WALLETS`). A lone 5-chip bettor gets no seed share at all — the
  drain needs a contested pool you happen to be the sole *winner* of.
- Rake shipping each settle means the reserve is unclaimed-pots money only, never
  protocol revenue.

**Why a reserve beats a hard cap-and-sweep.** The gen-3-era idea was "cap the
carry, sweep the excess to Treasury." The reserve keeps that excess *in play* —
it is the same ceiling per round, but the surplus above the ceiling funds future
encores instead of being banked. More second chances per unlucky round, same
per-round safety.

**Two numbers to tune, both deploy-time constants.** `SEED_CAP` (start 200) sets
how rich a single encore can get and therefore how high the entry floor climbs;
`MAX_LEVERAGE` (start ~10) sets how much prize a minimum stake may chase. Both can
only ever be *loosened* in a later generation, never tightened mid-life, so
conservative starts are safe. An optional refinement worth prototyping instead of
the flat `SEED_CAP`: scale the per-round cap with the round's actual chip volume,
so a thin round cannot pull a fat seed at all — more precise, more surface;
default to the flat cap + scaled minimum for gen-4.

## Contract surface

**`SegmentBoard`**
- `Table` gains `uint256 reserve`, per-round stored `seed` and `seedShare`
  (today constants), and a `roundIndex` / `parentTable` link for the chain.
- Settlement splits into **settle** (credit winners, ship rake, add unclaimed to
  reserve) and the terminal **retire** — retire only runs when no encore is
  offered or the encore goes unfilled.
- New `offerEncore(tableId)`: callable once a round is fully locked and its
  reserve `> 0`; burns a fresh seed round in the registry, publishes fresh
  commitments, opens a new 40:00 entry window, moves `min(reserve, SEED_CAP)`
  from reserve to the round seed. Permissionless.
- New `closeIfUnfilled(tableId)`: after an encore's entry closes below
  `SEATS_MIN`, sweeps the remaining reserve to Treasury and marks the table
  retired. Permissionless (the gen-3 cancel pattern).
- `sit()` gains the `activeTicketOf` check and reads the ticket from the registry
  instead of taking a `bytes6` argument.

**`PoolLedger`**
- `carryTable(fromRound, toRound, amount)` — moves escrow between round-scoped
  buckets **inside the vault**; no transfer out, so `balance >= totalCredited +
  totalEscrowed` never bends. This is the gen-3-spirit primitive that makes the
  reserve safe.
- Escrow keying may need to widen from `tableId` to `(tableId, roundIndex)` so a
  new round's stakes never mingle with the prior round's unwithdrawn credit.

**Not changing:** rake curve, weights, seed *share* formula, the entropy module,
`SeedRegistry` (reused again — a fresh one would let a consumed string reseed).

## Player-facing (the felt already anticipates this)

- The "SEED ON OFFER" stat becomes the live reserve draw — an encore literally
  shows a bigger number there, which is the whole draw.
- A retired table already shows the reveal; an *encore-offered* table shows
  "Round over — sit again for the carried pot" with the entry clock restarting.
- **Edge case to verify with the friends session, before building:** a player's
  unwithdrawn credit from round N while round N+1 is live. Gen-3 keeps credit and
  escrow provably separate; the `(tableId, roundIndex)` keying above is what keeps
  that true across an encore. This is exactly the case cold wallets will hit.

## Acceptance tests (when built)

1. **Unclaimed carries, rake does not** — a round with forfeits settles: rake to
   Treasury, unclaimed to reserve, to the wei.
2. **Encore seeds from reserve, capped** — reserve 1000, `SEED_CAP` 200 → encore
   seed exactly 200, reserve 800.
3. **Drain resistance** — in a max-seed encore, `sit()`/`loadTokens` reject a
   chip below the scaled `minChip`, and a sole winner's payout ÷ stake never
   exceeds `MAX_LEVERAGE`; the reserve is never drainable by a trivial stake.
4. **Bleed-out** — repeated encores each draw ≤ `SEED_CAP`; reserve monotonically
   falls unless a round adds fresh unclaimed.
5. **Close sweeps the reserve** — an unfilled encore ships the full remaining
   reserve to Treasury and retires; vault back to exactly backed.
6. **Credit survives an encore** — a winner from round N withdraws in full after
   round N+1 has opened, seated, and settled.
7. **On-chain gate** — `sit()` reverts without an active Compete ticket; a direct
   contract call (bypassing the page) reverts too.
8. **Full regression** — a single-round table with no surplus still retires
   exactly as gen-3 does.

## Migration

`SegmentBoard` + `PoolLedger` redeploy together (interface change). Entropy
redeploys. `SeedRegistry` reused. Production dials unchanged (`2400/3595/295`).
Guardian kept; `retireGuardian()` + renounce still deferred until the arithmetic
has run at parallel scale — an encore-heavy generation is not the one to go
zero-privilege on first.

## Open

- `SEED_CAP` starting value (200 proposed) and `MAX_LEVERAGE` (~10 proposed).
- Flat cap vs volume-scaled cap (flat + scaled minimum proposed for gen-4).
- Whether an encore inherits the parent's dials or can run compressed for testing.
- Whether the scaled `minChip` also applies to the Double-Digit stake (it draws
  no seed share, so leverage there is bounded already — likely leave it at 5).
