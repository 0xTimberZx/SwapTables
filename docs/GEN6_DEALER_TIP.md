# Gen-6 — tip the dealer

Draft, 2026-07-31. **Spec for review; nothing built.** Operator's ask, verbatim:
*"The one who opens the board can get tipped by ppl who sat as well, by the end
of the game, after the locks."* Companion to `UNDERWRITE_SPEC.md` (M1) and
`GAME_ECONOMY.md` (M2–M5) — this is **M6**, and like them it is an accounting
change, so it rides the gen-6 generation.

## The idea

The wallet that opens a table is the dealer: it commits the six secrets, runs
(or auto-pilots) the staggered reveals, and usually puts the round on stream.
That is real work, and roulette already has the etiquette for it — **toking the
dealer** after a good run. Gen-6 makes it one click: after the sixth lock, any
seated wallet can send part of its credit to the opener.

## Rules

1. **Only after the locks.** Tips unlock at `lockedMask == 0x3F` — never
   before. This is an integrity rule, not just pacing: while any segment is
   unrevealed, a transfer to the dealer could read as paying to influence a
   reveal. After 6/6 the outcome is sealed on chain, so a tip can only ever be
   gratitude. (Tips stay open after retire — the table struct and seats
   persist, so a player who withdraws next morning can still tip.)
2. **Only from wallets that sat at that table.** Keeps it a table ritual
   between the people who shared the round, and gives the button an obvious
   home on the felt.
3. **Tips come from credit.** `tipDealer(tableId, amount)` moves `amount` from
   the tipper's ledger credit to the opener's ledger credit. No new approval,
   no token transfer, one wallet click — and it ties tips to winnings, which
   is the moment people actually feel generous.
4. **Zero rake, zero minimum, zero cap.** It is the player's own money moving
   between two credit balances; the house takes nothing and sets no price.

## Contract shape

- `Table` gains `address opener;`, written in `openTable` — an **appended**
  field, same decode-safe trailing-word pattern as gen-5's four (the deployed
  generation-agnostic crank keeps working, and the apps' feature-detect
  handles the wider `tables()` exactly as they did for gen-5).
- New call, in full:

```solidity
function tipDealer(uint256 tableId, uint256 amount) external {
    Table storage t = _tables[tableId];
    if (t.openedAt == 0) revert TableUnknown();
    if (t.lockedMask != 0x3F) revert SegmentsOutstanding();  // after the locks
    if (!seats[tableId][msg.sender].seated) revert NotSeated();
    ledger.moveCredit(msg.sender, t.opener, amount);          // reverts if credit < amount
    emit DealerTipped(tableId, msg.sender, t.opener, amount);
}
```

- `PoolLedger.moveCredit(from, to, amount)` is the only new ledger surface:
  debit one credit balance, credit another, board-only caller. `heldBalance`
  and `totalCredited` are both unchanged by it, so the escrow-sacred invariant
  (`held >= credited + Σ tableEscrow`) is untouched by construction.

## Why it cannot be farmed

Nothing here is a subsidy, so §9 does not apply: a tip is a voluntary transfer
of the tipper's own withdrawable money, house takes and adds nothing. A wallet
tipping itself (dealer seated at its own table) is a no-op. The only guard
worth having is rule 1, and that is about optics of the reveal, not money.

## App impact

- **Felt / play page**: after the sixth lock (and on the settled view), seated
  wallets get a "Tip the dealer" row — a couple of preset chips (5 / 10 / 25)
  plus free amount, greyed until credit > 0.
- **Stream**: `DealerTipped` goes straight to the ticker — *"♥·4b7 tipped the
  dealer 25"* — and a round-end tip is a natural outro beat for the drumroll.
- **Console**: the opener's tally per table ("tips received: 40") on the
  Tables board; lifetime tips fold into the M5 status layer naturally
  ("top-tipped dealer this week").

## Decision record (operator, 2026-07-31)

1. **Credit-only, no fresh-TIMBS path.** A wallet with no credit cannot tip
   this round; a generous loser tips next round. One click, one code path.
2. **Presets are percentages, paid in chips.** The felt offers **5%** and
   **10%** of the tipper's payout for this table, converted to chip units of
   minimum value 5 and **rounded down**:
   `tip = floor(pct × payout / 5) × 5`. If that floors to zero (payout under
   100 at 5%), the preset greys out — no dust tips. This is a **felt rule
   only**: `tipDealer` itself accepts any amount up to the tipper's credit,
   so the contract stays one line of policy-free accounting and the presets
   can be retuned without a redeploy.
3. **The dealer gets a tag.** The opener shows on stream with the same
   suit-tag identity as players (♠·9dE style) — tips have a visible
   recipient, the ticker line reads person-to-person, and the tag is the
   dealer's identity for M5 ("top-tipped dealer this week").
