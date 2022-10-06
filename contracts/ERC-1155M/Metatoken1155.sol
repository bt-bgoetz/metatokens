// SPDX-License-Identifier: MIT

pragma solidity ^0.8.13;

import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

import "./IMetatoken1155.sol";

address constant ZERO_ADDRESS = address(0);

error AddressMismatch(address, address, address, address);
error ZeroAddress();

abstract contract Metatoken1155 is ERC165, IMetatoken1155 {
    /// @dev These must match exactly with the corresponding ERC-1155M contract.
    // contracts/ERC-1155M/ERC1155SupplyNE.sol:ERC1155SupplyNE
    mapping(uint256 => mapping(address => uint256)) private _balances;
    mapping(address => mapping(address => bool)) private _operatorApprovals;
    mapping(uint256 => uint256) private _totalSupply;
    string private _uri;
    // @openzeppelin/contracts/security/ReentrancyGuard.sol:ReentrancyGuard
    uint256 private _status;
    // contracts/ERC-1155M/ERC1155M.sol:ERC1155M
    mapping(IMetatoken1155 => bytes4) private _metatokenDetails;
    mapping(uint256 => bool) private _allowedMetatokenSelectors;
    IMetatoken1155[] private _nftHookBurnExtensions;
    IMetatoken1155[] private _nftHookMintExtensions;
    IMetatoken1155[] private _nftHookTransferExtensions;
    IMetatoken1155 private _currentMetatoken;
    mapping(IMetatoken1155 => IMetatoken1155) private _metatokenAddresses;

    // Ensures that the token's metatoken address is this contract's address.
    modifier isOwnMetatoken(uint256 id) {
        if (address(uint160(id >> TOKEN_ADDRESS_SHIFT)) != address(_currentMetatoken)) {
            revert AddressMismatch(address(uint160(id >> TOKEN_ADDRESS_SHIFT)), address(_currentMetatoken), address(this), msg.sender);
        }
        _;
    }

    /**
     * @dev See {IERC165-supportsInterface}.
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165, IERC165) returns (bool) {
        return
            interfaceId == type(IMetatoken1155).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    /////////////////
    /// ERC-1155M ///
    ///////////////// 

    /**
     * @dev See {IERC1155-balanceOf}.
     *
     * Requirements:
     *
     * - `account` cannot be the zero address.
     */
    function balanceOf(address account, uint256 id) internal view returns (uint256) {
        if (account == ZERO_ADDRESS) {
            revert ZeroAddress();
        }

        return _balances[id][account];
    }

    /**
     * @dev Returns the currently executing metatoken extension.
     */
    function currentMetatoken() internal view returns (IMetatoken1155) {
        return _currentMetatoken;
    }

    /**
     * @dev Returns the currently executing metatoken extension's ID offset.
     */
    function currentMetatokenId() internal view returns (uint256) {
        return uint256(uint160(address(_currentMetatoken))) << TOKEN_ADDRESS_SHIFT;
    }

    /**
     * @dev Total amount of tokens in with a given id.
     */
    function totalSupply(uint256 id) internal view returns (uint256) {
        return _totalSupply[id];
    }
    
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
        address /* from */,
        uint256 /* id */,
        uint256 /* amount */
    ) external view virtual override {
        // Hook is unused.
    }

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
        address /* to */,
        uint256 /* id */,
        uint256 /* amount */,
        bytes memory /* data */
    ) external view virtual override {
        // Hook is unused.
    }

    /**
     * @dev Called prior to the transfer of the root NFT.
     *
     * This should not modify state as it is used solely as a test for invariance prior to the
     * transferring of an NFT.
     *
     * Example: Checking to make sure the metatoken has the correct amount before transferring it.
     */
    function beforeTransfer(
        address /* from */,
        address /* to */,
        uint256 /* id */,
        uint256 /* amount */,
        bytes memory /* data */
    ) external view virtual override {
        // Hook is unused.
    }

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
        address /* from */,
        uint256 /* id */,
        uint256 /* amount */
    ) external override virtual {
        // Hook is unused.
    }

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
        address /* to */,
        uint256 /* id */,
        uint256 /* amount */,
        bytes memory /* data */
    ) external override virtual {
        // Hook is unused.
    }

    /**
     * @dev Called prior to the transfer of the root NFT.
     *
     * This may modify state if necessary, however it must also test for invariances after the
     * transferring of an NFT.
     *
     * Example: Checking to make sure secondary addresses associated with the metatoken are updated.
     */
    function afterTransfer(
        address /* from */,
        address /* to */,
        uint256 /* id */,
        uint256 /* amount */,
        bytes memory /* data */
    ) external override virtual {
        // Hook is unused.
    }

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
        address /* from */,
        uint256 /* id */,
        uint256 /* amount */
    ) external view virtual override {
        // Hook is unused.
    }

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
        address /* to */,
        uint256 /* id */,
        uint256 /* amount */,
        bytes memory /* data */
    ) external view virtual override {
        // Hook is unused.
    }

    /**
     * @dev Called prior to the transfer of the metatoken.
     *
     * This should not modify state as it is used solely as a test for invariance prior to the
     * transferring of a metatoken.
     *
     * Example: Checking to make sure the metatoken has the correct amount before transferring it.
     */
    function preMetaTransfer(
        address /* from */,
        address /* to */,
        uint256 /* id */,
        uint256 /* amount */,
        bytes memory /* data */
    ) external view virtual override {
        // Hook is unused.
    }

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
        address /* from */,
        uint256 /* id */,
        uint256 /* amount */
    ) external override virtual {
        // Hook is unused.
    }

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
        address /* to */,
        uint256 /* id */,
        uint256 /* amount */,
        bytes memory /* data */
    ) external override virtual {
        // Hook is unused.
    }

    /**
     * @dev Called prior to the transfer of the metatoken.
     *
     * This may modify state if necessary, however it must also test for invariances after the
     * transferring of a metatoken.
     *
     * Example: Checking to make sure secondary addresses associated with the metatoken are updated.
     */
    function postMetaTransfer(
        address /* from */,
        address /* to */,
        uint256 /* id */,
        uint256 /* amount */,
        bytes memory /* data */
    ) external override virtual {
        // Hook is unused.
    }
}
