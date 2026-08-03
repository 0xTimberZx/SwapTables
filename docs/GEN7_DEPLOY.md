# Generation 7 — the bonus-chip rule

**Deployed 2026-08-03.** Gen-6 (`0x1de9889d…`) is retired; its ledger still pays
withdrawals. What follows is the runbook as written before the deploy, plus a
record of what actually happened at the end.

| contract | address | sourcify |
|---|---|---|
| SegmentBoard | `0xf3FF34488D472b89497Cf31631c77bE85524A65a` | `exact_match` |
| PoolLedger | `0xAA4f4303b747bEa63F9818Bc9C38dAe5aebDe218` | `exact_match` |
| UnderwriteReserve | `0x73b7fBbA866859e241e87e39e2aDC81711902D7A` | `exact_match` |
| CommitRevealEntropy | `0x57A1F889A30178b62Bc39844D73B68d0f8a274d6` | `exact_match` |

**Gen-7's source is `contracts/SegmentBoard.sol` at commit `1d21ba8`** and it has
not moved since. Generation 8 lives in a *separate* file
(`contracts/SegmentBoardVRF.sol`, [`GEN8_VRF.md`](GEN8_VRF.md)) precisely so this
one stays deployable unchanged — `DeploySegmentBoard.s.sol` still builds gen-7,
`DeploySegmentBoardVRF.s.sol` builds gen-8. Check which script you are running.

## Scope — one rule

`placeDoubleDigit` now requires a full six-token load:

```solidity
if (s.chipPack == 0) revert NotLoaded();
```

Until now `place` demanded a load and `placeDoubleDigit` did not, so a wallet
could sit, skip the load entirely, buy the Repeats-a-Digit stake — and with the
jackpot live, buy into a **strike** — while contributing nothing to the six
segment pools. The stake is a bonus chip; it rides a full load.

Covered by `tests/SegmentBoardGen7.t.sol` (4 tests): the unloaded seat is
rejected, the loaded seat is accepted, gen-5's late loader still earns it after
entry closes, and the chip ladder's floor is 5 TIMBS by construction —
`loadTokens` rejects any index off the end, so "all six worth at least 5" needs
no new check.

**La partage (M3) is NOT in this generation.** It was sequenced here in
`GAME_ECONOMY.md`, but it still owes the two-regime solvency re-simulation and
should not ride along on a deploy that is otherwise a one-line rule change.

## The trap: the reserve float does not travel

`DeploySegmentBoard.s.sol` deploys a **fresh PoolLedger, entropy module and
UnderwriteReserve** every generation. That is correct and deliberate for the
ledger and entropy — but the reserve now *holds money*, and gen-6 is the first
generation where that is true. Two consequences nobody hit before:

1. **`setBoard` is one-time** (`BoardAlreadySet`), so the gen-6 reserve
   physically cannot serve gen-7. A new one is required, not optional.
2. **The old float stays behind.** Its only exit that is not a player payout is
   `drainToTreasury()`, guardian-only. Skip it and the gen-6 float is stranded
   in a reserve whose board can no longer draw on it.

Also note the new reserve's solvency counters start at zero, so `fundBudgeted`
reverts on it (`treasurySupport + amount <= treasuryEarned`, and `treasuryEarned`
is 0). Seed the new reserve with a **plain TIMBS transfer** — which is what the
script's own post-deploy note says. `fundBudgeted` becomes usable once the
generation has earned rake.

## Order of operations

Wind gen-6 down **before** deploying, so no table is left half-played against a
board the apps have stopped pointing at.

**1 — drain gen-6**

- Retire or cancel every live table (console: *Arm + lock all six + retire*, or
  *Cancel* for one that never filled). The jackpot strike now fires from the
  manual buttons too, so a hand-settled table pays its Double-Digit winners.
- Tell players to **Withdraw**. The gen-6 ledger keeps paying withdrawals
  forever — retiring the board does not strand credit — but a clean line is
  easier to support.
- `UnderwriteReserve(0xa0f88d85…).drainToTreasury()` from the **guardian**.

**2 — deploy**

```bash
forge script scripts/DeploySegmentBoard.s.sol \
  --rpc-url $ARB_SEPOLIA_RPC --broadcast --verify --verifier sourcify -vvvv
```

`.env` must carry `SEED_REGISTRY_ADDRESS=0x2460C8ed63414F36838542982A5Ab263C9Fcb914`
— the registry is long-lived and reused, so a winning string is never recycled
as a seed. Leaving it unset deploys a fresh registry and silently discards that
guarantee. The five dials carry over from gen-6 unless you change them:
`ENTRY_MAX_SECONDS=2400`, `PLACE_WINDOW_SECONDS=300`, `BETS_CLOSE_SECONDS=120`,
`SIT_QUIET_SECONDS=180`, `SOLO_WAIT_SECONDS=900`.

The script wires `ledger.setBoard`, `reserve.setBoard`, `reserve.approveLedger`
and — if the deployer owns the registry — `seedRegistry.addWriter` itself.

**3 — wire what the script cannot**

| call | from | why |
|---|---|---|
| `TIMBS.setTransferWhitelist(newLedger, true)` | token owner | the ledger custodies and pays; a large payout trips `maxTransferAmount` without it |
| `TIMBS.setTransferWhitelist(newReserve, true)` | token owner | reserve → ledger top-up pulls hit the same cap |
| `TIMBS.approve(newLedger, <seed budget>)` | **seed funder** | `openTable` pulls 100 TIMBS per table |
| plain `TIMBS.transfer(newReserve, <float>)` | Treasury | initial variance cover — **not** `fundBudgeted` |
| `DDJackpot(0x73D3c322…).setBoard(newBoard, true)` | jackpot owner | the jackpot is cross-generation; an untrusted board reverts `BoardNotTrusted` |
| `DDJackpot.setBoard(0x1de9889d…, false)` | jackpot owner | optional — retires gen-6's trust once its tables are all struck |
| `seedRegistry.addWriter(newBoard)` | registry owner | **only if** the script reported it could not; without it the board cannot open tables |

`SegmentCrank` takes the board as an argument and is generation-agnostic — no
wiring, no redeploy.

**4 — the apps**

`config.js` (TimbSwap) and `onchain/addresses.js` (SwapTables) are the sources of
truth; the `ADDR` block in **four** pages must follow: `index.html`, `play.html`,
`live.html` and now `games.html`. `scripts/check-frontend.js` gates exactly this
in CI, so a page left on the retired board fails the build instead of quietly
transacting against the wrong generation.

Feature detection needs nothing new: the pages probe `reserve()` → gen-6+,
`sitQuiet()` → gen-5+, else gen-4. Gen-7 adds no ABI surface, so it reads as
gen-6 to every page — which is correct, because the only change is a revert that
was already possible.

## Verify it took

```bash
cast call $BOARD "reserve()(address)"        # the new reserve, not gen-6's
cast call $LEDGER "board()(address)"         # the new board
cast call $REGISTRY "isWriter(address)(bool)" $BOARD
cast call $JACKPOT "trustedBoard(address)(bool)" $BOARD
```

Then open a table, seat two wallets, and confirm the rule: a seated-but-unloaded
wallet calling `placeDoubleDigit` reverts `NotLoaded()`.

## What actually happened

Clean run. The script deployed all four and made all four wiring calls itself
(`ledger.setBoard`, `reserve.setBoard`, `reserve.approveLedger`,
`seedRegistry.addWriter`), so only the token whitelists, the seed approval and
`DDJackpot.setBoard(newBoard, true)` were left to do by hand.

**The reserve trap did not bite** — gen-6's reserve read zero before the switch,
so nothing was stranded by the per-generation redeploy. The new reserve was
seeded with 2,500 TIMBS by plain transfer, which is what makes M1 top-ups work
from the first table instead of waiting for dead pots to accumulate. Its
guardian is the deployer (`0x42536623…`), so `drainToTreasury` is available when
gen-8 replaces it — check that before the next deploy rather than after.

Two snags worth carrying forward:

- **`--verify` resolves the `[etherscan]` block even under `--verifier sourcify`,**
  so the first run died on a missing `ARBISCAN_API_KEY` *after* broadcasting
  successfully. The contracts were fine; only verification failed. Any non-empty
  value satisfies the interpolation, and sourcify ignores it.
- **Verification is easiest per-contract, after the fact.**
  `forge verify-contract <addr> <path>:<name> --chain-id 421614 --verifier
  sourcify --verifier-url https://sourcify.dev/server --guess-constructor-args
  --rpc-url $ARB_SEPOLIA_RPC --watch` needs no hand-encoded arguments — it reads
  them off the creation transaction, which matters for the board's thirteen.
  `forge script --resume` also works but requires `--broadcast` alongside it.

Compiler settings come from `foundry.toml` automatically, which is why all four
landed as `exact_match` rather than a partial metadata match.
