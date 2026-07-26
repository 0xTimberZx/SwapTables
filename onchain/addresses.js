// Deployed contract addresses consumed from the TimbSwap protocol.
// Single source of truth: TimbSwap/config.js — keep this file in sync on every deploy.
// SegmentBoard is deployed from the TimbSwap Foundry project (not this repo).

export const ADDRESSES = {
  arbitrumSepolia: {
    chainId: 421614,
    SegmentBoard: "0x0000000000000000000000000000000000000000", // TODO: set on first deploy (contract built, not yet deployed)
    PoolLedger:   "0x0000000000000000000000000000000000000000", // TODO: set on first deploy — custodies chips; pays winners
    SeedRegistry: "0x0000000000000000000000000000000000000000", // TODO: set on first deploy — long-lived ACROSS generations
    TimbPrize:    "0x35976f4D2260127848a6274D2eC89ee054412432", // from TimbSwap/config.js — re-pointed to GameRegistry v5
    TIMBSToken:   "0x2Aaa61E2c08Ff61c93E960EcCd5Dd7fedF0bfaAa", // from TimbSwap/config.js
    TimbTreasury: "0xd3F40042aFA8074EA68C9f61dE6aDADD539F0D5c", // from TimbSwap/config.js — v4 treasury
    // add others (Router, PrizeEscrow, ...) as the app needs them
  },
};

// Addresses above are copied verbatim from TimbSwap/config.js (Arbitrum Sepolia).
//
// SegmentBoard / PoolLedger / SeedRegistry are built (TimbSwap: contracts/
// SegmentBoard.sol, PoolLedger.sol, SeedRegistry.sol, CommitRevealEntropy.sol)
// but not yet deployed. Deploy a generation with:
//
//   forge script scripts/DeploySegmentBoard.s.sol --rpc-url $ARB_SEPOLIA_RPC \
//     --broadcast --verify --verifier sourcify -vvvv
//
// then paste the logged addresses above.
//
// Generations: SegmentBoard, PoolLedger and the entropy module are immutable and
// REDEPLOYED per generation — update those entries each time. SeedRegistry is the
// exception: it is long-lived and shared across every generation (it enforces
// never-reusing a winning string as a seed), so it is deployed once and then
// passed to later deploys as SEED_REGISTRY_ADDRESS. Never redeploy it.
