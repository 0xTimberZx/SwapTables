# Generation 2 — deploy plan

Draft. Nothing here has been executed. Generation 1 (`0x25D4…F13D`) settled three
tables correctly and every number reconciled to the wei — this is not a bug fix.
It exists because gen-1 predates two recovery paths, and both are now known to be
needed rather than theoretical.

## Why redeploy

The board is immutable by design (§13), so recovery paths can only arrive with a
new generation. Two are missing, and each has already cost something:

| Missing on gen-1 | Cost already incurred |
|---|---|
| `rearmTable` | Table 3's reveal was lost to a page reload. It survived only because the real horizon is ~51 minutes, not the ~65s we had documented. With no re-arm, a slower recovery would have stranded 345 TIMBS. |
| `cancelTable` | An empty table opened 2026-07-27 stranded its 100-TIMBS seed. Recoverable only via the ledger owner's `ownerWithdraw`, which works solely because nothing was credited. A table with live chips in the same state has no exit. |

Also landing, already on `main` and already exercised in tests:

- `seedFunder` split from `treasury` — gen-1 has this; gen-2 keeps it.
- `setSeedFunder` — rotate the ops wallet without a redeploy.
- `commitmentsFor` — derive commitments bound to the right table id on-chain.
- The corrected `BLOCKHASH_HORIZON` documentation (L1 blocks, ~51 min).

## What is *not* changing

- **`SeedRegistry` is reused.** It is the one long-lived contract; redeploying it
  would let a winning string seed a second table, breaking the §10.1 uniqueness
  guarantee. Pass the existing address as `SEED_REGISTRY_ADDRESS`.
- **Dials stay at 40 / 45 / 5 minutes** unless deliberately changed.
- **No mechanic changes.** Rake, weights, seed share and settlement are untouched —
  they have three live runs of evidence behind them and should not move in the same
  deploy as new recovery paths.

## Addresses to carry over

| | |
|---|---|
| `SeedRegistry` (reuse, do **not** redeploy) | `0x2460C8ed63414F36838542982A5Ab263C9Fcb914` |
| `TimbPrize` | `0x35976f4D2260127848a6274D2eC89ee054412432` |
| `TIMBSToken` | `0x2Aaa61E2c08Ff61c93E960EcCd5Dd7fedF0bfaAa` |
| `TimbTreasury` (sweep target) | `0xd3F40042aFA8074EA68C9f61dE6aDADD539F0D5c` |

`PoolLedger`, `CommitRevealEntropy` and `SegmentBoard` are all redeployed.

## Deploy

`scripts/DeploySegmentBoard.s.sol` already does this. Environment:

```
DEPLOYER_PRIVATE_KEY=…
TIMBS_ADDRESS=0x2Aaa61E2c08Ff61c93E960EcCd5Dd7fedF0bfaAa
TIMB_PRIZE_ADDRESS=0x35976f4D2260127848a6274D2eC89ee054412432
TREASURY_ADDRESS=0xd3F40042aFA8074EA68C9f61dE6aDADD539F0D5c
SEED_FUNDER_ADDRESS=<ops EOA — must be able to call approve()>
SEED_REGISTRY_ADDRESS=0x2460C8ed63414F36838542982A5Ab263C9Fcb914
GUARDIAN_ADDRESS=<or omit for none>
```

**`SEED_FUNDER_ADDRESS` must not be the treasury contract.** The seed is *pulled*
via `transferFrom`, so its source has to be able to `approve`. TimbTreasury cannot,
and `treasury` is immutable — that is exactly what retired generation 0 unused
(discovery #1). The script defaults `seedFunder` to `treasury`, so leaving it unset
reproduces the bug.

## Post-deploy wiring — all four required before play

1. `TIMBS.setTransferWhitelist(newPoolLedger, true)` — the **ledger** pays out, so it
   is what would otherwise trip `maxTransferAmount`. Not the board.
2. From `seedFunder`: `TIMBS.approve(newPoolLedger, <budget>)` — `openTable` pulls
   100 TIMBS per table.
3. `newPoolLedger.setBoard(newSegmentBoard)` — **one-time and irreversible**
   (discovery #4). Getting this wrong means redeploying the ledger.
4. `SeedRegistry.addWriter(newSegmentBoard)` — from the registry owner, or
   `openTable` reverts `NotWriter`. The deploy script does this automatically only
   when the deployer is the registry owner; otherwise it prints an ACTION REQUIRED.

Then update `SwapTables/onchain/addresses.js` (move gen-1 to `RETIRED`) and the two
console copies, which have gen-1's addresses **inlined**:
`SwapTables/app/index.html` and `TimbSwap/tables/index.html`.

## Retiring generation 1

Gen-1 is not broken and holds no funds once table 4 is retired. Leave it reachable
until the console points at gen-2 and one full gen-2 round has settled — then mark
it `RETIRED` in `addresses.js`. Do not reuse its `PoolLedger`: `setBoard` is already
burned.

## Acceptance tests before gen-2 is trusted

Two of these are the entire point of the deploy:

1. **Full round**, two wallets, complementary bets — should reproduce the table 3/4
   arithmetic exactly. Regression check that nothing moved.
2. **`cancelTable`** — open a table, seat nobody (or one wallet), let entry close,
   cancel. Every chip refunded and the seed returned. *Never tested live.*
3. **`rearmTable`** — arm, let the lock block age past 256 L1 blocks (~51 min), then
   re-arm and settle the remaining segments. *Never tested live, and the reason this
   generation exists.*
4. **Fallback** — already proven on gen-1 (table 4); re-confirm on the new board.

Test 3 takes about an hour of waiting. Use 5-TIMBS chips.

## Open questions

- **Guardian:** gen-1 runs with one. Keep for gen-2, or deploy zero-privilege now?
  It is halt-only and retirable, so keeping it costs nothing but the trust surface.
- **Dials:** the 40 / 45 / 5 window means ~45 minutes from open to pick. Table 4
  showed that is comfortable for two wallets but slow to iterate on. Worth a shorter
  set for a test-only generation?
- **VRF (§10.6):** still Phase 2. The entropy module is swappable behind the same
  interface, so this deploy does not foreclose it — and the pre-VRF path stays as the
  covert fallback either way.
