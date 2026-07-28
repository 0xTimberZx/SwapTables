// Deployed contract addresses consumed from the TimbSwap protocol.
// Single source of truth: TimbSwap/config.js — keep this file in sync on every deploy.
// The SegmentBoard contracts are deployed from the TimbSwap Foundry project (not this repo).

export const ADDRESSES = {
  arbitrumSepolia: {
    chainId: 421614,

    // ── SwapTables board, generation 3 (live) ──────────────────────────────
    //
    // PRODUCTION DIALS, first time on chain: entry closes 40:00, bets close
    // 55:00, pick 59:55 (2400 / 3595 / 295, §10.3). A full round is ~60 min.
    // This generation carries the per-table escrow ledger: money is tracked
    // per table (tableEscrow), sweeps are sweepTable(to, tableId) with no
    // amount parameter, and cancelTable returns the seed to seedFunder.
    // Deployed 2026-07-28; fixes VALIDATION.md discovery #11.
    SegmentBoard: "0x1633Fb6405b42835bb8f883a67B7968649c62257", // state machine + pari-mutuel settlement
    PoolLedger:   "0x5ee3d08FEFeFE08d8dDf09386E987Df23dbe105C", // custodies chips PER TABLE; credits + pays winners
    SeedRegistry: "0x2460C8ed63414F36838542982A5Ab263C9Fcb914", // long-lived ACROSS generations — never redeploy
    CommitRevealEntropy: "0x9aF8683d9FCf593F553fA5FED58E03e5F85e3564", // swappable for VRF later
    SegmentCrank: "0x09B8bC3eD49491DA2AaC47ad6DDC9A0cB6B2783D", // stateless lock/retire batcher — permissionless, generation-AGNOSTIC: survives redeploys

    // ── TimbSwap protocol ──────────────────────────────────────────────────
    TimbPrize:    "0x35976f4D2260127848a6274D2eC89ee054412432", // seed source — re-pointed to GameRegistry v5
    TIMBSToken:   "0x2Aaa61E2c08Ff61c93E960EcCd5Dd7fedF0bfaAa",
    TimbTreasury: "0xd3F40042aFA8074EA68C9f61dE6aDADD539F0D5c", // v4 treasury — receives sweeps
    // add others (Router, PrizeEscrow, ...) as the app needs them
  },
};

// ── Roles on the live board ────────────────────────────────────────────────
//
// treasury   = TimbTreasury (0xd3F4…0D5c) — sweeps are PUSHED here at retire.
//              On CANCEL (gen-3+) the seed goes back to seedFunder instead — a
//              cancelled table had no round and no rake.
// seedFunder = 0x42536623b503D4926DfAF6173B0357b7DfD19800 (ops EOA)
//              the seed is PULLED from here, so it must be able to call approve().
//              Confirmed from the allowance trail: it drops by exactly TABLE_SEED
//              (100) on every openTable, on top of that wallet's own chip loads.
//
// These are deliberately different addresses. Funding a table is a transferFrom,
// so the funder must be able to call approve() — which TimbTreasury cannot do (it
// has no generic approve, only internal router approvals for liquidity ops). A
// board pointed at the treasury for BOTH reverts on every openTable, permanently,
// because treasury is immutable. Generation 0 was retired for exactly this.
// seedFunder is owner-settable, so the ops wallet can be rotated without a
// redeploy; it can never reach player escrow.

// ── Retired — do not wire anything to these ────────────────────────────────
export const RETIRED = {
  arbitrumSepolia: {
    // gen 0: treasury was also the seed funder, so openTable could never fund.
    gen0: {
      SegmentBoard: "0xD1ba5099A05f87418A3E323F00f7B360f21a456F",
      PoolLedger:   "0x4BBCb72e695C24e175982354fFBD86Cc25695bF5", // setBoard already burned on gen 0
    },
    // gen 1: not broken — it settled tables 1, 3 and 4 and reconciled to the wei
    // every time (docs/VALIDATION.md). Superseded because the board is immutable
    // and it predates rearmTable and cancelTable, so neither recovery path could
    // be added or tested on it. Its PoolLedger cannot be reused: setBoard is
    // one-time and already burned.
    gen1: {
      SegmentBoard: "0x25D47477f7bf912791B9a6033d810283f33bF13D",
      PoolLedger:   "0xf3686b4E86e2b21FaDF36FE43b87EAF9D35FE409",
      CommitRevealEntropy: "0x3280249A9935D1858B9c8A1573a1C81a2f4132A5",
    },
    // gen 2: the compressed test generation (dials 240/360/30). Did its job —
    // cancelTable ran on its table 1 and rearmTable on its table 6, and its
    // full round reconciled to the wei. Superseded because its ledger sweeps
    // GLOBALLY (discovery #11: retiring any table takes every other live
    // table's escrow), which caps it at one table at a time forever. Its
    // PoolLedger cannot be reused: setBoard is one-time and already burned.
    gen2: {
      SegmentBoard: "0xAfC3a78a4F906C5CEb806d0d580d9175B2105924",
      PoolLedger:   "0x65ABf55FD57a34c527B07Bd6D90d91D2FbDa220f",
      CommitRevealEntropy: "0x3ddD099953409D5104CF5081E18DB88Cc842a2c2",
    },
  },
};

// ── Operating notes ────────────────────────────────────────────────────────
//
// Per-deploy wiring (all required before play):
//   1. PoolLedger.setBoard(SegmentBoard)          — ONE-TIME, irreversible
//   2. SeedRegistry.addWriter(SegmentBoard)       — else openTable reverts NotWriter
//   3. TIMBS.setTransferWhitelist(PoolLedger,true)— the LEDGER pays out, so it is
//      what would otherwise trip maxTransferAmount
//   4. From seedFunder: TIMBS.approve(PoolLedger, <seed budget>) — openTable pulls
//      TABLE_SEED (100 TIMBS) per table
//
// Opening a table:
//   - The seed round must be SETTLED: TimbPrize.roundWinningString(round) != 0,
//     and not already consumed by any generation.
//   - Commitments are bound to the table id they open under. Derive them on-chain
//     with SegmentBoard.commitmentsFor(secrets, nextTableId()) — binding them to
//     the wrong id is silent until lock time, when every reveal fails.
//
// Generations: SegmentBoard, PoolLedger and the entropy module are immutable and
// REDEPLOYED per generation — update those entries each time. SeedRegistry is the
// exception: it is long-lived and shared across every generation (it enforces
// never-reusing a winning string as a seed), so it is deployed once and then
// passed to later deploys as SEED_REGISTRY_ADDRESS. Never redeploy it.
