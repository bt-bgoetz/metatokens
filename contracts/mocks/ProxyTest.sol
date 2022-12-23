// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.13;

import "../openzeppelin/contracts/utils/Address.sol";

import "hardhat/console.sol";

contract ProxiedMainMock {
    using Address for address;

    uint256 _value;
    uint256 _gotValue;

    function mainGotSetter(address target) external {
        bytes memory callData = abi.encodeWithSelector(ProxiedDelegateMock.delegatedGet.selector);
        bytes memory returndata = target.functionDelegateCall(callData);
        _gotValue = abi.decode(returndata, (uint256));
    }

    function mainGot() external view returns (uint256) {
        return _gotValue;
    }

    function mainGet() external view returns (uint256) {
        return _value;
    }

    function mainSet(uint256 newVal) external {
        _value = newVal;
    }

    function mainSetDelegated(address target, uint256 newVal) external {
        bytes memory callData = abi.encodeWithSelector(ProxiedDelegateMock.delegatedSet.selector, newVal);
        target.functionDelegateCall(callData);
    }

    function logIt() external view {
        console.log("ProxiedMainMock.mainGotSetter %s", address(uint160(uint256(bytes32(ProxiedMainMock.mainGotSetter.selector) >> 224))));
        console.log("ProxiedMainMock.mainGot %s", address(uint160(uint256(bytes32(ProxiedMainMock.mainGot.selector) >> 224))));
        console.log("ProxiedMainMock.mainGet %s", address(uint160(uint256(bytes32(ProxiedMainMock.mainGet.selector) >> 224))));
        console.log("ProxiedMainMock.mainSet %s", address(uint160(uint256(bytes32(ProxiedMainMock.mainSet.selector) >> 224))));
        console.log("ProxiedMainMock.mainSetDelegated %s", address(uint160(uint256(bytes32(ProxiedMainMock.mainSetDelegated.selector) >> 224))));
        console.log("ProxiedMainMock.logIt %s", address(uint160(uint256(bytes32(ProxiedMainMock.logIt.selector) >> 224))));
        
        console.log("ProxiedDelegateMock.delegatedGet %s", address(uint160(uint256(bytes32(ProxiedDelegateMock.delegatedGet.selector) >> 224))));
        console.log("ProxiedDelegateMock.delegatedSet %s", address(uint160(uint256(bytes32(ProxiedDelegateMock.delegatedSet.selector) >> 224))));
    }
}

contract ProxiedDelegateMock {
    using Address for address;

    uint256 _value;

    function delegatedGet() external view returns (uint256) {
        return _value;
    }

    function delegatedSet(uint256 newVal) external  {
        _value = newVal;
    }
}