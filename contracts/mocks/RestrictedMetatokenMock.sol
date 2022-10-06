// SPDX-License-Identifier: MIT

pragma solidity ^0.8.13;

import "../ERC-1155M/Metatoken1155.sol";

error BurnMetatokenFirst();
error FullMetatokenBurnRequired();
error FullMetatokenTransferRequired();
error FullSupplyOnly();
error NoNFTSupply();
error TokenLocked();

/**
 * Restricted Metatoken

 * Restrictions:
 *
 * - General
 *     - The metatoken cannot be minted if there is no supply for the corresponding NFT.
 *     - Only the total supply of a given metatoken can be transferred at once (no partials).
 * - If the metatoken's supply is non-zero and it is not FULLY HELD:
 *     - The metatoken cannot be minted.
 *     - The metatoken cannot be burned.
 *     - The metatoken can only be transferred to this contract.
 *     - The NFT cannot be transferred.
 *     - The NFT cannot be minted.
 *     - The NFT cannot be burned.
 */
contract RestrictedMetatokenMock is Metatoken1155 {
    // Offset storage slots in 32KiB units.
    // STORAGE_OFFSET = 0xFFFF * (uint128(uint256(keccak256("RestrictedMetatokenMock"))) << 16);
    bytes32[0x190b0432cef181cc379a2643071761800000] _storageOffset;

    uint16 constant METATOKEN_HOOKS =
          CAT_HAS_HOOK_NFT_BURN
        | CAT_HAS_HOOK_NFT_TRANSFER
        | CAT_HAS_HOOK_META_BURN
        | CAT_HAS_HOOK_META_MINT
        | CAT_HAS_HOOK_META_TRANSFER;

    function metatokenHooks() external pure override returns (uint16) {
        return METATOKEN_HOOKS;
    }

    function beforeBurn(
        address /* from */,
        uint256 id,
        uint256 /* amount */
    ) external view override {
        // The NFT can only be burned if the metatoken supply is zero.
        if (totalSupply(id | currentMetatokenId()) > 0) {
            revert BurnMetatokenFirst();
        }
    }
    
    function beforeTransfer(
        address /* from */,
        address /* to */,
        uint256 id,
        uint256 /* amount */,
        bytes memory /* data */
    ) external view override {
        // The token can only be transferred if the metatoken supply is zero.
        if (totalSupply(id | currentMetatokenId()) > 0) {
            revert FullMetatokenBurnRequired();
        }
    }

    function preMetaBurn(
        address /* from */,
        uint256 id,
        uint256 amount
    ) external view override isOwnMetatoken(id) {
        // The metatoken can only be burned if the supply is nonzero and it is fully held by this contract.
        uint256 supply = totalSupply(id);
        if (amount != supply || balanceOf(address(this), id) != supply) {
            revert FullMetatokenTransferRequired();
        }
    }

    function preMetaMint(
        address /* to */,
        uint256 id,
        uint256 /* amount */,
        bytes memory /* data */
    ) external view override isOwnMetatoken(id) {
        // The metatoken can only be minted if the supply of the corresponding NFT is not zero.
        if (totalSupply(id & TOKEN_ID_MASK) == 0) {
            revert NoNFTSupply();
        }

        // The metatoken can only be minted if the supply is zero or it is fully held by this contract.
        uint256 supply = totalSupply(id);
        if (supply > 0 && balanceOf(address(this), id) != supply) {
            revert TokenLocked();
        }
    }

    function preMetaTransfer(
        address from,
        address /* to */,
        uint256 id,
        uint256 amount,
        bytes memory /* data */
    ) external view override isOwnMetatoken(id) {
        // We can only transfer if either the supply is zero or the full amount is transferring. This
        // will ensure that only a single address holds the full supply of the metatoken at once.
        if (totalSupply(id) > 0 && amount != balanceOf(from, id)) {
            revert FullSupplyOnly();
        }
    }
}