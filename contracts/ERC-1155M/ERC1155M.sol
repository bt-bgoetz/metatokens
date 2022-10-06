// SPDX-License-Identifier: MIT

pragma solidity ^0.8.13;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./ERC1155SupplyNE.sol";
import "./IERC1155M.sol";

// ERC1155M Errors
error ImplementationAlreadySet();
error IsImplementation();
error IsNotImplementation();
error MetatokenAlreadyDisabled();
error MetatokenAlreadyEnabled();
error MetatokenAlreadyRegistered();
error MetatokenNotEnabled();
error NoRegisteredMetatoken();
error NotApprovedForTransfer();
error NotValidMetatoken();
error NotAllowedMetatokenSelector();
error NonZeroHooksRequired();

// Metatoken Errors
error AddressMismatch();

contract ERC1155M is ERC1155SupplyNE, IERC1155M, ReentrancyGuard {
    using Address for address;

    //////////////////
    /// Metatokens ///
    //////////////////

    // Possible metatoken statuses.
    uint16 constant M_STATUS_REGISTERED = 0x1;
    uint16 constant M_STATUS_IS_IMPLEMENTATION = 0x2;
    uint16 constant M_STATUS_ENABLED = 0x4;

    // The details for each registered metatoken.
    mapping(IMetatoken1155 => MetatokenDetails) private _metatokenDetails;
    // The allowed proxied function selectors for each registered metatoken.
    mapping(uint256 => bool) private _allowedMetatokenSelectors;

    // Which NFT hooks are enabled for each registered metatoken.
    IMetatoken1155[] private _nftHookBurnExtensions;
    IMetatoken1155[] private _nftHookMintExtensions;
    IMetatoken1155[] private _nftHookTransferExtensions;

    // The currently executing metatoken.
    IMetatoken1155 private _currentMetatoken;

    // Used to update the implementation address for a given metatoken. By default this is
    // the same as the initial address. The implementation address will only be used when
    // executing the delegate calls, in all other cases the original metatoken address will
    // be used. If a metatoken's implementation address is updated, the updated address
    // is permanently denylisted from registration as a metatoken to prevent unintentional
    // or malicious misuse of the address.
    //
    // Should only be read via _getMetatokenImplementation().
    mapping(IMetatoken1155 => IMetatoken1155) private _metatokenAddresses;

    /**
     * @dev Ensures that a metatoken's status matches the provided bit flag.
     *
     * @param status must be a valid metatoken status (see above).
     */
    function _metatokenStatusIs(uint16 metatokenStatus, uint16 status) internal pure returns (bool) {
        return (metatokenStatus & status) == status;
    }

    /**
     * @dev Sets the appropriate bit flag for a given metatoken's status.
     *
     * @param status must be a valid metatoken status (see above), or combination of statuses.
     */
    function _setMetatokenStatus(IMetatoken1155 metatoken, uint16 status) internal {
        _metatokenDetails[metatoken].status |= status;
    }

    /**
     * @dev Clears the appropriate bit flag for a given metatoken's status.
     *
     * @param status must be a valid metatoken status (see above), or combination of statuses.
     */
    function _unsetMetatokenStatus(IMetatoken1155 metatoken, uint16 status) internal {
        _metatokenDetails[metatoken].status &= ~status;
    }

    /**
     * @dev Returns the details for the provided metatoken extension.
     *
     * Returns:
     * - Metatoken status
     * - Metatoken hooks
     */
    function getMetatokenDetails(IMetatoken1155 metatoken) external view returns (MetatokenDetails memory) {
        return _metatokenDetails[metatoken];
    }

    /**
     * @dev Returns the true metatoken address for a given registered metatoken address.
     *
     * Assumes that the metatoken is registered and enabled.
     */
    function _getMetatokenImplementation(IMetatoken1155 metatoken) internal view returns (IMetatoken1155) {
        IMetatoken1155 trueAddress = _metatokenAddresses[metatoken];
        
        if (address(trueAddress) == ZERO_ADDRESS) {
            return metatoken;
        }

        return trueAddress;
    }

    /**
     * @dev Returns the true metatoken address for a given registered metatoken address.
     */
    function getMetatokenImplementation(IMetatoken1155 metatoken) external view returns (IMetatoken1155) {
        // Validate the call is allowed.
        uint16 status = (_metatokenDetails[IMetatoken1155(metatoken)]).status;
        if (!_metatokenStatusIs(status, M_STATUS_REGISTERED)) {
            revert NoRegisteredMetatoken();
        }
        if (_metatokenStatusIs(status, M_STATUS_IS_IMPLEMENTATION)) {
            revert IsImplementation();
        }

        return _getMetatokenImplementation(metatoken);
    }

    /**
     * @dev Enable a prevously disabled metatoken extension.
     *
     * It is not recommended for metatokens to be re-enabled after they have been disabled,
     * as any intermediate transactions could potentially violate any constraints the metatoken
     * would place on the contract.
     */
    function _enableMetatoken(IMetatoken1155 metatoken) internal {
        // Validate the call is allowed.
        uint16 status = (_metatokenDetails[IMetatoken1155(metatoken)]).status;
        if (!_metatokenStatusIs(status, M_STATUS_REGISTERED)) {
            revert NoRegisteredMetatoken();
        }
        if (_metatokenStatusIs(status, M_STATUS_IS_IMPLEMENTATION)) {
            revert IsImplementation();
        }
        if (_metatokenStatusIs(status, M_STATUS_ENABLED)) {
            revert MetatokenAlreadyEnabled();
        }

        // Enable the metatoken.
        _setMetatokenStatus(metatoken, M_STATUS_ENABLED);

        // Enable the hooks. We pull from the external contract in case there was an update.
        _updateMetatokenHooks(metatoken, metatoken.metatokenHooks());
    }

    /**
     * @dev Disable a previously registered metatoken extension.
     */
    function _disableMetatoken(IMetatoken1155 metatoken) internal {
        // Validate the call is allowed.
        uint16 status = (_metatokenDetails[IMetatoken1155(metatoken)]).status;
        if (!_metatokenStatusIs(status, M_STATUS_REGISTERED)) {
            revert NoRegisteredMetatoken();
        }
        if (_metatokenStatusIs(status, M_STATUS_IS_IMPLEMENTATION)) {
            revert IsImplementation();
        }
        if (!_metatokenStatusIs(status, M_STATUS_ENABLED)) {
            revert MetatokenAlreadyDisabled();
        }

        // Disable the metatoken.
        _unsetMetatokenStatus(metatoken, M_STATUS_ENABLED);

        // Disable the hooks.
        _updateMetatokenHooks(metatoken, 0x0);
    }

    /**
     * @dev Register a metatoken extension.
     *
     * DO NOT REGISTER EXTENSIONS WITHOUT FULL UNDERSTANDING AND / OR CONTROL OF IT
     * DO NOT REGISTER PROXIED METATOKENS IF THE ERC1155M IS PROXIED
     * DO NOT REGISTER PROXIED METATOKENS UNLESS YOU FULLY CONTROL THE PROXY
     */
    function _registerMetatoken(IMetatoken1155 metatoken, bool enabled) internal {
        // Validate the call is allowed.
        if (!metatoken.supportsInterface(type(IMetatoken1155).interfaceId)) {
            revert NotValidMetatoken();
        }
        uint16 status = (_metatokenDetails[IMetatoken1155(metatoken)]).status;
        if (_metatokenStatusIs(status, M_STATUS_REGISTERED)) {
            revert MetatokenAlreadyRegistered();
        }

        // Register the metatoken.
        _setMetatokenStatus(metatoken, M_STATUS_REGISTERED);

        if (enabled) {
            _enableMetatoken(metatoken);
        }
    }

    /**
     * @dev Updates the implementation address for a metatoken.
     *
     * A given implementation address can be used for multiple metatokens, however no implementation
     * address can be registered as its own metatoken.
     *
     * DO NOT REGISTER EXTENSIONS WITHOUT FULL UNDERSTANDING AND / OR CONTROL OF IT
     * DO NOT REGISTER PROXIED METATOKENS IF THE ERC1155M IS PROXIED
     * DO NOT REGISTER PROXIED METATOKENS UNLESS YOU FULLY CONTROL THE PROXY
     */
    function _updateMetatokenImplementation(IMetatoken1155 metatoken, IMetatoken1155 implementation) internal {
        // Validate the call is allowed.
        IMetatoken1155 existingImplementation = IMetatoken1155(_getMetatokenImplementation(metatoken));
        if (implementation == existingImplementation) {
            revert ImplementationAlreadySet();
        }
        uint16 metatokenStatus = (_metatokenDetails[IMetatoken1155(metatoken)]).status;
        if (!_metatokenStatusIs(metatokenStatus, M_STATUS_REGISTERED)) {
            revert NoRegisteredMetatoken();
        }
        // Be able to revert.
        if (metatoken != implementation) {
            uint16 implementationStatus = (_metatokenDetails[IMetatoken1155(implementation)]).status;
            bool isRegistered = _metatokenStatusIs(implementationStatus, M_STATUS_REGISTERED);
            if (isRegistered && !_metatokenStatusIs(implementationStatus, M_STATUS_IS_IMPLEMENTATION)) {
                revert IsNotImplementation();
            }
            if (!isRegistered && !implementation.supportsInterface(type(IMetatoken1155).interfaceId)) {
                revert NotValidMetatoken();
            }

            // The implementation wasn't previously registered, so register it and denylist it.
            if (!isRegistered) {
                _setMetatokenStatus(implementation, M_STATUS_REGISTERED | M_STATUS_IS_IMPLEMENTATION);
            }
        }
        
        // Update the implementation address.
        _metatokenAddresses[metatoken] = implementation;
    }
    
    /**
     * @dev Updates the registered hooks for a given metatoken.
     */
    function _updateMetatokenHooks(IMetatoken1155 metatoken, uint16 enabledHooks) internal {
        MetatokenDetails memory details = _metatokenDetails[metatoken];
        uint16 status = details.status;
        if (!_metatokenStatusIs(status, M_STATUS_REGISTERED)) {
            revert NoRegisteredMetatoken();
        }
        if (_metatokenStatusIs(status, M_STATUS_IS_IMPLEMENTATION)) {
            revert IsImplementation();
        }
        if (!_metatokenStatusIs(status, M_STATUS_ENABLED)) {
            revert MetatokenNotEnabled();
        }
        if (enabledHooks == 0) {
            revert NonZeroHooksRequired();
        }

        uint16 currentHooks = details.hooks;
        _metatokenDetails[metatoken].hooks = enabledHooks;
        uint256 i;
        uint256 count;

        // Burning the NFT token.
        bool usedToBe = (currentHooks & CAT_HAS_HOOK_NFT_BURN) == CAT_HAS_HOOK_NFT_BURN;
        bool shouldBe = (enabledHooks & CAT_HAS_HOOK_NFT_BURN) == CAT_HAS_HOOK_NFT_BURN;
        if (!usedToBe && shouldBe) {
            _nftHookBurnExtensions.push(metatoken);
        } else if (usedToBe && !shouldBe) {
            // Pop and swap the hooks.
            count = _nftHookBurnExtensions.length;
            for (i; i < count; i++) {
                if (_nftHookBurnExtensions[i] == metatoken) {
                    // This metatoken is not the last in its category, so we need to swap in the last element.
                    if (i < count - 1) {
                        _nftHookBurnExtensions[i] = _nftHookBurnExtensions[count - 1];
                    }
                    _nftHookBurnExtensions.pop();
                    break;
                }
            }
        }

        // Minting the NFT token.
        usedToBe = (currentHooks & CAT_HAS_HOOK_NFT_MINT) == CAT_HAS_HOOK_NFT_MINT;
        shouldBe = (enabledHooks & CAT_HAS_HOOK_NFT_MINT) == CAT_HAS_HOOK_NFT_MINT;
        if (!usedToBe && shouldBe) {
            _nftHookMintExtensions.push(metatoken);
        } else if (usedToBe && !shouldBe) {
            // Pop and swap the hooks.
            count = _nftHookMintExtensions.length;
            for (i; i < count; i++) {
                if (_nftHookMintExtensions[i] == metatoken) {
                    // This metatoken is not the last in its category, so we need to swap in the last element.
                    if (i < count - 1) {
                        _nftHookMintExtensions[i] = _nftHookMintExtensions[count - 1];
                    }
                    _nftHookMintExtensions.pop();
                    break;
                }
            }
        }

        // Transferring the NFT token.
        usedToBe = (currentHooks & CAT_HAS_HOOK_NFT_TRANSFER) == CAT_HAS_HOOK_NFT_TRANSFER;
        shouldBe = (enabledHooks & CAT_HAS_HOOK_NFT_TRANSFER) == CAT_HAS_HOOK_NFT_TRANSFER;
        if (!usedToBe && shouldBe) {
            _nftHookTransferExtensions.push(metatoken);
        } else if (usedToBe && !shouldBe) {
            // Pop and swap the hooks.
            count = _nftHookTransferExtensions.length;
            for (i; i < count; i++) {
                if (_nftHookTransferExtensions[i] == metatoken) {
                    // This metatoken is not the last in its category, so we need to swap in the last element.
                    if (i < count - 1) {
                        _nftHookTransferExtensions[i] = _nftHookTransferExtensions[count - 1];
                    }
                    _nftHookTransferExtensions.pop();
                    break;
                }
            }
        }
    }

    /**
     * @dev Adds the provided selectors to the allowlist for proxying.
     *
     * The highest-order bytes20 are the metatoken address, the lowest order bytes4 is the proxied
     * function selector.
     */
    function _allowMetatokenSelectors(uint256[] calldata selectors) internal {
        uint256 count = selectors.length;
        for (uint256 i; i < count; i ++) {
            _allowedMetatokenSelectors[selectors[i]] = true;
        }
    }

    /**
     * @dev Removes the provided selectors to the allowlist for proxying.
     *
     * The highest-order bytes20 are the metatoken address, the lowest order bytes4 is the proxied
     * function selector.
     */
    function _denyMetatokenSelectors(uint256[] calldata selectors) internal {
        uint256 count = selectors.length;
        for (uint256 i; i < count; i ++) {
            _allowedMetatokenSelectors[selectors[i]] = false;
        }
    }

    /**
     * @dev Checks if the provided selector is in the allowlist.
     */
    function isProxiedSelectorAllowed(uint256 selector) external view returns (bool) {
        return _allowedMetatokenSelectors[selector];
    }

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
    ) external returns (bytes memory) {
        // Validate the call is allowed.
        uint16 status = (_metatokenDetails[IMetatoken1155(metatoken)]).status;
        if (!_metatokenStatusIs(status, M_STATUS_REGISTERED)) {
            revert NoRegisteredMetatoken();
        }
        if (!_metatokenStatusIs(status, M_STATUS_ENABLED)) {
            revert MetatokenNotEnabled();
        }
        if (
            !_allowedMetatokenSelectors[
                // Get t-
                (uint256(uint160(address(_getMetatokenImplementation(IMetatoken1155(metatoken))))) << TOKEN_ADDRESS_SHIFT) | uint32(selector)
            ]
        ) {
            revert NotAllowedMetatokenSelector();
        }

        // Do not do any encoding on the data if it is a raw request, other than adding the selector to the front.
        bytes memory callData;
        if (options & PROXY_SEND_RAW == PROXY_SEND_RAW) {
            callData = abi.encodePacked(selector, data);
        } else {
            callData = abi.encodeWithSelector(selector, data);
        }

        // Call the proxied function.
        bytes memory result = address(metatoken).functionDelegateCall(callData);

        return result;
    }

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
    ) external view returns (bytes memory) {
        // Normally we would include the metatoken address and sender.
        bytes memory callData;
        if (options & PROXY_INCLUDE_SENDER == PROXY_INCLUDE_SENDER) {
            // If this is a raw request, don't encode the data.
            if (options & PROXY_SEND_RAW == PROXY_SEND_RAW) {
                callData = abi.encodePacked(
                    // We still need to encode the metatoken and sender though.
                    abi.encode(
                        metatoken,
                        msg.sender
                    ),
                    data
                );
            } else {
                callData = abi.encode(
                    metatoken,
                    msg.sender,
                    data
                );
            }
        } else {
            callData = data;
        }

        return address(this).functionStaticCall(abi.encodeWithSelector(
            // bytes4(keccak256("proxyMetatokenCall(address,bytes4,uint8,bytes)"))
            0x81638579,
            metatoken,
            // This is bytes4, but we need the padding that encodePacked() doesn't provide.
            selector,
            // Proxied view requests are always sent raw.
            PROXY_SEND_RAW,
            // Data for proxyMetatokenCall().
            callData
        ));
    }

    ///////////////
    /// ERC1155 ///
    ///////////////

    /**
     * @dev See {IERC1155-safeTransferFrom}.
     */
    function safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) public virtual override {
        if (from != _msgSender() && !isApprovedForAll(from, _msgSender())) {
            revert NotApprovedForTransfer();
        }

        uint256[] memory ids = new uint[](1);
        ids[0] = id;
        uint256[] memory amounts = new uint[](1);
        amounts[0] = amount;

        _transferTokens(from, to, ids, amounts, data);
    }

    /**
     * @dev See {IERC1155-safeBatchTransferFrom}.
     */
    function safeBatchTransferFrom(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) public virtual override {
        if (from != _msgSender() && !isApprovedForAll(from, _msgSender())) {
            revert NotApprovedForTransfer();
        }

        _transferTokens(from, to, ids, amounts, data);
    }


    /**
     * @dev Burns any number of tokens and/or metatokens. Each operation is handled sequentially.
     *
     * Emits a {TransferBatch} event for batch transfers and a {TransferSingle} event for single transfers.
     */
    function _burnTokens(
        address from,
        uint256[] memory ids,
        uint256[] memory amounts
    ) internal {
        if (from == ZERO_ADDRESS) {
            revert ZeroAddress();
        }

        bytes4[4] memory selectors = [
            IMetatoken1155.beforeBurn.selector,
            IMetatoken1155.afterBurn.selector,
            IMetatoken1155.preMetaBurn.selector,
            IMetatoken1155.postMetaBurn.selector
        ];

        _metatokenTransfer(from, ZERO_ADDRESS, ids, amounts, _nftHookBurnExtensions, CAT_HAS_HOOK_META_BURN, selectors, "");
    }

    /**
     * @dev Mints any number of tokens and/or metatokens. Each operation is handled sequentially.
     *
     * Emits a {TransferBatch} event for batch transfers and a {TransferSingle} event for single transfers.
     */
    function _mintTokens(
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal {
        if (to == ZERO_ADDRESS) {
            revert ZeroAddress();
        }

        bytes4[4] memory selectors = [
            IMetatoken1155.beforeMint.selector,
            IMetatoken1155.afterMint.selector,
            IMetatoken1155.preMetaMint.selector,
            IMetatoken1155.postMetaMint.selector
        ];

        _metatokenTransfer(ZERO_ADDRESS, to, ids, amounts, _nftHookMintExtensions, CAT_HAS_HOOK_META_MINT, selectors, data);
    }

    /**
     * @dev Transfers any number of tokens and/or metatokens. Each operation is handled sequentially.
     *
     * Emits a {TransferBatch} event for batch transfers and a {TransferSingle} event for single transfers.
     *
     * Requirements:
     *
     * - If `to` refers to a smart contract, it must implement {IERC1155Receiver-onERC1155BatchReceived} and return the
     * acceptance magic value.
     */
    function _transferTokens(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal {
        if (to == ZERO_ADDRESS) {
            revert ZeroAddress();
        }

        bytes4[4] memory selectors = [
            IMetatoken1155.beforeTransfer.selector,
            IMetatoken1155.afterTransfer.selector,
            IMetatoken1155.preMetaTransfer.selector,
            IMetatoken1155.postMetaTransfer.selector
        ];

        _metatokenTransfer(from, to, ids, amounts, _nftHookTransferExtensions, CAT_HAS_HOOK_META_TRANSFER, selectors, data);
    }

    /**
     * @dev Creates the calldata for the delegatecall for the hooks.
     */
    function _encodeHookSelector(
        bytes4 selector,
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) private pure returns (bytes memory) {
        // Minting
        if (from == ZERO_ADDRESS) {
            return abi.encodeWithSelector(selector, to, id, amount, data);
        }
        // Burning
        else if (to == ZERO_ADDRESS) {
            return abi.encodeWithSelector(selector, from, id, amount);
        }
        // Transferring
        else {
            return abi.encodeWithSelector(selector, from, to, id, amount, data);
        }
    }

    function _metatokenTransfer(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        IMetatoken1155[] storage nftHookExtensions,
        uint256 metatokenHooksMask,
        bytes4[4] memory selectors,
        bytes memory data
    ) private nonReentrant {
        if (ids.length != amounts.length) {
            revert ArrayLengthMismatch();
        }

        MetatokenDetails memory metatokenDetails;

        // Check each token.
        for (uint256 i; i < ids.length; i++) {
            // Check to see if this is a metatoken.
            address metatokenAddress = address(uint160(ids[i] >> TOKEN_ADDRESS_SHIFT));

            // It's an NFT, so run the pre-NFT transfers.
            if (ids[i] & TOKEN_ADDRESS_MASK == 0) {
                // Run all the preaction checks.
                bytes memory callData = _encodeHookSelector(selectors[0], from, to, ids[i], amounts[i], data);
                for (uint256 j; j < nftHookExtensions.length; j++) {
                    _currentMetatoken = nftHookExtensions[j];
                    address(nftHookExtensions[j]).functionDelegateCall(callData);
                }

                // Mint the token.
                if (from == ZERO_ADDRESS) {
                    _mintSingle(to, ids[i], amounts[i], data);
                }
                // Burn the token.
                else if (to == ZERO_ADDRESS) {
                    _burnSingle(from, ids[i], amounts[i]);
                }
                // Transfer the token.
                else {
                    _safeTransferFromSingle(from, to, ids[i], amounts[i], data);
                }

                // Run all the postaction checks.
                callData = _encodeHookSelector(selectors[1], from, to, ids[i], amounts[i], data);
                for (uint256 j; j < nftHookExtensions.length; j++) {
                    _currentMetatoken = nftHookExtensions[j];
                    address(nftHookExtensions[j]).functionDelegateCall(callData);
                }
            }

            else {
                address metatokenImplementation = address(_getMetatokenImplementation(IMetatoken1155(metatokenAddress)));
                metatokenDetails = _metatokenDetails[IMetatoken1155(metatokenAddress)];
                uint16 metatokenStatus = metatokenDetails.status;
                // We can't handle tokens for non-registered metatokens.
                if (!_metatokenStatusIs(metatokenStatus, M_STATUS_REGISTERED)) {
                    revert NoRegisteredMetatoken();
                }
                // We can't handle tokens for disabled metatokens.
                if (!_metatokenStatusIs(metatokenStatus, M_STATUS_ENABLED)) {
                    revert MetatokenNotEnabled();
                }

                // This metatoken extension is enabled for its own hooks.
                if (metatokenDetails.hooks & metatokenHooksMask == metatokenHooksMask) {
                    _currentMetatoken = IMetatoken1155(metatokenAddress);

                    // Run the preaction check.
                    metatokenImplementation.functionDelegateCall(
                        _encodeHookSelector(selectors[2], from, to, ids[i], amounts[i], data)
                    );

                    // Mint the token.
                    if (from == ZERO_ADDRESS) {
                        _mintSingle(to, ids[i], amounts[i], data);
                    }
                    // Burn the token.
                    else if (to == ZERO_ADDRESS) {
                        _burnSingle(from, ids[i], amounts[i]);
                    }
                    // Transfer the token.
                    else {
                        _safeTransferFromSingle(from, to, ids[i], amounts[i], data);
                    }

                    // Run the postaction check.
                    metatokenImplementation.functionDelegateCall(
                        _encodeHookSelector(selectors[3], from, to, ids[i], amounts[i], data)
                    );
                }
            }
        }

        // Reset for the refund.
        _currentMetatoken = IMetatoken1155(ZERO_ADDRESS);

        if (ids.length == 1) {
            emit TransferSingle(_msgSender(), from, to, ids[0], amounts[0]);
        } else {
            emit TransferBatch(_msgSender(), from, to, ids, amounts);
        }
    }
}
