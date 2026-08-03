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

## Deploy — order of operations

Read [`GEN7_DEPLOY.md`](GEN7_DEPLOY.md) alongside this: **every trap there
applies**, and its "what actually happened" section is the record of which ones
bit. What follows is only the sequence, with gen-8's own additions called out.

### Phase 0 — before anything moves

**Rotate the deployer key first.** As of the gen-7 deploy the deployer holds
owner on the board, ledger, reserve, jackpot and registry, plus guardian on the
reserve. Deploying gen-8 from a key you are about to retire means doing the
whole rotation twice. Rotate, then deploy gen-8 from the new wallet, and it owns
everything from birth.

**Chainlink prerequisites** (vrf.chain.link, Arbitrum Sepolia):

| what | why |
|---|---|
| a VRF v2.5 **subscription** | the board's draws bill to it |
| **LINK** in it | six requests per round; testnet LINK is free from the faucet |
| the **coordinator address** | constructor arg |
| a **key hash** (gas lane) | constructor arg |

Coordinator and key hash are network facts — read them off Chainlink's
supported-networks table at deploy time. Do not carry them from an older
runbook.

**`VRF_EXTRA_ARGS`.** The v2.5 request carries an `extraArgs` blob selecting LINK
vs native payment. **Verified against Chainlink's own source** — `VRFV2PlusClient.sol`
from `@chainlink/contracts` on npm, which is reachable even where docs.chain.link
is not:

```solidity
bytes4 public constant EXTRA_ARGS_V1_TAG = bytes4(keccak256("VRF ExtraArgsV1"));
function _argsToBytes(ExtraArgsV1 memory a) internal pure returns (bytes memory) {
  return abi.encodeWithSelector(EXTRA_ARGS_V1_TAG, a);
}
```

so the tag is `0x92fd1338` and the blob is that followed by the abi-encoded bool:

```
LINK payment    0x92fd13380000000000000000000000000000000000000000000000000000000000000000
native payment  0x92fd13380000000000000000000000000000000000000000000000000000000000000001
```

Use the **LINK** one unless you deliberately want native billing.

The same read confirmed the two things `VRFEntropy.sol` declares by hand rather
than importing. `RandomWordsRequest` is
`(bytes32 keyHash, uint256 subId, uint16 requestConfirmations, uint32 callbackGasLimit,
uint32 numWords, bytes extraArgs)` — field-for-field what the module declares, and
that order is part of the ABI — and the coordinator's entry point is
`requestRandomWords(RandomWordsRequest calldata) external returns (uint256)`.
A mismatch in either would have made every request revert; both match.

Coordinator address and key hash are the only values still to be read at deploy
time. They are deployment data, not source, so they are not in the npm package
and must come off Chainlink's supported-networks table.

**Dials.** Carry gen-7's over unless you want a change:
`2400 / 300 / 120 / 180 / 900`. The reveal-gap dial is a *console* setting, not a
constructor arg, and phase 4 is where you learn what it should be.

### Phase 1 — wind gen-7 down

- Retire or cancel every live table.
- `UnderwriteReserve(0x73b7fBbA…).drainToTreasury()` from the **guardian**. Gen-7
  is the first generation whose reserve actually holds a float (2,500 TIMBS), so
  unlike the gen-6 → gen-7 switch this one genuinely strands money if skipped.
- Players withdraw at leisure; the gen-7 ledger keeps paying forever.

### Phase 2 — deploy

```bash
forge script scripts/DeploySegmentBoardVRF.s.sol \
  --rpc-url $ARB_SEPOLIA_RPC --broadcast -vvvv
```

Leave `--verify` off and verify afterwards per contract — that is what worked
for gen-7, and it keeps a verification failure from looking like a deploy
failure. `.env` needs the four VRF values plus the usual
`SEED_REGISTRY_ADDRESS=0x2460C8ed…` (the registry is long-lived; leaving it
unset silently discards the no-reused-seed guarantee).

The script deploys PoolLedger, VRFEntropy, UnderwriteReserve and
SegmentBoardVRF, and wires `ledger.setBoard`, `reserve.setBoard`,
`reserve.approveLedger`, `entropy.setBoard` and — if the deployer owns it —
`seedRegistry.addWriter`. **`entropy.setBoard` is new and load-bearing**: without
it every `armSegment` reverts `NotBoard`.

Then verify:

```bash
forge verify-contract <addr> <path>:<name> --chain-id 421614 \
  --verifier sourcify --verifier-url https://sourcify.dev/server \
  --guess-constructor-args --rpc-url $ARB_SEPOLIA_RPC --watch
```

### Phase 3 — wire what the script cannot

| call | from | notes |
|---|---|---|
| **add `VRFEntropy` as a consumer** | subscription owner, at vrf.chain.link | **gen-8 only** — until this, every arm reverts |
| **fund the subscription** | anyone | **gen-8 only** — six requests a round |
| `TIMBS.setTransferWhitelist(newLedger, true)` | token owner | large payouts trip `maxTransferAmount` without it |
| `TIMBS.setTransferWhitelist(newReserve, true)` | token owner | reserve → ledger pulls hit the same cap |
| `TIMBS.approve(newLedger, budget)` | **seed funder** | `openTable` pulls 100 per table; check `seedFunder()` is the wallet you think |
| plain `TIMBS.transfer(newReserve, …)` | Treasury | the drained gen-7 float — **not** `fundBudgeted`, which reverts while `treasuryEarned` is 0 |
| `DDJackpot.setBoard(newBoard, true)` | jackpot owner | an untrusted board reverts `BoardNotTrusted` |

### Phase 4 — prove the draw works, before anyone is watching

This phase has no gen-7 equivalent and it is the one that matters. Open a table,
seat and fund two wallets, then arm **one** segment and watch it through:

```bash
cast send $B "armSegment(uint256,uint8)" $ID 1 --rpc-url $ARB_SEPOLIA_RPC --private-key $KEY
cast call $B "segmentState(uint256,uint8)(bool,bool,bool,bool,bool)" $ID 1 --rpc-url $ARB_SEPOLIA_RPC
```

What each failure tells you:

| symptom | cause |
|---|---|
| `armSegment` reverts `NotBoard` | `entropy.setBoard` never ran |
| `armSegment` reverts inside the coordinator | wrong `extraArgs`, wrong key hash, or the consumer was never added |
| arm succeeds, `drawIn` never turns true | subscription out of LINK, or callback gas too low |
| `drawIn` true, `lockSegment` reverts | should not happen — report it |

**Time the gap between the arm landing and `drawIn` turning true.** That latency
is new in gen-8 and it sets the console's reveal spacing: the dial paces the
*arms*, so the real beat is `gap + fulfilment latency`. Measure it before
choosing a number, and expect a round to take longer end-to-end than gen-7's.

Then finish the round — six arms, six locks, retire — and confirm the ledger
drains to zero. Only after that is it worth putting on stream.

### Phase 5 — addresses and docs

`config.js` (TimbSwap) and `onchain/addresses.js` (SwapTables), then the `ADDR`
block in **four** pages. `scripts/check-frontend.js` gates the agreement, so a
page left on gen-7 fails CI rather than quietly transacting against it. Move
gen-7 into `RETIRED` and add gen-8 to `SPECS.md`.

**The app code is already done** (shipped 2026-08-03): all four pages detect
gen-8 by probing `segmentState`, the console hides the passphrase and the
fallback-lock, `Arm` fires one draw for the next segment, `Reveal all six` locks
whatever has come back rather than going through `SegmentCrank`, and auto-pilot
runs arm → wait → lock with one segment in flight. Only the addresses change.

### Phase 6 — collapse the duplication

Once gen-8 is live and gen-7 retired: delete `contracts/SegmentBoard.sol`, rename
`SegmentBoardVRF.sol` to `SegmentBoard.sol`, and retire the gen-5/6/7 suites that
only exist to guard the commit-reveal board. Doing it before gen-8 is proven
would leave nothing to fall back to; leaving it undone indefinitely is how two
boards drift apart.

## What is still not fixed

Proposer influence is gone (that was the point of choosing VRF over the cheaper
per-segment blockhash scheme in `ENTROPY_TRUST.md`). What remains is ordinary
oracle trust: Chainlink's committee, and the subscription owner's ability to
stop funding it — which stalls a table rather than steering it, and
`rearmSegment` plus a refilled subscription recovers from that. That is a
materially better posture than "the operator can pick the outcome and we are
choosing not to".
