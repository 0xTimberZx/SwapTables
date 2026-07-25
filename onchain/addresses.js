// Deployed contract addresses consumed from the TimbSwap protocol.
// Single source of truth: TimbSwap/config.js — keep this file in sync on every deploy.
// SegmentBoard is deployed from the TimbSwap Foundry project (not this repo).

export const ADDRESSES = {
  arbitrumSepolia: {
    chainId: 421614,
    SegmentBoard: "0x0000000000000000000000000000000000000000", // TODO: set on first deploy (not yet built)
    TimbPrize:    "0x35976f4D2260127848a6274D2eC89ee054412432", // from TimbSwap/config.js — re-pointed to GameRegistry v5
    TIMBSToken:   "0x2Aaa61E2c08Ff61c93E960EcCd5Dd7fedF0bfaAa", // from TimbSwap/config.js
    TimbTreasury: "0xd3F40042aFA8074EA68C9f61dE6aDADD539F0D5c", // from TimbSwap/config.js — v4 treasury
    // add others (Router, PrizeEscrow, ...) as the app needs them
  },
};

// Addresses above are copied verbatim from TimbSwap/config.js (Arbitrum Sepolia).
// SegmentBoard is intentionally the zero address until the contract is built and
// deployed from the TimbSwap Foundry project — fill it in on first deploy.
