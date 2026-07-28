# Play style — the player-facing table

2026-07-28. Two design artifacts define the new play experience:

1. **"The Segment Board"** — the felt: load-then-place flow, approval-gated
   placements, live masked bet feed, winning-string reveal.
2. **"Spin Meter Tuner"** — the §10.2 velocity envelope, coefficients keyed to
   player count (busy reels settle early and calm, thin reels rattle to the wire).

Both are now implemented in **`app/play.html`** (served mirror:
`TimbSwap/tables/play.html`), wired to the live generation-3 contracts. The
console (`index.html`) is unchanged and stays the operator's tool — open, lock,
retire, cancel, re-arm all live there. The play page is for sitting down.

## What shipped, and what it maps to on chain

| Artifact concept | On chain |
|---|---|
| Phase 1 "load all six" | one `loadTokens(tableId, chipIdxs[6])` transaction, gated to the entry window |
| Phase 2 "approve & place" | the wallet transaction **is** the approval — `place(tableId, seg, kind, pick)`, final once mined |
| Double-Digit tall spot | `placeDoubleDigit(tableId, chipIdx)` — its own chip, one per wallet, round-wide |
| Live table feed | `BetPlaced` events polled per table; identity masked to a suit + short tag |
| Reveal | `tables(id).lockedChars` as segments lock; repeat highlighting; pool figures from `PoolSettled` |
| Spin meter | §10.2 envelope `v(τ)=v_run·R·G·(1+rattle)`, n = live `seatCount`; τ runs bets-close → pick; each reel drops onto its locked char |
| "Kept" tokens | unplaced chips come back as **ledger credit at retire** (dislodge), withdrawable from the page |

The spin meter is **display-only**, exactly as §10.1 guard #2 requires: the
animation never touches the outcome, and the page says so on its face.

## Where the page corrects the artifact to contract truth

These are not omissions — the mock said one thing, the deployed board does
another, and a live page must not lie:

- **Rake.** Mock: "0% for now". Contract: graduated — 8% uncontested, →1.75%
  floor, 4.87% at two wallets. The page states the real curve.
- **Pocket colours.** Mock used roulette's red set. Contract's `RED_MASK`
  alternates from A (bit i set ⇒ red). The felt now colours from the mask —
  red/black bets read off the real 18/18 split.
- **Double-Digit odds.** Mock: fixed 1.8:1. Contract: pari-mutuel like every
  pool. The page shows "≈38% of rounds" as information, not a payout promise.
- **Seating.** Mock: auto-grouped 4 to a table. Contract: free seating, 2–12.
- **Bet kinds.** Mock omitted Letters / Numbers / Low / High — all four are
  contract-legal and heavily used in live validation, so the felt gained a row.
- **Ticket.** Mock gated on an active Compete ticket. Contract: `sit()` takes
  any six characters. The page takes any ticket and says what it powers
  (Your-Ticket spots).

## Generation-4 proposals (from the artifacts, not buildable on gen-3)

Logged here so they survive; each is a contract change and none is urgent:

1. **Compete-ticket gating** — `sit()` requiring a live Compete entry
   (`ITimbPrize` lookup) instead of free-form bytes6. The artifact's "Requires
   an active ticket" strip is the intended end state.
2. **Auto-grouped seating** — the artifact's "players auto-grouped, N to a
   table" implies the protocol assigns seats across parallel tables. Gen-3's
   parallel escrow makes this *possible*; a router/matchmaker contract would
   make it *real*.
3. **Rake as a live dial** — the artifact treats rake as "the house-edge dial
   you turn up later". On chain the curve is immutable per generation. If we
   want a tunable rake, gen-4 needs it as a bounded, owner-settable parameter
   (with a hard cap so the dial can't rug).
4. **Chip-per-spot restaking** — mock let any token stake the Double-Digit;
   contract keeps DD as its own stake. Decide whether the DD-from-token model
   is worth the accounting change. Current view: no — separate stake is cleaner
   and already validated live.

## Spin-meter coefficients (§10.2)

`play.html` ships the tuner's defaults, which reproduce the spec table:

```
vrunMin 0.55  vrunMax 1.20   tsLate 0.40  tsEarly 0.39
residMax 0.120  residMin 0.145  kMin 12.0  kMax 16.0
tau0 0.05  gamma 1.28  rattleBeta 0.31  rattleZeta 3.5
rattleOmega 10.0  tauR 0.72  swapNoise 0.21
p(n) = ln(n−2) / ln(HARD−2),  HARD = 12,  n = 2 floors at the n = 3 envelope
```

Re-tune in the Spin Meter Tuner artifact, then paste the new constants into
`SPIN_D` in both `play.html` copies — they are display constants, deployable
any time without touching a contract.
