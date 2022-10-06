// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts v4.4.1 (token/ERC1155/extensions/ERC1155Supply.sol)

import "./IMetatoken1155.sol";

pragma solidity ^0.8.0;

// Used to configure proxied calls.
uint256 constant PROXY_INCLUDE_SENDER = 0x1;
uint256 constant PROXY_SEND_RAW = 0x2;

interface IERC1155M {
    
    // The details for each registered metatoken.
    struct MetatokenDetails {
        uint16 status;
        uint16 hooks;
    }

    /**
     * @dev Returns the details for the provided metatoken extension.
     *
     * Returns:
     * - Metatoken status
     * - Metatoken hooks
     */
    function getMetatokenDetails(IMetatoken1155 metatoken) external view returns (MetatokenDetails memory);

    /**
     * @dev Returns the true metatoken address for a given registered metatoken address.
     */
    function getMetatokenImplementation(IMetatoken1155 metatoken) external view returns (IMetatoken1155);

    /**
     * @dev Checks if the provided selector is in the allowlist.
     */
    function isProxiedSelectorAllowed(uint256 selector) external view returns (bool);

    /**
     * @dev Proxies a CALL to a registered metatoken. The CALL will be executed via DELEGATECALL.
     * This allows for exposing new external functions for a metatoken (e.g., for compatability
     * layers for ERC-20 or ERC-721).
     *
     * @param options bit array with these flags:
     *     PROXY_INCLUDE_SENDER
     *     PROXY_SEND_RAW
     */
    function proxyMetatokenCall(
        address metatoken,
        bytes4 selector,
        uint8 options,
        bytes calldata data
    ) external returns (bytes memory);

    /**
     * @dev Proxies a STATICCALL to a registered metatoken. The STATICCALL will be executed
     * via DELEGATECALL. This allows for exposing new external functions for a metatoken (e.g.,
     * for compatability layers for ERC-20 or ERC-721).
     *
     * The current metatoken and sender will be prefixed to the calldata, if requested.
     *
     * @param options bit array with these flags:
     *     PROXY_INCLUDE_SENDER
     *     PROXY_SEND_RAW
     */
    function proxyMetatokenView(
        address metatoken,
        bytes4 selector,
        uint8 options,
        bytes calldata data
    ) external view returns (bytes memory);
}
