// SPDX-License-Identifier: MIT

pragma solidity ^0.8.13;

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

// How many bits to shift to get the token adadress (NFT vs metatoken).
uint256 constant TOKEN_ADDRESS_SHIFT = 96;
// The mask to get the metatoken address from a given token id.
uint256 constant TOKEN_ADDRESS_MASK = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF000000000000000000000000;
// The mask to get the NFT id from a given token id.
uint256 constant TOKEN_ID_MASK = 0x0000000000000000000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFF;

// Which hooks a metatoken has enabled.
uint16 constant CAT_HAS_HOOK_NFT_BURN      = 0x01;
uint16 constant CAT_HAS_HOOK_NFT_MINT      = 0x04;
uint16 constant CAT_HAS_HOOK_NFT_TRANSFER  = 0x08;
uint16 constant CAT_HAS_HOOK_META_BURN     = 0x10;
uint16 constant CAT_HAS_HOOK_META_MINT     = 0x40;
uint16 constant CAT_HAS_HOOK_META_TRANSFER = 0x80;

/**
 * @dev A metatoken is an extension of metadata and logic on top of an ERC-1155 NFT.
 *
 * The highest-order (big-endian) 20 bytes of the token ID is the address of the metatoken extension
 * contract. The next 4 bytes are optional metadata. The remaining 8 bytes are the token ID.
 *
 * Libraries that implement metatokens will be trustfully registered to ERC-1155 NFT contracts.
 *
 * To reduce unintentional confusion between interacting with the root NFT and its metatokens,
 * the naming of the hooks differs slightly: before/after is used when writing NFT logic, pre/post
 * is used when writing metatoken logic.
 *
 * Base ERC-1155M Hooks:
 * - beforeBurn(address from, uint256 id, uint256 amount)
 * - afterBurn(address from, uint256 id, uint256 amount)
 * - beforeMint(address to, uint256 id, uint256 amount, bytes data)
 * - afterMint(address to, uint256 id, uint256 amount, bytes data)
 * - beforeTransfer(address from, address to, uint256 id, uint256 amount, bytes data)
 * - afterTransfer(address from, address to, uint256 id, uint256 amount, bytes data)
 *
 * Metatoken Hooks:
 * - preMetaBurn(address from, uint256 id, uint256 amount)
 * - postMetaBurn(address from, uint256 id, uint256 amount)
 * - preMetaMint(address to, uint256 id, uint256 amount, bytes data)
 * - postMetaMint(address to, uint256 id, uint256 amount, bytes data)
 * - preMetaTransfer(address from, address to, uint256 id, uint256 amount, bytes data)
 * - postMetaTransfer(address from, address to, uint256 id, uint256 amount, bytes data)
 *
 */
interface IMetatoken1155 is IERC165 {
    //////////////////////////////////////
    /// Metatoken Registration Details ///
    //////////////////////////////////////

    /**
     * @dev Which hooks this metatoken has enabled
     */
    function metatokenHooks() external pure returns (uint16);

    ////////////////////////////
    /// NFT - Precheck Hooks ///
    ////////////////////////////

    /**
     * @dev Called prior to the burn of the root NFT.
     *
     * This should not modify state as it is used solely as a test for invariance prior to the
     * burning of an NFT.
     *
     * Requirements:
     *
     * - `from` cannot be the zero address.
     * - `from` must have at least `amount` tokens of token type `id`.
     *
     * Example: Checking to make sure the metatoken exists before burning it.
     */
    function beforeBurn(
        address from,
        uint256 id,
        uint256 amount
    ) external view;

    /**
     * @dev Called prior to the mint of the root NFT.
     *
     * This should not modify state as it is used solely as a test for invariance prior to the
     * minting of an NFT.
     *
     * Requirements:
     *
     * - `to` cannot be the zero address.
     * - If `to` refers to a smart contract, it must implement {IERC1155Receiver-onERC1155Received} and return the
     * acceptance magic value.
     *
     * Example: Checking to make sure the metatoken does not exist before minting it.
     */
    function beforeMint(
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) external view;

    /**
     * @dev Called prior to the transfer of the root NFT.
     *
     * This should not modify state as it is used solely as a test for invariance prior to the
     * transferring of an NFT.
     *
     * Example: Checking to make sure the metatoken has the correct amount before transferring it.
     */
    function beforeTransfer(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) external view;

    //////////////////////////////
    /// NFT - Postaction Hooks ///
    //////////////////////////////

    /**
     * @dev Called after the burn of the root NFT.
     *
     * This may modify state if necessary, however it must also test for invariances after the
     * burning of an NFT.
     *
     * Requirements:
     *
     * - `from` cannot be the zero address.
     * - `from` must have at least `amount` tokens of token type `id`.
     *
     * Example: Checking to make sure secondary addresses associated with the metatoken are cleared.
     */
    function afterBurn(
        address from,
        uint256 id,
        uint256 amount
    ) external;

    /**
     * @dev Called after the mint of the root NFT.
     *
     * This may modify state if necessary, however it must also test for invariances after the
     * minting of an NFT.
     *
     * Requirements:
     *
     * - `to` cannot be the zero address.
     * - If `to` refers to a smart contract, it must implement {IERC1155Receiver-onERC1155Received} and return the
     * acceptance magic value.
     *
     * Example: Checking to make sure secondary addresses associated with the metatoken are set.
     */
    function afterMint(
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) external;

    /**
     * @dev Called prior to the transfer of the root NFT.
     *
     * This may modify state if necessary, however it must also test for invariances after the
     * transferring of an NFT.
     *
     * Example: Checking to make sure secondary addresses associated with the metatoken are updated.
     */
    function afterTransfer(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) external;

    //////////////////////////////////
    /// Metatoken - Precheck Hooks ///
    //////////////////////////////////

    /**
     * @dev Called prior to the burn of the metatoken.
     *
     * This should not modify state as it is used solely as a test for invariance prior to the
     * burning of a metatoken.
     *
     * Requirements:
     *
     * - `from` cannot be the zero address.
     * - `from` must have at least `amount` tokens of token type `id`.
     *
     * Example: Checking to make sure the metatoken exists before burning it.
     */
    function preMetaBurn(
        address from,
        uint256 id,
        uint256 amount
    ) external view;

    /**
     * @dev Called prior to the mint of the metatoken.
     *
     * This should not modify state as it is used solely as a test for invariance prior to the
     * minting of a metatoken.
     *
     * Requirements:
     *
     * - `to` cannot be the zero address.
     * - If `to` refers to a smart contract, it must implement {IERC1155Receiver-onERC1155Received} and return the
     * acceptance magic value.
     *
     * Example: Checking to make sure the metatoken does not exist before minting it.
     */
    function preMetaMint(
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) external view;

    /**
     * @dev Called prior to the transfer of the metatoken.
     *
     * This should not modify state as it is used solely as a test for invariance prior to the
     * transferring of a metatoken.
     *
     * Example: Checking to make sure the metatoken has the correct amount before transferring it.
     */
    function preMetaTransfer(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) external view;

    ////////////////////////////////////
    /// Metatoken - Postaction Hooks ///
    ////////////////////////////////////

    /**
     * @dev Called after the burn of the metatoken.
     *
     * This may modify state if necessary, however it must also test for invariances after the
     * burning of a metatoken.
     *
     * Requirements:
     *
     * - `from` cannot be the zero address.
     * - `from` must have at least `amount` tokens of token type `id`.
     *
     * Example: Checking to make sure secondary addresses associated with the metatoken are cleared.
     */
    function postMetaBurn(
        address from,
        uint256 id,
        uint256 amount
    ) external;

    /**
     * @dev Called after the mint of the metatoken.
     *
     * This may modify state if necessary, however it must also test for invariances after the
     * minting of a metatoken.
     *
     * Requirements:
     *
     * - `to` cannot be the zero address.
     * - If `to` refers to a smart contract, it must implement {IERC1155Receiver-onERC1155Received} and return the
     * acceptance magic value.
     *
     * Example: Checking to make sure secondary addresses associated with the metatoken are set.
     */
    function postMetaMint(
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) external;

    /**
     * @dev Called prior to the transfer of the metatoken.
     *
     * This may modify state if necessary, however it must also test for invariances after the
     * transferring of a metatoken.
     *
     * Example: Checking to make sure secondary addresses associated with the metatoken are updated.
     */
    function postMetaTransfer(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) external;
}
