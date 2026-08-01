# M2 — the Rolling Double-Digit Jackpot

2026-07-31. **Status: IMPLEMENTED** — `DDJackpot.sol` + `DDJackpot.t.sol` +
`DeployDDJackpot.s.sol` on TimbSwap; app support shipped behind
`ADDR.jackpot` (hidden until the address is set). Forge run + deploy pending.
Companion to `GAME_ECONOMY.md` (M2) — the "play and play" engine.

## Shape

**Deploy once, never per generation** (the SeedRegistry pattern). The jackpot
needs no hook inside the board: a Double-Digit hit is fully legible from the
board's public views (`ddSettled`, `hasRepeat(lockedChars)`, the DD pool's
`betCount`/`betAt`), so `strike(board, tableId)` is a permissionless
read-verify-pay. On each new generation the owner calls
`setBoard(newBoard, true)` / `setBoard(oldBoard, false)` — the same writer
dance the SeedRegistry does.

## The rules

1. **The banner only climbs until somebody takes it.** Funding is `donate`
   (budgeted Treasury/ops drops — recycled earnings only, per the solvency
   rule) or plain transfers; until a later reserve generation can release its
   overflow earmark directly, the earmark's value routes here by hand.
2. **Metered slice, never the whole pot**: each strike pays
   `sliceBps` (20%) of the balance, floored at `sliceFloor` (50 TIMBS),
   clamped to the balance. Owner-tunable, slice hard-capped at 50% so one
   strike can never gut the banner. The gen-4 encore anti-drain meter, reused.
3. **Your chip is your ceiling** (operator decision, 2026-07-31): a winner's
   share of the slice is capped at **`stakeCapMult` × their own DD chip**
   (default 10×), and the uncollected remainder stays on the banner. Two
   5-chips on a 1,000 banner draw 50 each — not the 200 slice a 1,000-chip
   table would. Small chips cannot drain what big chips built; wanting more
   of the jackpot means staking more under it.
4. **§9 everywhere**: the slice pays only when **2+ distinct wallets** bet
   Double-Digit at that table. A lone wallet grinding empty tables gets
   nothing, ever.
5. **Once per table, forever** (`struck[board][tableId]`).
6. **Winners are every DD bettor**, paid pro-rata by DD stake, pushed straight
   to their wallets — no withdraw step, the hit lands in the wallet as the
   drumroll ends.
7. **Custody**: guardian may halt strikes and drain to Treasury, nothing
   else; owner tunes the meter and the trusted-board set, and is renounceable.

## App

- Felt + console: gold `JACKPOT <balance>` pill; console shows the banner
  under the vault card.
- Stream: `JACKPOT` row in the pools panel, and a `JackpotStruck` ticker
  moment ("STRUCK — 200 TIMBS to the Double-Digit winners · 800 still on the
  banner").
- Auto-pilot: after the sixth lock it checks `strikeable()` and fires the
  strike before retiring — the sixth reveal makes it true, auto-pilot makes
  it paid. `strike` stays permissionless for everyone else.

## Deploy

`DeployDDJackpot.s.sol` (env: `BOARD_ADDRESS` = current generation). Then:
1. `TIMBS.setTransferWhitelist(jackpot, true)` — it pushes slices to wallets.
2. Fund it (transfer or `donate`).
3. Record the address in `onchain/addresses.js` + the pages' `ADDR.jackpot`.
