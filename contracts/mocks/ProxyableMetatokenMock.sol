// SPDX-License-Identifier: MIT

pragma solidity ^0.8.13;

import "../ERC-1155M/Metatoken1155.sol";
// import "../ERC-1155M/ERC1155M.sol";

interface IERC1155M {
    function proxyMetatokenView(
        address metatoken,
        bytes4 selector,
        bytes calldata data
    ) external view returns (bytes memory);
    function isProxiedSelectorAllowed(uint256 selector) external view returns (bool);
}

error TokenAlreadyMinted();
error TokenMustBeNFT();
error NotOwner();
error NotOwnerOrPreviousOwner();

contract ProxyableMetatokenMock is Metatoken1155 {
    bytes[1024] private padding;

    mapping(uint256 => address) private _previousHolder;
    mapping(uint256 => string) private _tokenName;

    uint16 constant METATOKEN_HOOKS =
          CAT_HAS_HOOK_META_BURN
        | CAT_HAS_HOOK_META_MINT
        | CAT_HAS_HOOK_META_TRANSFER;

    function metatokenHooks() external pure override returns (uint16) {
        return METATOKEN_HOOKS;
    }

    function postMetaBurn(
        address from,
        uint256 id,
        uint256
    ) external override isOwnMetatoken(id) {
        _previousHolder[id] = from;
    }

    function preMetaMint(
        address,
        uint256 id,
        uint256 amount,
        bytes memory
    ) external view override isOwnMetatoken(id) {
        if (totalSupply(id) > 0) {
            revert TokenAlreadyMinted();
        }
        if (amount != 1) {
            revert TokenMustBeNFT();
        }
    }

    function postMetaMint(
        address,
        uint256 id,
        uint256,
        bytes memory
    ) external override isOwnMetatoken(id) {
        _previousHolder[id] = ZERO_ADDRESS;
    }

    function postMetaTransfer(
        address from,
        address,
        uint256 id,
        uint256,
        bytes memory
    ) external override isOwnMetatoken(id) {
        _previousHolder[id] = from;
    }

    // Proxyable functions
    function simpleView(uint256 input) external pure returns (uint256) {
        return input * 2;
    }

    function simpleView2(IMetatoken1155, address, uint256 input) external pure returns (uint256) {
        return input * 3;
    }

    function getPreviousHolder(uint256 id) external view returns (address) {
        return _previousHolder[id];
    }

    function getTokenName(IMetatoken1155, address sender, uint256 id) external view returns (string memory) {
        if (sender == ZERO_ADDRESS) {
            revert ZeroAddress();
        }
        if (balanceOf(sender, id) != 1 && sender != _previousHolder[id]) {
            revert NotOwnerOrPreviousOwner();
        }

        return _tokenName[id];
    }

    function setTokenName(uint256 id, string calldata name) external {
        if (msg.sender == ZERO_ADDRESS) {
            revert ZeroAddress();
        }
        if (balanceOf(msg.sender, id) != 1) {
            revert NotOwner();
        }
        _tokenName[id] = name;
    }
}
