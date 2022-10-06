import { CONTRACT } from "~/utils";

import * as accessControl from "./access/accessControl";
import * as address from "./utils/address";
import * as erc1155Supply from "./EIP1155/erc1155Supply";
import * as erc1155 from "./EIP1155/erc1155";

export function runTests() {
    CONTRACT("OpenZeppelin - Access Control", accessControl.test_AccessControl);
    CONTRACT("OpenZeppelin - Address", address.test_Address);
    CONTRACT("OpenZeppelin - ERC1155", erc1155.test_ERC1155);
    CONTRACT("OpenZeppelin - ERC1155Supply", erc1155Supply.test_ERC1155Supply);
}
