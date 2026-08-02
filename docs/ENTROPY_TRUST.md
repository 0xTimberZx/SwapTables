# Entropy and dealer trust — the opener's selection edge

Notes, 2026-08-02. **Nothing built.** Recorded from a live-code read of
`SegmentBoard.sol` and `CommitRevealEntropy.sol`, not from the spec. Operator's
call: keep as notes for now, with VRF as the likely single fix.

## The hole

The wallet that opens a table picks the six secrets and publishes only their
commitments. Once it arms and one block passes, `blockhash(lockBlock)` is
public — and from that moment the opener can compute **both** outcomes for
every unlocked segment:

| path | derivation | who can trigger it |
|---|---|---|
| reveal | `keccak(secret, blockhash, salt)` | the opener (only it holds the secret) |
| fallback, after 64 blocks | `keccak(blockhash, salt)` — **no secret** | anyone |

Both are deterministic and both are knowable to the opener in advance. It
picks between them by acting or not acting. Nothing stops it.

And `rearmTable` — permissionless, available once the lock block ages past
`BLOCKHASH_HORIZON` (256 blocks, ~51 min) — re-rolls every remaining segment
onto a fresh blockhash. Unlimited re-draws at 51 minutes each.

## Size of it

A two-way pick per segment turns a bet of probability `p` into `1 − (1−p)²`:

| bet | honest | with the pick |
|---|---|---|
| Colour / Low-High (p = 0.5) | 50% | **75%** |
| Column / Dozen (p = 0.333) | 33% | **56%** |
| Exactly (p = 0.028) | 2.8% | **5.5%** |

Re-arms compound it. This is not a rounding error.

## What is still sound

The draw is genuinely unpredictable **at bet time**. Bets close before
arming and the lock block does not exist yet, so nobody — the opener
included — can bet into a known outcome. Guard #1 in the spec holds. The
exploit is **selection after the fact**, not a rigged draw, and it is
available only to the wallet holding the secrets.

## Finding: the designed bond was never built

`CommitRevealEntropy`'s own docstring says of the fallback path:

> *"the board slashes the protocol's bond in that path"*

There is no bond. `grep -n "bond\|slash" contracts/SegmentBoard.sol` returns
nothing. The economic disincentive this design assumed does not exist, which
is why the fallback branch is currently free to take.

## Options considered

1. **Void the opener's own bets on any branch it takes.** If a segment
   settles `viaFallback`, or a re-arm happens, refund the opener's bets in
   the affected pools rather than settling them. Surgical — removes all
   profit from both levers, leaves honest operators untouched, needs no bond
   and no new money. Contained to `_applyLock` and `rearmTable`, but needs
   care where a voided bet leaves the pot the other players are splitting.
2. **Opener may not bet at its own table.** One line; `opener` is already
   stored as of gen-7. **Sybil-weak** — open with wallet A, bet with wallet
   B, still holding the secrets. Stops casual self-dealing and states the
   house rule; it is not a wall, and should not be sold as one.
3. **Publish the fallback count.** `SegmentLocked` already carries
   `viaFallback`. Surface it in the stream ticker, table history and a
   per-dealer tally in M5. Prevents nothing, but a pattern becomes
   impossible to hide, and stalling already costs 13 minutes of dead air on
   camera.
4. **VRF.** Removes the secret, so there is no branch and nothing to choose.
   Re-arm becomes unnecessary. **Chosen direction.**

## VRF notes — what it actually takes

The spec calls the entropy module swappable (§10.6) and it is, for
*synchronous* sources. Two things to know before treating VRF as a drop-in:

- **The seam is synchronous.** Every `IEntropy` method is `view`:
  `deriveEntropy(commitment, secret, lockBlock, salt)` and
  `fallbackEntropy(lockBlock, salt)` both return a word inline. VRF is
  request/callback. So VRF cannot hide behind the current interface — the
  board needs a pending state between "armed" and "lockable", which makes it
  a **board generation**, not just an entropy redeploy. Budget for that.
- **A single word spoils the drumroll.** Derive all six chars from one
  fulfilled word (`keccak(word, salt_i)`) and the entire result is public the
  moment the callback lands — anyone in chat can compute all six before the
  reveals play out. To keep genuine per-segment suspense the board would
  request **one word per segment**, staggered, at roughly 6× the VRF cost.
  Worth it: the staggered reveal is the show.
- Coordinator address, key hash and subscription for Arbitrum Sepolia must be
  read from Chainlink's docs at build time — do not carry them from memory.
  Funding is LINK on a subscription the board is a consumer of.

## Current standing

Living with it, knowingly, on a testnet playing for play chips among people
who know each other. The operator is the opener on essentially every table,
so the exploit is available and unexercised by choice rather than by
construction. That is an acceptable posture for now and an unacceptable one
the moment the game carries value — the note exists so the decision is
deliberate rather than forgotten.
