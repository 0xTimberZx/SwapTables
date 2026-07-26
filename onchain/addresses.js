// Deployed contract addresses consumed from the TimbSwap protocol.
// Single source of truth: TimbSwap/config.js — keep this file in sync on every deploy.
// SegmentBoard is deployed from the TimbSwap Foundry project (not this repo).

export const ADDRESSES = {
  arbitrumSepolia: {
    chainId: 421614,
    SegmentBoard: "0x0000000000000000000000000000000000000000", // TODO: not yet deployed — see note below
    PoolLedger:   "0x4BBCb72e695C24e175982354fFBD86Cc25695bF5", // custodies chips; pays winners
    SeedRegistry: "0x2460C8ed63414F36838542982A5Ab263C9Fcb914", // long-lived ACROSS generations — never redeploy
    CommitRevealEntropy: "0x3280249A9935D1858B9c8A1573a1C81a2f4132A5", // swappable for VRF later
    TimbPrize:    "0x35976f4D2260127848a6274D2eC89ee054412432", // from TimbSwap/config.js — re-pointed to GameRegistry v5
    TIMBSToken:   "0x2Aaa61E2c08Ff61c93E960EcCd5Dd7fedF0bfaAa", // from TimbSwap/config.js
    TimbTreasury: "0xd3F40042aFA8074EA68C9f61dE6aDADD539F0D5c", // from TimbSwap/config.js — v4 treasury
    // add others (Router, PrizeEscrow, ...) as the app needs them
  },
};

// Addresses above are copied verbatim from TimbSwap/config.js (Arbitrum Sepolia).
//
// PoolLedger, SeedRegistry and CommitRevealEntropy are DEPLOYED (above).
// SegmentBoard is still pending deploy.
//
// When deploying SegmentBoard, wire it to the already-deployed pieces rather than
// standing up new ones — pass the existing SeedRegistry as SEED_REGISTRY_ADDRESS,
// and note the deployed PoolLedger's setBoard() is one-time: if it has already
// been pointed at another board, that ledger cannot be reused and a fresh one
// must be deployed alongside the new board.
//
// After deploy, two manual steps are required before play:
//   1. TIMBS.setTransferWhitelist(PoolLedger, true)  — the LEDGER pays out, so it
//      is the address that would otherwise trip maxTransferAmount.
//   2. From the treasury: TIMBS.approve(PoolLedger, <seed budget>) — openTable()
//      pulls TABLE_SEED (100 TIMBS) per table.
// And the SeedRegistry owner must call addWriter(SegmentBoard), or the board
// cannot open tables.
//
// Generations: SegmentBoard, PoolLedger and the entropy module are immutable and
// REDEPLOYED per generation — update those entries each time. SeedRegistry is the
// exception: it is long-lived and shared across every generation (it enforces
// never-reusing a winning string as a seed), so it is deployed once and then
// passed to later deploys as SEED_REGISTRY_ADDRESS. Never redeploy it.
