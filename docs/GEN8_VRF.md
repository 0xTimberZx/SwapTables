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

**Chainlink prerequisites** (vrf.chain.link, Arbitrum Sepolia). Subscription
created and read off the subscription page:

```bash
export VRF_COORDINATOR=0x5CE8D5A2BC84beb22a398CCA51996F7930313D61
export VRF_KEY_HASH=0x1770bdc7eec7771f7ba4ffd640f34260d7f095b79c92d34a5b2551d6f6cfd2be
export VRF_SUB_ID=50316020964400506132465447965056776521389361135399962393916048632548676126967
```

The subscription id is a `uint256` in v2.5 (v2 used a small `uint64`) — pass it
as the decimal string above; `vm.envUint` takes it whole. The coordinator
checksums clean, the key hash is a full 32 bytes, and the id is comfortably
under 2²⁵⁶ (`0x6f3ddbd0…ccc8f7`). All three were checked before use, because a
malformed one here surfaces as a revert inside `requestRandomWords` at arm time
rather than at deploy.

**LINK: funded, 50.** Far more than a testing run needs — a round is six
requests on the 50 gwei lane with a 200k callback. What is *not* done here is
adding `VRFEntropy` as a consumer, and that is an ordering constraint rather
than an oversight: the module has to exist before it can be named, so the
consumer add belongs to phase 3. Until it lands, every `armSegment` reverts
inside the coordinator regardless of the balance.

The constructor args were encoded and round-tripped against these values before
deploy (9 words; `extraArgs` at offset `0xc0`, length `0x24` — a 4-byte tag plus
one abi-encoded bool). Cheap to check, and it is the last point at which a typo
in `.env` is free.

**Who owns the subscription.** The subscription owner adds and removes
consumers and withdraws the LINK; it is not a contract role, so
`scripts/check-roles.js` cannot see it and a rotation audit will read clean with
this still on a retired key. It must be the same wallet the rotation moved to.

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

**The two VRF dials.**

```bash
export VRF_CONFIRMATIONS=3
export VRF_CALLBACK_GAS=200000
```

*Confirmations = 3*, the coordinator's minimum. Confirmations exist so the
requester cannot see the seed and then reorg the request away. Arbitrum is an L2
with a single sequencer and no short-depth reorgs, so depth beyond the minimum
buys nothing and costs latency on every segment — and latency here is the
drumroll. Blocks are ~250ms, so three is well under a second.

*Callback gas = 200,000.* `rawFulfillRandomWords` is deliberately tiny — it
writes two slots and emits, and settlement is elsewhere precisely so the
callback cannot revert. Counting it out: two cold SLOADs for `saltOf[requestId]`
and `draws[salt].ready` (2,100 each), a cold zero→nonzero SSTORE for `d.word`
(22,100), a warm SSTORE for `d.ready` into the already-nonzero packed slot
(2,900), and a 3-topic LOG (1,500). Call it ~33k with the odds and ends. 200,000
is six times that.

The headroom is free: v2.5 bills on gas *used* plus the coordinator's overhead
and premium, not on the limit, and Arbitrum Sepolia's ceiling is 2,500,000. What
it buys is cover for Arbitrum's L1-data gas accounting and for the callback
growing later. Under-setting this is the expensive mistake — an out-of-gas
callback consumes the request and strands the segment until `rerequest` clears
it 30 minutes on.

Both are `setPolicy`-tunable after deploy, so neither is a one-way door.

**Board dials.** Carry gen-7's over unless you want a change:
`2400 / 300 / 120 / 180 / 900`. The reveal-gap dial is a *console* setting, not a
constructor arg, and phase 4 is where you learn what it should be.

### Phase 1 — wind gen-7 down

Every command below is literal. Nothing in angle brackets, nothing to substitute
except values the chain hands you — because on the gen-7 deploy, three separate
failures were pasted placeholders and unexported variables, and one was `cast`
silently falling back to `localhost:8545`. Export the RPC once and confirm it:

```bash
export ARB_SEPOLIA_RPC=https://sepolia-rollup.arbitrum.io/rpc
cast chain-id --rpc-url $ARB_SEPOLIA_RPC          # must print 421614
```

Find what is still live, and close it:

```bash
cast call 0xf3FF34488D472b89497Cf31631c77bE85524A65a "nextTableId()(uint256)" \
  --rpc-url $ARB_SEPOLIA_RPC
```

Walk the ids below that and retire or cancel anything not already retired. A
table whose six segments are locked closes with `retire(uint256)`; one that never
filled closes with `cancelTable(uint256)`.

Then drain the float — **this is the step that costs real money if skipped**:

```bash
# balance before (expect 2500e18)
cast call 0x2Aaa61E2c08Ff61c93E960EcCd5Dd7fedF0bfaAa \
  "balanceOf(address)(uint256)" 0x73b7fBbA866859e241e87e39e2aDC81711902D7A \
  --rpc-url $ARB_SEPOLIA_RPC

# drain — must be signed by the reserve's guardian
cast send 0x73b7fBbA866859e241e87e39e2aDC81711902D7A "drainToTreasury()" \
  --rpc-url $ARB_SEPOLIA_RPC --private-key $DEPLOYER_PRIVATE_KEY

# balance after (expect 0)
cast call 0x2Aaa61E2c08Ff61c93E960EcCd5Dd7fedF0bfaAa \
  "balanceOf(address)(uint256)" 0x73b7fBbA866859e241e87e39e2aDC81711902D7A \
  --rpc-url $ARB_SEPOLIA_RPC
```

Gen-7 is the first generation whose reserve actually holds a float, so unlike the
gen-6 → gen-7 switch this one genuinely strands money if skipped. Confirm the
guardian first if there is any doubt — `node scripts/check-roles.js` prints it.

Players withdraw at leisure; the gen-7 ledger keeps paying forever.

### Phase 2 — deploy

`.env` in full. Everything except the last three lines is already known:

```bash
# ── network facts, settled in phase 0 ──
VRF_COORDINATOR=0x5CE8D5A2BC84beb22a398CCA51996F7930313D61
VRF_KEY_HASH=0x1770bdc7eec7771f7ba4ffd640f34260d7f095b79c92d34a5b2551d6f6cfd2be
VRF_SUB_ID=50316020964400506132465447965056776521389361135399962393916048632548676126967
VRF_EXTRA_ARGS=0x92fd13380000000000000000000000000000000000000000000000000000000000000000
VRF_CONFIRMATIONS=3
VRF_CALLBACK_GAS=200000

# ── long-lived, never redeployed ──
SEED_REGISTRY_ADDRESS=0x2460C8ed63414F36838542982A5Ab263C9Fcb914
TIMBS_ADDRESS=0x2Aaa61E2c08Ff61c93E960EcCd5Dd7fedF0bfaAa
TIMB_PRIZE_ADDRESS=0x35976f4D2260127848a6274D2eC89ee054412432
TREASURY_ADDRESS=0xd3F40042aFA8074EA68C9f61dE6aDADD539F0D5c

# ── board dials, carried from gen-7 ──
ENTRY_MAX_SECONDS=2400
PLACE_WINDOW_SECONDS=300
BETS_CLOSE_SECONDS=120
SIT_QUIET_SECONDS=180
SOLO_WAIT_SECONDS=900

# ── the three that depend on the rotated wallet — fill these in yourself ──
DEPLOYER_PRIVATE_KEY=
GUARDIAN_ADDRESS=
SEED_FUNDER_ADDRESS=
```

**Set `SEED_FUNDER_ADDRESS` explicitly** to whichever wallet will hold the TIMBS
seed budget — normally the deployer. Leaving it blank defaults it to
`TREASURY_ADDRESS`, and that exact default is what made gen-7's first `openTable`
revert `ERC20InsufficientAllowance`: the approve had been signed by the deployer
while the board was pulling from Treasury. The script now prints the resolved
seed funder and shouts if it is not the deployer, but setting it is better than
being warned.

**Set `GUARDIAN_ADDRESS`** too. Blank means guardian `address(0)`, which leaves
nobody able to halt the reserve *or* `drainToTreasury()` it when gen-9 arrives —
you would be building the exact stranding that phase 1 exists to undo. Fixable
after the fact with `setGuardian`, but only while ownership is unrenounced.

```bash
forge script scripts/DeploySegmentBoardVRF.s.sol \
  --rpc-url $ARB_SEPOLIA_RPC --broadcast -vvvv
```

Leave `--verify` off and verify afterwards per contract — that is what worked
for gen-7, and it keeps a verification failure from looking like a deploy
failure.

`.env` needs all six VRF values from phase 0 — `VRF_COORDINATOR`,
`VRF_KEY_HASH`, `VRF_SUB_ID`, `VRF_EXTRA_ARGS`, `VRF_CONFIRMATIONS`,
`VRF_CALLBACK_GAS` — plus the usual `SEED_REGISTRY_ADDRESS=0x2460C8ed…` (the
registry is long-lived; leaving it unset silently discards the no-reused-seed
guarantee). Put them in `.env` and let `forge` read the file; do not paste keys
or values inline on the command line.

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
