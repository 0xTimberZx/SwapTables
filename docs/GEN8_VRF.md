# Generation 8 — VRF entropy, and the end of the opener's edge

Built and compiling, tested, **not deployed**. Lives in
`contracts/SegmentBoardVRF.sol` + `contracts/VRFEntropy.sol`, alongside — not on
top of — gen-7, so both stay deployable.

## What this fixes

[`ENTROPY_TRUST.md`](ENTROPY_TRUST.md) records the hole: the wallet that opened a
table held the six secrets, and once armed it could compute **both** outcomes for
every unlocked segment — the reveal (`keccak(secret, blockhash, salt)`) and the
64-block fallback (`keccak(blockhash, salt)`, no secret) — then choose between
them by acting or not acting. Colour goes 50% → **75%**; Exactly 2.8% → 5.5%; and
`rearmTable` re-rolled everything left at 51-minute intervals, without limit.

Gen-8 does not police that lever. **It removes the thing the lever was attached
to.** There is no secret, so there is no second derivation, so there is nothing
to pick between. Selection edge: zero, by construction rather than by rule.

## How a round runs now

| gen 1–7 | gen 8 |
|---|---|
| `openTable(round, commitments[6])` | `openTable(round)` — nothing to commit to |
| `armTable(id)` once, records a lock block | `armSegment(id, seg)` — one VRF request per segment |
| `lockSegment(id, seg, secret)` — opener only | `lockSegment(id, seg)` — **anyone**, no argument |
| `lockSegmentFallback` after 64 blocks | *(gone — that was the second path)* |
| `rearmTable` after 256 blocks | `rearmSegment(id, seg)` — replaces an **unfulfilled** draw only |

The char is `keccak(vrfWord, salt) % 36` where `salt = keccak(tableId, segment)`.
Anyone watching can recompute it from the public fulfilment, so a locked char is
checkable without trusting the board.

### Why one request per segment, not one per round

A fulfilled word is public the instant the callback lands. Six words requested
together would publish the whole round at once — anyone in chat could compute
all six chars before the reveals played out, and the staggered drumroll is the
show. Arming segment by segment means each char becomes knowable only when its
own draw returns, and at that instant locking is permissionless, so nobody is
ever holding a result the room cannot see.

Cost: **six VRF requests per round** instead of one. On Arbitrum Sepolia the
LINK is free from Chainlink's faucet, so this is a request-volume question, not a
price one — tens of requests a session.

### The stall escape, and why it is not a new hole

If a draw never comes back (subscription dry, coordinator trouble), anyone may
call `rearmSegment` after the module's `REREQUEST_DELAY` (30 minutes) to fire a
fresh one. That is **not** a second outcome path:

- an unfulfilled request has no knowable value, so replacing it is a choice
  between two unknowables — no choice at all;
- a **fulfilled** draw can never be replaced. `VRFEntropy` reverts
  `AlreadyFulfilled`, and `ready` is one-way. Not the opener, not the guardian,
  not the owner can reroll a landed result;
- if a replaced request lands late, the callback sees `ready` and returns
  without writing. First word in wins, and it was unpredictable to everyone.

## Shape of the code

**`VRFEntropy.sol`** (~4.0 KiB) — a Chainlink VRF v2.5 consumer keyed by the
board's own `salt`, so the board never learns a request id to act on. The
callback writes two slots and emits; it does **not** settle. A reverting callback
would burn the request and strand the segment, so the board pulls the word in its
own transaction once the draw has landed.

The coordinator interface is declared locally rather than pulled in as a
dependency, matching how every other external contract is reached in this repo.
The `RandomWordsRequest` struct's **field order is part of the ABI** and must
match `VRFV2PlusClient.RandomWordsRequest`.

`extraArgs` is supplied **whole**, as a constructor argument, and never
reconstructed in source. It is `_argsToBytes(ExtraArgsV1({nativePayment: …}))`
with a Chainlink-defined tag; guessing that tag would produce requests the
coordinator silently rejects. Same reasoning for the coordinator address, key
hash and subscription id — network facts, read off Chainlink's published tables
at deploy time.

**`SegmentBoardVRF.sol`** (~17.4 KiB, comfortably under the 24 KiB limit) —
gen-7's board with the entropy region replaced. Everything downstream of the
seam is the same code: seats, loads, bets, the pari-mutuel settle, the gen-6
monotonic underwrite, the retire waterfall, gen-6 dealer tips, and gen-7's
bonus-chip rule.

Table struct: `lockBlock` becomes `armedAt` (same slot, same type — non-zero
still means "armed", so the apps' `t.lockBlock !== 0` check keeps working), and
`armedMask` is **appended** after `opener`, following the gen-5/6 pattern of
growing `tables()` only at the tail so older decoders stay safe. `tables()` is
now a 16-tuple.

`SegmentLocked` carries `requestId` where gens 1–7 carried `viaFallback`: there
is no fallback to flag, and naming the draw makes every char auditable back to a
specific fulfilment. `segmentState(id, seg)` gives the apps armed / locked /
draw-in / lockable / replaceable in one call.

### The duplication, stated plainly

`SegmentBoardVRF.sol` is a copy of `SegmentBoard.sol` with one region rewritten.
That is a real maintenance cost and it is deliberate: gen-7 is ready to deploy
and refactoring it into an abstract base *right before* its deploy would put
risk on the wrong contract, while editing it in place would have broken the
gen-5/6/7 suites that guard the deployed generations. **Once gen-8 is live and
gen-7 retired, delete `SegmentBoard.sol` and rename** — do not let both drift.

## Tests

`tests/SegmentBoardVRF.t.sol`, with a mock coordinator that hands out ascending
request ids and fulfils on command. Aimed at the property gen-8 exists to buy:

- locking is permissionless and argument-free, and the char equals
  `keccak(word, salt) % 36` — the arithmetic any viewer can repeat;
- **no second path**: a segment cannot be locked before its draw lands, and no
  amount of waiting opens one (gens 1–7 opened a fallback at 64 blocks);
- a fulfilled draw can never be replaced, even hours later;
- a stale fulfilment cannot overwrite the draw that already decided the segment;
- a stuck draw is recoverable, and `segmentState` shows the apps it is stuck;
- one request per segment, six per round;
- arming is once per segment, not before the pick time, and needs two funded
  seats;
- a full round settles and the ledger drains to zero; a winning Exactly bet
  still pays; gen-7's bonus-chip rule is carried; cancel still works.

## Deploy

`scripts/DeploySegmentBoardVRF.s.sol`. Read [`GEN7_DEPLOY.md`](GEN7_DEPLOY.md)
first — **every trap there applies here too**, in particular that the script
mints a fresh `UnderwriteReserve` whose `setBoard` is one-time, so the old float
must be `drainToTreasury()`'d out before it is stranded, and the new one seeded
by plain transfer rather than `fundBudgeted`.

Two steps unique to gen-8, and the round cannot run without either:

1. **Add `VRFEntropy` as a consumer** on the VRF subscription at vrf.chain.link.
   Until then every `armSegment` reverts.
2. **Fund the subscription with LINK.** Six requests per round.

`.env` additions: `VRF_COORDINATOR`, `VRF_KEY_HASH`, `VRF_SUB_ID`,
`VRF_EXTRA_ARGS`, optionally `VRF_CONFIRMATIONS` (3) and `VRF_CALLBACK_GAS`
(200,000). All of the first four are network facts — read them at deploy time.

### Apps

Gen-8 is the first generation whose *ABI* changes the operator flow, so the
console and watch pages need real work, not just an address bump:

- `openTable` loses its commitments argument, so the passphrase/secrets machinery
  in the console has nothing left to do — delete it rather than leave it dark.
- Auto-pilot changes shape: instead of `armTable` then six `lockSegment(secret)`
  calls, it becomes, per segment, `armSegment` → poll `segmentState` → `lockSegment`,
  with `rearmSegment` when `replaceable` turns true. The reveal-gap dial now
  spaces the **arms**, since that is what paces the drumroll.
- `SegmentCrank`'s `lockAll` takes secrets and will not work against gen-8. Either
  a new crank or per-segment calls; per-segment is honest here anyway, because
  batching six locks into one transaction would collapse the drumroll the
  per-segment design exists to protect.
- Feature detection: probe `armedMask`-bearing `tables()` (16 words) or simply
  `segmentState(uint256,uint8)`, which no earlier generation has.

## What is still not fixed

Proposer influence is gone (that was the point of choosing VRF over the cheaper
per-segment blockhash scheme in `ENTROPY_TRUST.md`). What remains is ordinary
oracle trust: Chainlink's committee, and the subscription owner's ability to
stop funding it — which stalls a table rather than steering it, and
`rearmSegment` plus a refilled subscription recovers from that. That is a
materially better posture than "the operator can pick the outcome and we are
choosing not to".
