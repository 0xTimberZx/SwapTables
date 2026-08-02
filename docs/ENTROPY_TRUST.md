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

1. **Forfeit — never refund — the opener's bets in a pool it chose.**
   First drafted as a *refund* and that was backwards: refunding turns every
   losing bet into a push, so the opener would stall on every bad reveal.
   Take the opener holding a bet where reveal loses and fallback wins:

   | variant | reveal | stall to fallback | opener's best move |
   |---|---|---|---|
   | today | loses chip | **wins pot** | always stall — the hole |
   | refund the chosen pool | loses chip | **chip back** | still always stall |
   | **forfeit** the chosen pool | loses chip | loses chip | **indifferent — lever dead** |

   So the chip stays in the pot and simply cannot win; it flows to the other
   winners or dies to the reserve. Both branches now lose for the opener,
   which is what makes the lever worthless, and an operator who just reveals
   is never touched. Built and compiling once (mark bit per pool set on
   fallback and on re-arm, zeroed weight in `_weigh`) then reverted —
   operator chose to wait for a single structural fix instead of layering
   rules. Recoverable from this description.
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

## A cheaper structural fix worth weighing first

**Drop the secret entirely and arm each segment separately.**

`char_s = keccak(blockhash(lockBlock_s), salt_s)` — no commitment, no reveal,
therefore **no branch to choose**. Each segment gets its own arm block, so:

- nobody can predict a char before that segment's own block is mined, which
  is what preserves the staggered drumroll — better than VRF does, since one
  VRF word makes all six public at callback;
- whoever arms cannot see the hash of the block they are arming into, so arm
  timing grants nothing;
- once mined, **anyone** can lock it, and the auto-pilot would immediately —
  so the only lever left, stalling to re-arm after 256 blocks, needs every
  other participant to cooperate in not locking;
- costs nothing. No oracle, no LINK, no subscription.

The honest caveat: blockhash randomness is influenceable in principle by a
block proposer willing to withhold a block. Irrelevant for play chips among
friends; **not** acceptable once the game carries real value. So this is the
cheap fix that removes the *operator's* edge today, and VRF remains the
endgame that removes the *proposer's* edge when there is money to defend.

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

### Cost

On **Arbitrum Sepolia the LINK is free** — Chainlink's faucet drips testnet
LINK on request, so running VRF here costs nothing but setup. The figure that
matters is therefore *request volume*, not price:

| shape | requests per round | what it costs the show |
|---|---|---|
| one word, six chars derived | 1 | all six public at callback — the drumroll is spoilable |
| one request per segment | 6 | suspense preserved; ~6x the requests |

At six requests a round and a handful of tables a night, that is tens of
requests per session — trivial against a faucet drip on testnet.

Per-request pricing (callback gas x gas price, plus the v2.5 premium and flat
fee) was **not verified** while writing this: docs.chain.link returned 403 to
the fetcher. Read it off Chainlink's supported-networks and billing pages at
build time. It only becomes a real number on mainnet, where it is also the
point at which the proposer-influence argument above stops being theoretical.

## Current standing

Living with it, knowingly, on a testnet playing for play chips among people
who know each other. The operator is the opener on essentially every table,
so the exploit is available and unexercised by choice rather than by
construction. That is an acceptable posture for now and an unacceptable one
the moment the game carries value — the note exists so the decision is
deliberate rather than forgotten.
