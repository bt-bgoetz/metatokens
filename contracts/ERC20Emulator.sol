// SPDX-License-Identifier: MIT

pragma solidity ^0.8.13;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

import "./openzeppelin/contracts/proxy/utils/Initializable.sol";

import "./ERC-1155M/IERC1155M.sol";
import "./ERC-1155M/IERC1155Supply.sol";

interface IERC1155MMock {
    function registerEmulator(address emulator, uint256 token) external;
}

address constant ZERO_ADDRESS = address(0);

error InsufficientAllowance();
error OwnerIsZeroAddress();
error SpenderIsZeroAddress();

/// Provides emulation of an ERC-20 token for a specific ERC-1155 token.
/// Proxies ERC-20 functions into ERC-1155 functions.
/// Is the public address used for ERC-20 token tracking.
///
/// Requires a registered and initialized ERC20Metatoken metatoken.
/// Requires proxied metatoken calls registered.
contract ERC20Emulator is IERC20, IERC20Metadata, Initializable {
    /// @dev The address of the ERC-1155 contract.
    /// Must support IERC1155Supply.
    address _tokenAddress;
    /// @dev The ERC-1155 token ID that will be emulated as an ERC-20 token.
    uint256 _tokenId;
    /// @dev The address of the ERC20Metatoken metatoken.
    address _metatokenAddress;

    mapping(address => mapping(address => uint256)) private _allowances;

    /**
     * @dev Initialize the contract.
     */
    function initialize(address tokenAddress_, uint256 tokenId_, address metatokenAddress_) initializer external {
        _tokenAddress = tokenAddress_;
        _tokenId = tokenId_;
        _metatokenAddress = metatokenAddress_;
        IERC1155MMock(tokenAddress_).registerEmulator(address(this), tokenId_);

    }

    function tokenAddress() external view returns (address) {
        return _tokenAddress;
    }
    

    function tokenId() external view returns (uint256) {
        return _tokenId;
    }
    

    function metatokenAddress() external view returns (address) {
        return _metatokenAddress;
    }
    
    /**
     * @dev Returns the name of the token.
     */
    function name() external view returns (string memory) {
        bytes memory result = IERC1155M(_tokenAddress).proxyMetatokenView(
            _metatokenAddress,
            IERC20Metadata.name.selector,
            0x0,
            ""
        );

        (string memory _name) = abi.decode(result, (string));

        return _name;
    }

    /**
     * @dev Returns the symbol of the token.
     */
    function symbol() external view returns (string memory) {
        bytes memory result = IERC1155M(_tokenAddress).proxyMetatokenView(
            _metatokenAddress,
            IERC20Metadata.symbol.selector,
            0x0,
            ""
        );

        (string memory _symbol) = abi.decode(result, (string));

        return _symbol;
    }

    /**
     * @dev Returns the decimals places of the token.
     */
    function decimals() external view returns (uint8) {
        bytes memory result = IERC1155M(_tokenAddress).proxyMetatokenView(
            _metatokenAddress,
            IERC20Metadata.decimals.selector,
            0x0,
            ""
        );

        (uint8 _decimals) = abi.decode(result, (uint8));

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
    function allowance(address owner, address spender) external view returns (uint256) {
        return _allowances[owner][spender];
    }

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
    function approve(address spender, uint256 amount) external returns (bool) {
        address owner = msg.sender;
        _approve(owner, spender, amount);
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
        _spendAllowance(from, msg.sender, amount);
        IERC1155(_tokenAddress).safeTransferFrom(from, to, _tokenId, amount, "");
        return true;
    }

    /**
     * @dev Sets `amount` as the allowance of `spender` over the `owner` s tokens.
     *
     * This internal function is equivalent to `approve`, and can be used to
     * e.g. set automatic allowances for certain subsystems, etc.
     *
     * Emits an {Approval} event.
     *
     * Requirements:
     *
     * - `owner` cannot be the zero address.
     * - `spender` cannot be the zero address.
     */
    function _approve(
        address owner,
        address spender,
        uint256 amount
    ) internal virtual {
        if (owner == ZERO_ADDRESS) {
            revert OwnerIsZeroAddress();
        }
        if (spender == ZERO_ADDRESS) {
            revert SpenderIsZeroAddress();
        }

        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }

    /**
     * @dev Spend `amount` form the allowance of `owner` toward `spender`.
     *
     * Does not update the allowance amount in case of infinite allowance.
     * Revert if not enough allowance is available.
     *
     * Might emit an {Approval} event.
     */
    function _spendAllowance(
        address owner,
        address spender,
        uint256 amount
    ) internal virtual {
        uint256 currentAllowance = _allowances[owner][spender];
        if (currentAllowance != type(uint256).max) {
            if (currentAllowance < amount) {
                revert InsufficientAllowance();
            }
            unchecked {
                _approve(owner, spender, currentAllowance - amount);
            }
        }
    }
}
