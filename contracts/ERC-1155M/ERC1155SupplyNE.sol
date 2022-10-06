// SPDX-License-Identifier: MIT

pragma solidity ^0.8.13;

// This does not fully conform to EIP-1155:
// - Does not emit TransferSingle, TransferBatch events.
// - Does not implement 

import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/IERC1155MetadataURI.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "../openzeppelin/contracts/utils/Address.sol";

import "./IERC1155Supply.sol";

address constant ZERO_ADDRESS = address(0);

error ArrayLengthMismatch();
error CallerNotOwnerNorApproved();
error ERC1155ReceiverRejectedTokens();
error NonERC1155ReceiverImplementer();
error SettingApprovalForSelf();
error ZeroAddress();

/**
 * @dev Implementation of the basic standard multi-token.
 * See https://eips.ethereum.org/EIPS/eip-1155
 * Originally based on code by Enjin: https://github.com/enjin/erc-1155
 *
 * Fork of OpenZeppelin's ERC1155Supply:
 * - Uses custom error messages instead of strings.
 * - Does not emit any events.
 * - Does not implement safeTransferFrom, safeBatchTransferFrom,
 */
abstract contract ERC1155SupplyNE is Context, ERC165, IERC1155, IERC1155MetadataURI, IERC1155Supply {
    using Address for address;

    // Mapping from token ID to account balances
    mapping(uint256 => mapping(address => uint256)) private _balances;

    // Mapping from account to operator approvals
    mapping(address => mapping(address => bool)) private _operatorApprovals;

    // The total supply of each issued token.
    mapping(uint256 => uint256) private _totalSupply;

    // Used as the URI for all token types by relying on ID substitution, e.g. https://token-cdn-domain/{id}.json
    string private _uri;

    /**
     * @dev See {IERC165-supportsInterface}.
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165, IERC165) returns (bool) {
        return
            interfaceId == type(IERC1155).interfaceId ||
            interfaceId == type(IERC1155MetadataURI).interfaceId ||
            interfaceId == type(IERC1155Supply).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    /**
     * @dev See {IERC1155MetadataURI-uri}.
     *
     * Get the base URI that all token types share.
     */
    function baseURI() public view virtual returns (string memory) {
        return _uri;
    }

    /**
     * @dev See {IERC1155MetadataURI-uri}.
     *
     * This implementation returns the same URI for *all* token types. It relies
     * on the token type ID substitution mechanism
     * https://eips.ethereum.org/EIPS/eip-1155#metadata[defined in the EIP].
     *
     * Clients calling this function must replace the `\{id\}` substring with the
     * actual token type ID.
     */
    function uri(uint256) public view virtual override returns (string memory) {
        return _uri;
    }

    /**
     * @dev Sets a new URI for all token types, by relying on the token type ID
     * substitution mechanism
     * https://eips.ethereum.org/EIPS/eip-1155#metadata[defined in the EIP].
     *
     * By this mechanism, any occurrence of the `\{id\}` substring in either the
     * URI or any of the amounts in the JSON file at said URI will be replaced by
     * clients with the token type ID.
     *
     * For example, the `https://token-cdn-domain/\{id\}.json` URI would be
     * interpreted by clients as
     * `https://token-cdn-domain/000000000000000000000000000000000000000000000000000000000004cce0.json`
     * for token type ID 0x4cce0.
     *
     * See {uri}.
     *
     * Because these URIs cannot be meaningfully represented by the {URI} event,
     * this function emits no events.
     */
    function _setURI(string memory newuri) internal virtual {
        _uri = newuri;
    }


    // Balances //

    /**
     * @dev See {IERC1155-balanceOf}.
     *
     * Requirements:
     *
     * - `account` cannot be the zero address.
     */
    function balanceOf(address account, uint256 id) public view virtual override returns (uint256) {
        if (account == ZERO_ADDRESS) {
            revert ZeroAddress();
        }

        return _balances[id][account];
    }

    /**
     * @dev See {IERC1155-balanceOfBatch}.
     *
     * Requirements:
     *
     * - `accounts` and `ids` must have the same length.
     */
    function balanceOfBatch(
        address[] memory accounts,
        uint256[] memory ids
    ) public view virtual override returns (uint256[] memory) {
        if (accounts.length != ids.length) {
            revert ArrayLengthMismatch();
        }

        uint256[] memory batchBalances = new uint256[](accounts.length);

        for (uint256 i = 0; i < accounts.length; ++i) {
            batchBalances[i] = balanceOf(accounts[i], ids[i]);
        }

        return batchBalances;
    }

    /**
     * @dev Indicates whether any token exist with a given id, or not.
     */
    function exists(uint256 id) public view virtual returns (bool) {
        return ERC1155SupplyNE.totalSupply(id) > 0;
    }

    /**
     * @dev Total amount of tokens in with a given id.
     */
    function totalSupply(uint256 id) public view virtual returns (uint256) {
        return _totalSupply[id];
    }


    // Approvals //

    /**
     * @dev See {IERC1155-isApprovedForAll}.
     */
    function isApprovedForAll(address account, address operator) public view virtual override returns (bool) {
        return _operatorApprovals[account][operator];
    }

    /**
     * @dev See {IERC1155-setApprovalForAll}.
     */
    function setApprovalForAll(address operator, bool approved) public virtual override {
        _setApprovalForAll(_msgSender(), operator, approved);
    }

    /**
     * @dev Approve `operator` to operate on all of `owner` tokens
     *
     * Emits a {ApprovalForAll} event.
     */
    function _setApprovalForAll(
        address owner,
        address operator,
        bool approved
    ) internal virtual {
        if (owner == operator) {
            revert SettingApprovalForSelf();
        }

        _operatorApprovals[owner][operator] = approved;

        emit ApprovalForAll(owner, operator, approved);
    }


    // Transfers //

    /**
     * @dev Destroys `amount` tokens of token type `id` from `from`
     *
     * Requirements:
     *
     * - `from` cannot be the zero address.
     * - `from` must have at least `amount` tokens of token type `id`.
     */
    function _burnSingle(
        address from,
        uint256 id,
        uint256 amount
    ) internal virtual {
        if (from == ZERO_ADDRESS) {
            revert ZeroAddress();
        }

        uint256 fromBalance = _balances[id][from];
        if (fromBalance < amount) {
            revert InsufficientBalance();
        }

        unchecked {
            _balances[id][from] = fromBalance - amount;
            _totalSupply[id] -= amount;
        }
    }

    /**
     * @dev Creates `amount` tokens of token type `id`, and assigns them to `to`.
     *
     * Requirements:
     *
     * - `to` cannot be the zero address.
     * - If `to` refers to a smart contract, it must implement {IERC1155Receiver-onERC1155Received} and return the
     * acceptance magic value.
     */
    function _mintSingle(
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) internal virtual {
        if (to == ZERO_ADDRESS) {
            revert ZeroAddress();
        }

        _balances[id][to] += amount;
        _totalSupply[id] += amount;

        // We allow this contract to be an owner of any of its tokens, without extra checks.
        if (to != address(this) && to.isContract()) {
            _doSafeTransferAcceptanceCheck(ZERO_ADDRESS, to, id, amount, data);
        }
    }

    /**
     * @dev Transfers `amount` tokens of token type `id` from `from` to `to`.
     *
     * Requirements:
     *
     * - `to` cannot be the zero address.
     * - `from` must have a balance of tokens of type `id` of at least `amount`.
     * - If `to` refers to a smart contract, it must implement {IERC1155Receiver-onERC1155Received} and return the
     * acceptance magic value.
     */
    function _safeTransferFromSingle(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) internal virtual {
        if (from != _msgSender() && !isApprovedForAll(from, _msgSender())) {
            revert CallerNotOwnerNorApproved();
        }

        if (to == ZERO_ADDRESS) {
            revert ZeroAddress();
        }

        uint256 fromBalance = _balances[id][from];
        if (fromBalance < amount) {
            revert InsufficientBalance();
        }
        
        unchecked {
            _balances[id][from] = fromBalance - amount;
        }
        _balances[id][to] += amount;

        // We allow this contract to be an owner of any of its tokens, without extra checks.
        if (to != address(this) && to.isContract()) {
            _doSafeTransferAcceptanceCheck(from, to, id, amount, data);
        }
    }

    /**
     * @dev Ensures that transfers (including mints) are either to ERC1155Receiver contracts or externally-
     * -owned-accounts (inasmuch as they can be identified).
     */
    function _doSafeTransferAcceptanceCheck(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) private {
        try IERC1155Receiver(to).onERC1155Received(_msgSender(), from, id, amount, data) returns (bytes4 response) {
            if (response != IERC1155Receiver.onERC1155Received.selector) {
                revert ERC1155ReceiverRejectedTokens();
            }
        } catch Error(string memory reason) {
            revert(reason);
        } catch {
            revert NonERC1155ReceiverImplementer();
        }
    }
}
