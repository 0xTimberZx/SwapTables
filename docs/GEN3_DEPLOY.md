# Generation 3 — plan

Draft. Nothing here has been executed.

Generation 2 exists to prove two recovery paths. Generation 3 exists to fix
discovery #11 and to run the production timing. Unlike gen-2, this one **changes
how money is accounted for**, so it deserves more care than a redeploy with
different constructor args.

## Why redeploy

| | |
|---|---|
| **Discovery #11 — cross-table sweep** | `retire` and `cancelTable` sweep `ledger.unowed()`, which is global. Any table's close-out takes every other live table's seed *and its players' loaded chips*. Proven in `tests/MultiTableSweep.t.sol`: table A's retire moved table B's entire 400 TIMBS, 300 of it player money, and left B insolvent. |
| **Production dials** | Gen-2 runs compressed 10× for testing. Gen-3 carries `2400 / 3595 / 295` — §10.3's real marks. |

Both contracts are immutable, so neither can be patched in place.

## The fix: per-table escrow, enforced by the ledger

The board currently decides how much to sweep and the ledger trusts it. That is
the wrong division: **the ledger holds the money, so the ledger should be the thing
that cannot be talked into moving another table's share.** After this change a
cross-table sweep is not "a bug we fixed" — it is unrepresentable.

### State

```solidity
mapping(uint256 => uint256) public tableEscrow;  // tableId -> tokens held for it
uint256 public totalEscrowed;                    // sum of tableEscrow, kept incrementally
uint256 public totalCredited;                    // unchanged: owed to wallets
```

`totalEscrowed` is maintained as a running total rather than summed on demand, so
nothing iterates over tables.

### Signatures — every mutator becomes table-scoped

```solidity
function collect(address from, uint256 amount, uint256 tableId) external onlyBoard;
function fundSeed(address from, uint256 amount, uint256 tableId) external onlyBoard;
function refund(address to, uint256 amount, uint256 tableId) external onlyBoard;
function creditWinnings(address[] calldata recipients,
                        uint256[] calldata amounts,
                        uint256 tableId) external onlyBoard;

/// Sweeps exactly what this table has left. No amount argument — the caller
/// cannot ask for more than the table holds, because it cannot ask at all.
function sweepTable(address to, uint256 tableId) external onlyBoard returns (uint256);
```

Dropping the `amount` parameter from the sweep is the point. `sweep(to, amount)`
made over-sweeping a matter of the board passing the right number;
`sweepTable(to, tableId)` makes it arithmetically impossible.

### Transitions

| Call | Effect |
|---|---|
| `collect` / `fundSeed` | pull tokens; `tableEscrow[id] += amount`; `totalEscrowed += amount` |
| `refund` | `tableEscrow[id] -= amount`; `totalEscrowed -= amount`; transfer out |
| `creditWinnings` | `tableEscrow[id] -= added`; `totalEscrowed -= added`; `totalCredited += added`; `credit[to] += …` |
| `sweepTable` | `amount = tableEscrow[id]`; zero it; `totalEscrowed -= amount`; transfer out |

`creditWinnings` and `refund` revert if the table's escrow cannot cover them, which
replaces today's `ExceedsUnowed` check against a global figure. A pool can now only
ever pay out of the stakes that entered its own table.

### The invariant, restated

Today:

```
balanceOf(this) >= totalCredited
```

which is true but too weak — it says nothing about escrow that has not been
credited *yet*, and that is every live table's stake. Gen-3:

```
balanceOf(this) >= totalCredited + totalEscrowed
```

and the residual `balanceOf(this) - totalCredited - totalEscrowed` is genuine
protocol surplus: dust, and tokens someone transferred in by accident. That, and
only that, is what `ownerWithdraw` may take. `_unowed()` is redefined accordingly —
it currently returns a number that includes live player money.

## Also worth folding in

- **Seed return on cancel.** The seed is *pulled* from `seedFunder` but *pushed* to
  `treasury` on cancel, so every cancel moves 100 TIMBS one-way off the ops wallet.
  On a cancel nothing happened — no round, no rake — so returning it to `seedFunder`
  is the more honest accounting. **Decide before building**: it is a policy choice,
  not a bug.
- **`isRed` shadowing.** `bool isRed` at `SegmentBoard.sol:925` shadows the
  `isRed(uint8)` function. Harmless, but it is warning noise on every build.

## Not changing

Rake, weights, seed share, the settlement maths, the entropy module, `SeedRegistry`
(reused again — a fresh one would let a consumed winning string seed another table).
Four live tables of evidence sit behind the arithmetic; it should not move in the
same deploy that rewrites the accounting underneath it.

## Migration

`PoolLedger` and `SegmentBoard` must deploy **together** — the interface change
means a gen-3 board cannot drive a gen-2 ledger, or vice versa. `IPoolLedger` in
`SegmentBoard.sol` changes with it.

Gen-2's ledger cannot be reused regardless: `setBoard` is one-time and burned.

## Acceptance tests

1. **Invert `test_KNOWNBUG_RetiringOneTableSweepsAnotherLiveTablesEscrow`.** Same
   setup, opposite assertion: table A's retire leaves table B's 400 untouched, and
   B settles and pays normally afterwards. This is the test that defines the fix.
2. **Two tables in parallel, live** — the first time that has ever been run. Open
   both, settle them in opposite order, check each pays exactly its own stakes.
3. **`ownerWithdraw` cannot touch live escrow** — with a table open, assert it is
   capped to the true surplus and reverts beyond it.
4. **Full round regression** — must reproduce the table 3/4 arithmetic to the wei.
5. **`cancelTable` and `rearmTable`** on the new board.
6. **Production dials** — confirm entry 40:00, bets close 55:00, pick 59:55, which
   also gives the §10.2 swap-jitter window its first real existence on chain.

Tests 1 and 2 are the point of the deploy. Test 6 needs a ~60-minute round, so
budget for it.

## Open

- Seed-return policy on cancel: `seedFunder` or `treasury`?
- Whether gen-3 is the generation that goes zero-privilege (`retireGuardian` +
  renounce), or whether that waits until the arithmetic has run at parallel scale.
