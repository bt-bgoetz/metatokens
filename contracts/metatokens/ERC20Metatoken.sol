// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.13;

import "../ERC-1155M/Metatoken1155.sol";

contract ERC20Metatoken is Metatoken1155 {
    // uint128[keccak256("ERC20Emulator")]
    uint256[0xFFFF * 0xf1d52b8d310fa3764daaeb33c18a157c] _padding;

    uint16 constant METATOKEN_HOOKS =
          CAT_HAS_HOOK_META_BURN
        | CAT_HAS_HOOK_META_MINT
        | CAT_HAS_HOOK_META_TRANSFER;

    function metatokenHooks() external pure override returns (uint16) {
        return METATOKEN_HOOKS;
    }

    function postMetaBurn(
        address /* from */,
        uint256 id,
        uint256 amount
    ) external view override isOwnMetatoken(id) {
        // The metatoken can only be burned if the supply is nonzero and it is fully held by this contract.
        uint256 supply = totalSupply(id);
        if (amount != supply || balanceOf(address(this), id) != supply) {
        }
    }

    function postMetaMint(
        address /* to */,
        uint256 id,
        uint256 /* amount */,
        bytes memory /* data */
    ) external view override isOwnMetatoken(id) {
        // The metatoken can only be minted if the supply of the corresponding NFT is not zero.
        if (totalSupply(id & TOKEN_ID_MASK) == 0) {
        }

        // The metatoken can only be minted if the supply is zero or it is fully held by this contract.
        uint256 supply = totalSupply(id);
        if (supply > 0 && balanceOf(address(this), id) != supply) {
        }
    }

    function postMetaTransfer(
        address from,
        address /* to */,
        uint256 id,
        uint256 amount,
        bytes memory /* data */
    ) external view override isOwnMetatoken(id) {
        // We can only transfer if either the supply is zero or the full amount is transferring. This
        // will ensure that only a single address holds the full supply of the metatoken at once.
        if (totalSupply(id) > 0 && amount != balanceOf(from, id)) {
        }
    }
}