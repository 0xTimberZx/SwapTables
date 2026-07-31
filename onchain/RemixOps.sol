// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.20;

// ── SwapTables operator kit for Remix ──────────────────────────────────────
//
// The full SegmentBoard.sol crashes Remix's in-browser compiler (JS stack
// overflow on the big source — not a Solidity "stack too deep"). You never
// need to compile the board to OPERATE it: paste THIS file, compile any
// 0.8.20+, then in Deploy & Run pick an interface and use "At Address" with
// the deployed address. Full builds and tests live in the Foundry repo.
//
// Gen-5 (Arbitrum Sepolia, deployed 2026-07-31):
//   SegmentBoard  0x7358Aa710F65B4228A7C0A56bedeD20Fd537B2ff
//   PoolLedger    0x020E3A7Fde41fa4bA18a978f10DE5484594C43a0
//   SeedRegistry  0x2460C8ed63414F36838542982A5Ab263C9Fcb914  (shared, all gens)
//   SegmentCrank  0x09B8bC3eD49491DA2AaC47ad6DDC9A0cB6B2783D  (shared, all gens)

interface ISegmentBoardOps {
    // ── lifecycle ──
    function openTable(uint256 seedRound, bytes32[6] calldata segmentCommitments) external returns (uint256);
    function armTable(uint256 tableId) external;
    function rearmTable(uint256 tableId) external;
    function lockSegment(uint256 tableId, uint8 segment, bytes32 secret) external;
    function lockSegmentFallback(uint256 tableId, uint8 segment) external;
    function retire(uint256 tableId) external;
    function cancelTable(uint256 tableId) external;

    // ── guardian / owner ──
    function setNewTablesHalted(bool halted) external;
    function retireGuardian() external;
    function setSeedFunder(address _seedFunder) external;

    // ── views ──
    function nextTableId() external view returns (uint256);
    function tableCount() external view returns (uint256);
    function commitmentsFor(bytes32[6] calldata secrets, uint256 tableId) external view returns (bytes32[6] memory);
    // gen-5 tables(): four fields appended after the gen-4 ten
    function tables(uint256 tableId) external view returns (
        uint64 openedAt, uint64 pickTime, uint64 lockBlock, uint32 seedRound,
        uint8 seatCount, uint8 lockedMask, bool ddSettled, bool retired,
        bytes6 seedString, bytes6 lockedChars,
        uint64 entryCloseAt, uint64 lastJoinAt, uint64 firstLoadAt, uint8 loadedCount
    );
    function seats(uint256 tableId, address wallet) external view returns (
        uint64 chipPack, uint8 placedMask, uint8 ddChip, bool seated, bytes6 ticket
    );
    // dials
    function entryMax() external view returns (uint64);
    function sitQuiet() external view returns (uint64);
    function soloWait() external view returns (uint64);
    function placeWindow() external view returns (uint64);
    function betsCloseLead() external view returns (uint64);
}

interface IPoolLedgerOps {
    function heldBalance() external view returns (uint256);
    function totalCredited() external view returns (uint256);
    function totalEscrowed() external view returns (uint256);
    function credit(address wallet) external view returns (uint256);
    function tableEscrow(uint256 tableId) external view returns (uint256);
    function withdraw() external;
}

interface ISeedRegistryOps {
    function addWriter(address writer) external;
    function removeWriter(address writer) external;
}

interface ITimbsOps {
    function balanceOf(address) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function setTransferWhitelist(address account, bool allowed) external;
}
