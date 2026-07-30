# Fast-dials generation — deploy runbook

Drafted 2026-07-30, after the first two stream sessions (Twitch + Kick). Status:
**EXECUTED 2026-07-30** — deployed to Arbitrum Sepolia (5,108,201 gas, ~0.0001 ETH):

| Contract | Address |
|---|---|
| `SegmentBoard` | `0x57d5BE0203Fa30f7b99853a11e4D162824895F91` |
| `PoolLedger` | `0x863e37FF91cbd745CBcb063266Bf0631Ce2546b5` |
| `CommitRevealEntropy` | `0xe926797b2FC03E2936092D3de2B4c7ADE2e4A5Fd` |

`setBoard` and `addWriter` ran in-script. Step-3 wiring complete same day:
ledger whitelisted on TIMBS and 2000 TIMBS seed budget approved from the
funder. The board is fully playable; step-5 smoke test is next.

## Why

Gen-3's dials (entry 40:00 · bets close 55:00 · pick 59:55) size a round at
~60 minutes. Live on stream that read as dead air: with everyone seated and
loaded inside minutes, the table still sat waiting out clocks tuned for
strangers wandering in. This deploy changes **only the three timing dials** —
zero Solidity changes, same audited code — and cuts a round to ~25 minutes.

The *adaptive* design (entry that closes early once 2+ wallets are loaded and
the table goes quiet, per-sit timer resets) needs new contract logic. It is on
the gen-5 list in `GEN4_DEPLOY.md`; this deploy is the interim fix.

**Naming.** `GEN4_DEPLOY.md` is an unexecuted *plan* (encore rounds + Compete
gate). If this dials deploy goes first it will occupy the "generation 4" slot
on chain and encore becomes gen-5 — or keep calling this "gen 3.5"
informally. Operator's call; the chain doesn't care.

## Chosen dials

| Dial | gen-3 | **this deploy** | aggressive alt |
|---|---|---|---|
| `ENTRY_WINDOW_SECONDS` (sit + load) | 2400 (40m) | **900 (15m)** | 600 (10m) |
| `BETS_CLOSE_SECONDS` (lead before pick) | 295 | **300 (5m)** | 300 |
| `PICK_DELAY_SECONDS` (open → pick) | 3595 | **1500 (25m)** | 1200 (20m) |

Timeline with the chosen set: **entry closes 15:00 · bets close 20:00 · pick
25:00**, then the staggered reveals (~90s with the console auto-pilot at 15s
spacing). Full round ≈ 27 minutes.

All sets satisfy the constructor's `BadDials` guard
(`pickDelay > betsCloseLead` and `entryWindow ≤ pickDelay − betsCloseLead`) —
verified against the deployed source. Remember bets can be placed from the
moment a player is loaded, all the way to bets-close; the "betting-only" window
after entry is 5 minutes.

## What redeploys, what does not

Redeployed (immutable per generation): **SegmentBoard, PoolLedger,
CommitRevealEntropy.**

Reused — do NOT redeploy:
- **SeedRegistry** `0x2460C8ed63414F36838542982A5Ab263C9Fcb914` (cross-generation
  never-reuse of seeds; pass as `SEED_REGISTRY_ADDRESS`)
- **SegmentCrank** `0x09B8bC3eD49491DA2AaC47ad6DDC9A0cB6B2783D` (stateless,
  generation-agnostic — takes the board address per call)
- TIMBSToken, TimbPrize, TimbTreasury, Compete/GameRegistry — untouched.

## Step 1 — close out gen-3 (before deploying)

1. Console → Tables board: **retire or cancel every live table** on gen-3.
2. Have every player **Withdraw** their credit from the gen-3 ledger.
   (Credits live per-ledger; the old ledger keeps paying withdrawals forever,
   but don't leave friends' balances behind on a board the apps no longer show.)

## Step 2 — deploy (from the TimbSwap Foundry repo)

`.env` (never commit):

```bash
DEPLOYER_PRIVATE_KEY=...            # same deployer as gen-3 (owns SeedRegistry → addWriter auto-wires)
ARB_SEPOLIA_RPC=https://sepolia-rollup.arbitrum.io/rpc
TIMBS_ADDRESS=0x2Aaa61E2c08Ff61c93E960EcCd5Dd7fedF0bfaAa
TIMB_PRIZE_ADDRESS=0x35976f4D2260127848a6274D2eC89ee054412432
TREASURY_ADDRESS=0xd3F40042aFA8074EA68C9f61dE6aDADD539F0D5c
SEED_FUNDER_ADDRESS=0x42536623b503D4926DfAF6173B0357b7DfD19800   # ops EOA — must be able to approve()
SEED_REGISTRY_ADDRESS=0x2460C8ed63414F36838542982A5Ab263C9Fcb914  # REUSE — never redeploy
GUARDIAN_ADDRESS=0x42536623b503D4926DfAF6173B0357b7DfD19800   # halt-only guardian — same as gen-3
ENTRY_WINDOW_SECONDS=900
PICK_DELAY_SECONDS=1500
BETS_CLOSE_SECONDS=300
```

```bash
forge script scripts/DeploySegmentBoard.s.sol \
  --rpc-url $ARB_SEPOLIA_RPC --broadcast --verify --verifier sourcify -vvvv
```

The script deploys ledger + entropy + board, calls `ledger.setBoard(board)`
(one-time, irreversible) and — because the deployer owns the registry —
`seedRegistry.addWriter(board)`. If it prints `ACTION REQUIRED` for the
registry, the board cannot open tables until the registry owner adds it.

## Step 3 — wire (two transactions)

1. From the TIMBS owner: `TIMBS.setTransferWhitelist(<new PoolLedger>, true)`
   — the **ledger** pays out, so it is what would trip `maxTransferAmount`.
2. From the **seed funder** (`0x4253…9800`):
   `TIMBS.approve(<new PoolLedger>, <seed budget>)` — each `openTable` pulls
   100 TIMBS. Approve e.g. 2000 for twenty tables.

Gen-0 died because the funder couldn't approve — keep funder ≠ treasury.

## Step 4 — record addresses (hand the three new addresses back)

Paste the printed `SegmentBoard / PoolLedger / CommitRevealEntropy` addresses
back into the session and the following get updated in one commit:

- `TimbSwap/config.js` — single source of truth
- `SwapTables/onchain/addresses.js` — new generation block; gen-3 moves to
  `RETIRED` with a note ("superseded for dial speed; escrow accounting sound")
- `SwapTables/app/{index,play,live}.html` — the `ADDR` blocks (board + ledger
  only; crank/timbs/prize unchanged)
- `SwapTables/onchain/abi/` — no change (same build)

Side effects that need no action: the stream registry and presence keys are
scoped by board address, so the new generation starts with a clean broadcast
slate, and the director/console pick up the new board on deploy of the app
update. Old gen-3 rows just go quiet.

## Step 5 — smoke test before streaming

One full round with two wallets: open → both sit + load (watch entry close at
15:00) → place → bets close 20:00 → auto-pilot arms at 25:00 → six staggered
reveals → retire → both withdraw. Check
`PoolLedger.heldBalance == totalCredited + Σ tableEscrow` at the end (the gen-3
invariant), and that the stream page cut over, showed the drumroll, and fell
back to the lobby.
