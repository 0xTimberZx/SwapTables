# Generation 2 — deploy plan

**Executed 2026-07-27.** Generation 1 (`0x25D4…F13D`) settled three tables correctly
and every number reconciled to the wei — this was not a bug fix. It exists because
gen-1 predates two recovery paths, and both are now known to be needed rather than
theoretical.

## Deployed

| Contract | Address |
|---|---|
| `SegmentBoard` | `0xAfC3a78a4F906C5CEb806d0d580d9175B2105924` |
| `PoolLedger` | `0x65ABf55FD57a34c527B07Bd6D90d91D2FbDa220f` |
| `CommitRevealEntropy` | `0x3ddD099953409D5104CF5081E18DB88Cc842a2c2` |
| `SeedRegistry` | `0x2460C8ed63414F36838542982A5Ab263C9Fcb914` — reused, **not** redeployed |

Dials `240 / 360 / 30` (entry 04:00, bets close 05:30, pick 06:00). Guardian set.
Total cost 0.000104947752504 ETH.

Wiring: `setBoard` and `addWriter` both ran inside the deploy script — the deployer
owns the registry, so step 4 did not need doing by hand. **Steps 1 and 2 remain
manual** and must be done before play:

- `TIMBS.setTransferWhitelist(0x65ABf55F…220f, true)`
- from `seedFunder`: `TIMBS.approve(0x65ABf55F…220f, <budget>)`

**Acceptance complete.** `cancelTable` ran on table 1, `rearmTable` on table 6 — the
two paths this generation exists to prove. Both recorded in `VALIDATION.md`. Every
settle and recovery path in the system has now executed on chain.

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
- **Dials are changing — see below.** The gen-1 values do not match §10.3.
- **No mechanic changes.** Rake, weights, seed share and settlement are untouched —
  they have three live runs of evidence behind them and should not move in the same
  deploy as new recovery paths.

One contract change does land, and it is a deployment guard rather than a mechanic:
the constructor now rejects dial sets that cannot work (`BadDials`). The dials are
immutable and were previously unvalidated, so `betsCloseLead >= pickDelay` would have
bricked betting on a whole generation with no recovery. Gen-2 is the first deploy to
use non-default dials, so it is the first real chance to fat-finger them. Gen-1's
values remain legal.

## Dials — the gen-1 values do not match §10.3

§10.3's marks are measured **from the end** of a ~60-minute segment window. Gen-1
measures `pickDelay` from the *start*, at 45 minutes, which squashes the 20-minute
tail into 5 and lands two marks on the same instant:

```
DEPLOYED 40 / 45 / 5            §10.3 in a 60-min window
  entry closes   40:00            entry closes   40:00
  bets close     40:00  <- same   bets close     55:00
  pick / arm     45:00            1-min mark     59:00
                                  pick / arm     59:55
```

**This is discovery #5.** It was logged as "entry and bets close at the same instant",
a quirk of the contract. It is not — it is the arithmetic of `betsCloseLead` counting
back from a `pickTime` that arrives 15 minutes too early. The contract does exactly
what §10.3 asks; the dials do not.

It matters because §10.3 gives the two marks different jobs. After 40:00 **no new
players** — the field is fixed and the spin envelope committed. But seated players
should keep betting for another 15 minutes while swaps push the meter, until the last
5. Under gen-1 that phase has zero duration, so the swap-jitter window (§10.2) has
never actually existed on chain.

### Production values

```
ENTRY_WINDOW_SECONDS = 2400   # entry closes 40:00
PICK_DELAY_SECONDS   = 3595   # pick / arm    59:55
BETS_CLOSE_SECONDS   = 295    # bets close    55:00
```

`3595 = 59:55`, so the pick lands ~5s before the hour. `295` puts bets-close at
`59:55 - 4:55 = 55:00`. The 1-min mark is 59:00 and the pick is 55 seconds later,
as written. All three are constructor args; no contract change.

The ~5s tail is a display target, not a safety margin — there is no 60:00 deadline in
the contract. The real constraint is arm -> lock, which has 256 L1 blocks (~51 min).

### Test values (same shape, tenth scale)

```
240 / 360 / 30   -> entry 04:00, bets close 05:30, pick 06:00
```

**Decided: gen-2 deploys compressed.** `rearmTable` alone needs ~51 minutes of waiting
after the arm; a 60-minute round on top makes each iteration ~2 hours. Compressed gets
both recovery paths proven in ~10-minute cycles.

**Generation 3 then deploys on the production dials** once `rearmTable` and
`cancelTable` have run live. That is an accepted third deploy, not a slip — gen-2 is
explicitly a test generation and should be labelled as such in `addresses.js` so no
one mistakes its 6-minute rounds for the real thing.

## Addresses to carry over

| | |
|---|---|
| `SeedRegistry` (reuse, do **not** redeploy) | `0x2460C8ed63414F36838542982A5Ab263C9Fcb914` |
| `TimbPrize` | `0x35976f4D2260127848a6274D2eC89ee054412432` |
| `TIMBSToken` | `0x2Aaa61E2c08Ff61c93E960EcCd5Dd7fedF0bfaAa` |
| `TimbTreasury` (sweep target) | `0xd3F40042aFA8074EA68C9f61dE6aDADD539F0D5c` |
| `seedFunder` ops EOA (must be able to `approve`) | `0x42536623b503D4926DfAF6173B0357b7DfD19800` |

`PoolLedger`, `CommitRevealEntropy` and `SegmentBoard` are all redeployed.

## Deploy

`scripts/DeploySegmentBoard.s.sol` already does this. Environment:

```
DEPLOYER_PRIVATE_KEY=…
ENTRY_WINDOW_SECONDS=240
PICK_DELAY_SECONDS=360
BETS_CLOSE_SECONDS=30
TIMBS_ADDRESS=0x2Aaa61E2c08Ff61c93E960EcCd5Dd7fedF0bfaAa
TIMB_PRIZE_ADDRESS=0x35976f4D2260127848a6274D2eC89ee054412432
TREASURY_ADDRESS=0xd3F40042aFA8074EA68C9f61dE6aDADD539F0D5c
SEED_FUNDER_ADDRESS=0x42536623b503D4926DfAF6173B0357b7DfD19800
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

**Decided:**

- **Guardian — kept.** Gen-2 deploys with a guardian, halt-only and retirable.
  `retireGuardian()` is terminal whenever you want zero-privilege.
- **VRF (§10.6) — deferred, out of budget.** The entropy module stays swappable behind
  the same interface, so this deploy does not foreclose it, and the pre-VRF path
  remains the covert fallback regardless.

- **Dials — compressed** (240 / 360 / 30). Gen-2 is a test generation; gen-3 carries
  the production 2400 / 3595 / 295.

**Nothing open.** The plan is ready to execute.
