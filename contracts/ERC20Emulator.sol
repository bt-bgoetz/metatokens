// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.13;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

import "./ERC-1155M/IERC1155Supply.sol";

/// Provides emulation of an ERC-20 token for a specific ERC-1155 token.
/// Proxies ERC-20 functions into ERC-1155 functions.
abstract contract ERC20Emulator is IERC20, IERC20Metadata {
    // uint128(keccak256("ERC20Emulator"))
    // uint256[0xFFFF * 0x064af1425f26afffa37d4d42d222ee11] _padding;

    string _name;
    string _symbol;
    uint8 _decimals;
    
    /// @dev The address of the ERC-1155 contract that is being proxied.
    /// Must support IERC1155Supply.
    address _tokenAddress;
    /// @dev The ERC-1155 token ID that is being proxied.
    uint256 _tokenId;
    /// @dev The address of the ERC-1155 metatoken that extends ERC-20 functionality
    /// for the ERC-1155 token.
    address _metatokenAddress;
    
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
    
    /**
     * @dev Returns the amount of tokens in existence.
     */
    function totalSupply() external view returns (uint256) {
        return IERC1155Supply(_tokenAddress).totalSupply(_tokenId);
    }

    /**
     * @dev Returns the amount of tokens owned by `account`.
     */
    function balanceOf(address account) external view returns (uint256) {
        return IERC1155(_tokenAddress).balanceOf(account, _tokenId);
    }

    /**
     * @dev Moves `amount` tokens from the caller's account to `to`.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transfer(address to, uint256 amount) external returns (bool) {
        IERC1155(_tokenAddress).safeTransferFrom(msg.sender, to, _tokenId, amount, "");
        return true;
    }

    /**
     * @dev Returns the remaining number of tokens that `spender` will be
     * allowed to spend on behalf of `owner` through {transferFrom}. This is
     * zero by default.
     *
     * This value changes when {approve} or {transferFrom} are called.
     */
    // function allowance(address owner, address spender) external view returns (uint256);

    /**
     * @dev Sets `amount` as the allowance of `spender` over the caller's tokens.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * IMPORTANT: Beware that changing an allowance with this method brings the risk
     * that someone may use both the old and the new allowance by unfortunate
     * transaction ordering. One possible solution to mitigate this race
     * condition is to first reduce the spender's allowance to 0 and set the
     * desired value afterwards:
     * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
     *
     * Emits an {Approval} event.
     */
    // function approve(address spender, uint256 amount) external returns (bool);

    /**
     * @dev Moves `amount` tokens from `from` to `to` using the
     * allowance mechanism. `amount` is then deducted from the caller's
     * allowance.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool) {
        IERC1155(_tokenAddress).safeTransferFrom(from, to, _tokenId, amount, "");
        return true;
    }
}
