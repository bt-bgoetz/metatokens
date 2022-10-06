// SPDX-License-Identifier: MIT

pragma solidity ^0.8.13;

import "../openzeppelin/contracts/proxy/utils/Initializable.sol";

import "../ERC-1155M/IERC1155M.sol";
import "../ERC-1155M/Metatoken1155.sol";

/// Example registration ABI for proxying the calls.
interface IProxyableERC1155M {
    /**
     * @dev Adds the provided selectors to the allowlist for proxying.
     *
     * The highest-order bytes20 are the metatoken address, the lowest order bytes4 is the proxied
     * function selector.
     */
    function allowMetatokenSelectors(uint256[] calldata selectors) external;
}


/// Example Metatoken to implement ERC-20 behavior.
/// Must be initialized before use.
/// Public ERC-20 address will be a separate ERC20Emulator contract.
/// Not strictly necessary for ERC-20 emulation, but enables metatoken extensibility of the underlying token.
contract ERC20Metatoken is Metatoken1155, Initializable {
    // STORAGE_OFFSET = 0xFFFF * (uint128(uint256(keccak256("ERC20Metatoken"))) << 16);
    // uint128[keccak256("ERC20Metatoken")]
    uint256[0xf1d52b8d310fa3764daaeb33c18a157c0000] _padding;

    // These are private as they will only be set via a delegatecall. For improved optimization,
    // these should live within the ERC20Emulator contract, but are left here as an example for
    // how the proxied calls can chain together.
    string private _name;
    string private _symbol;
    uint8 private _decimals;

    uint16 constant METATOKEN_HOOKS = CAT_HAS_HOOK_META_MINT | CAT_HAS_HOOK_META_TRANSFER;

    function metatokenHooks() external pure override returns (uint16) {
        return METATOKEN_HOOKS;
    }

    ///
    /// ERC-20
    ///

    /**
     * @dev Initialize the contract.
     */
    function initialize(string calldata name_, string calldata symbol_, uint8 decimals_) initializer external {
        _name = name_;
        _symbol = symbol_;
        _decimals = decimals_;

        // Enable proxying of ERC-20 ABI calls.
        // It is recommend to restrict these calls to permissioned accounts, preferablly via external calls.
        uint256 prefix = currentMetatokenId();
        uint256[] memory selectors = new uint256[](3);
        selectors[0] = prefix | uint32(ERC20Metatoken.name.selector);
        selectors[1] = prefix | uint32(ERC20Metatoken.symbol.selector);
        selectors[2] = prefix | uint32(ERC20Metatoken.decimals.selector);
        IProxyableERC1155M(address(this)).allowMetatokenSelectors(selectors);
    }

    /**
     * @dev Returns the name of the token.
     */
    function name() external view returns (string memory) {
        return _name;
    }

    /**
     * @dev Returns the symbol of the token.
     */
    function symbol() external view returns (string memory) {
        return _symbol;
    }

    /**
     * @dev Returns the decimals places of the token.
     */
    function decimals() external view returns (uint8) {
        return _decimals;
    }
}