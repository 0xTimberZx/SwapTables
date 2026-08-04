// Deployed contract addresses consumed from the TimbSwap protocol.
// Single source of truth: TimbSwap/config.js — keep this file in sync on every deploy.
// The SegmentBoard contracts are deployed from the TimbSwap Foundry project (not this repo).

export const ADDRESSES = {
  arbitrumSepolia: {
    chainId: 421614,

    // ── SwapTables board, generation 7 — the bonus-chip generation (live) ──
    //
    // One rule change from gen-6: the Repeats-a-Digit stake now requires a
    // full six-token load (`placeDoubleDigit` reverts NotLoaded). Until gen-7
    // a seated-but-unfunded wallet could buy the DD stake — and, with the
    // jackpot live, buy into a strike — while contributing nothing to the six
    // segment pools. No ABI surface was added, so the apps read gen-7 as
    // gen-6 and that is correct. Deployed 2026-08-03.
    //
    // The gen-6 notes below still describe the money mechanics, unchanged:
    //
    // Gen-5's adaptive timing unchanged (dials 2400/300/120/180/900), plus
    // the money mechanics (docs/UNDERWRITE_SPEC.md, GEN6_DEALER_TIP.md,
    // GAME_ECONOMY.md):
    //   - monotonic underwrite (M1): thin winners topped up toward
    //     stake x fair x 0.90 from the UnderwriteReserve; pool pays first,
    //     reserve covers the shortfall — a joiner can only raise you. Caps:
    //     1000/pool, 1500/round, 10% of free float. DD is not underwritten.
    //   - flow of funds: every dead pot + half the rake -> reserve at
    //     retire (waterfall parks overflow for the jackpot/la partage);
    //     other half + unconsumed seed -> Treasury. Solvency counters on
    //     the reserve keep Treasury support <= what the game earned.
    //   - dealer tips (M6): seated wallets tip the opener after the sixth
    //     lock, credit-to-credit, zero rake.
    // GENERATION 8 (deployed 2026-08-04) — the entropy module changes and
    // nothing else. Gens 1-7 drew from a commit-reveal with a 64-block
    // blockhash fallback, which handed the secret-holder a SELECTION EDGE:
    // with the lock block public it could compute both outcomes and pick by
    // acting or not acting (ENTROPY_TRUST.md). Gen-8 deletes the second path
    // rather than policing it. New ABI surface: segmentState(uint256,uint8)
    // is how the apps detect gen-8. Gen-7 (0xf3FF3448...) retired 2026-08-04;
    // its ledger still pays withdrawals forever.
    SegmentBoard: "0x89eE2553AD7c72700A7BfD7A095440cc8BE55227", // state machine + pari-mutuel settlement + tips
    PoolLedger:   "0x9195803ecA9A0F4F813502A110b32C842330fD0D", // custodies chips PER TABLE; credits + pays winners
    UnderwriteReserve: "0x69C9E840aEc4368016038bF54e603E345ede1063", // the top-up float; income = dead pots + half rake
    SeedRegistry: "0x2460C8ed63414F36838542982A5Ab263C9Fcb914", // long-lived ACROSS generations — never redeploy
    VRFEntropy:   "0xD982C7218cBD3c395a0A1461732ADEc99A3A87c0", // gen-8 — one Chainlink VRF v2.5 draw per SEGMENT
    CommitRevealEntropy: "0x57A1F889A30178b62Bc39844D73B68d0f8a274d6", // gen-7's, retired — kept for reading old rounds
    // Stateless lock/retire batcher for generations 4-7 ONLY. Its interface
    // declares lockSegment(uint256,uint8,bytes32) and lockSegmentFallback, and
    // the VRF board has neither — no secret to pass, no fallback by design — so
    // both revert on a missing selector. Batching is also unwanted now: six
    // locks in one transaction would collapse the staggered reveal the
    // per-segment design exists to produce. retire(uint256) is all gen-8 shares.
    SegmentCrank: "0x09B8bC3eD49491DA2AaC47ad6DDC9A0cB6B2783D",
    DDJackpot:    "0x73D3c3224Ed4F4fA663878bf32B8605A2DAe96B9", // M2 rolling jackpot — deploy-once, cross-generation; metered strikes, stake-capped

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
    // gen 6: nothing broken — superseded 2026-08-03 by gen-7's bonus-chip
    // rule. Its ledger still pays withdrawals of remaining credits, and its
    // reserve was drained to Treasury before the switch (a fresh reserve is
    // deployed per generation because setBoard on it is one-time).
    gen6: {
      SegmentBoard: "0x1de9889da2083F5f1693DfCf589A453E9b39EEA7",
      PoolLedger:   "0x819B5074312E4ADD9D72D722D9C6a38320796Bd8",
      UnderwriteReserve: "0xa0f88d8504D340702889C48288D8FB9329D88184",
      CommitRevealEntropy: "0x63614173003957A3AECb6bd22C8cC491f7279F3D",
    },
    // gen 5: nothing broken — superseded 2026-07-31 (same day) by gen-6's
    // accounting mechanics; the adaptive timing it introduced carries
    // forward unchanged. Ledger still pays withdrawals of remaining credits.
    gen5: {
      SegmentBoard: "0x7358Aa710F65B4228A7C0A56bedeD20Fd537B2ff",
      PoolLedger:   "0x020E3A7Fde41fa4bA18a978f10DE5484594C43a0",
      CommitRevealEntropy: "0xb2a46fB96A8894a50341d5F162C130966ca4f895",
    },
    // gen 4: nothing broken — superseded 2026-07-31 by gen-5's adaptive
    // entry. Fixed fast dials (900/1500/300) still made every table wait
    // the full window; gen-5 lets the schedule follow the players. Vault
    // drained to 0/0/0 before the switch; escrow accounting sound.
    gen4: {
      SegmentBoard: "0x57d5BE0203Fa30f7b99853a11e4D162824895F91",
      PoolLedger:   "0x863e37FF91cbd745CBcb063266Bf0631Ce2546b5",
      CommitRevealEntropy: "0xe926797b2FC03E2936092D3de2B4c7ADE2e4A5Fd",
    },
    // gen 3: nothing broken — superseded 2026-07-30 for dial speed only
    // (40-min entry read as dead air on stream). Escrow accounting sound;
    // ledger still pays withdrawals of remaining credits forever.
    gen3: {
      SegmentBoard: "0x1633Fb6405b42835bb8f883a67B7968649c62257",
      PoolLedger:   "0x5ee3d08FEFeFE08d8dDf09386E987Df23dbe105C",
      CommitRevealEntropy: "0x9aF8683d9FCf593F553fA5FED58E03e5F85e3564",
    },
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
