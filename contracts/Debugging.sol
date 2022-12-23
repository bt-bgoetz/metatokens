// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "hardhat/console.sol";

library debugging {
    function decodeDelegateCall() internal pure returns (bytes4) {
        bytes memory msgData = msg.data;
        bytes4 selector;
        assembly {
            selector := mload(add(msgData, 0x20))
        }

        return selector;
    }

    function decodeSelector(bytes4 selector) internal view {
        // BEGIN SELECTOR SWITCH
        if (selector == 0xfcb61c38) {
            console.log("ProxiedMainMock.mainGotSetter");
        } else if (selector == 0xc1c3205f) {
            console.log("ProxiedMainMock.mainGot");
        } else if (selector == 0x17e264f4) {
            console.log("ProxiedMainMock.mainGet");
        } else if (selector == 0x94deeff7) {
            console.log("ProxiedMainMock.mainSet");
        } else if (selector == 0x7a027f7f) {
            console.log("ProxiedMainMock.mainSetDelegated");
        } else if (selector == 0x76e16d7d) {
            console.log("ProxiedMainMock.logIt");
        } else if (selector == 0x108f6359) {
            console.log("ProxiedDelegateMock.delegatedGet");
        } else if (selector == 0x21764235) {
            console.log("ProxiedDelegateMock.delegatedSet");
        } else {
            console.log("UNKNOWN SELECTOR:");
            console.logBytes4(selector);
        }
        // END SELECTOR SWITCH
    }

    function addressDecoder(address target) internal pure returns (string memory) {
        if (target == address(0x5FbDB2315678afecb367f032d93F642f64180aa3)) {
            return "proxyAdmin";
        }
        if (target == address(0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512)) {
            return "mainContract";
        }
        if (target == address(0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0)) {
            return "delegateContract";
        }
        if (target == address(0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9)) {
            return "mainProxy";
        }
        if (target == address(0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9)) {
            return "delegateProxy";
        }

        return "Unknown address";
    }
}
