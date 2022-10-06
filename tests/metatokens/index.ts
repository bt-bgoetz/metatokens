import { BigNumber } from "ethers";
import { CONTRACT } from "~/utils";
import * as metatoken from "./metatoken";
import * as minting from "./minting";

export const TOKEN_ADDRESS_SHIFT = 96;
export const TOKEN_ADDRESS_MASK = BigNumber.from("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF000000000000000000000000");
export const TOKEN_ID_MASK = BigNumber.from("0x0000000000000000000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFF");

const MAX_UINT256 = BigNumber.from(2)
    .pow(256)
    .sub(1);
const MAX_NFT_ID = BigNumber.from(2)
    .pow(96)
    .sub(1);


export const ARTIFACT = "Metatokens";
function label(string : string) {
    return `${ARTIFACT} - ${string}`;
}

export function runTests() {
    CONTRACT(label("Register metatoken"), metatoken.test_registerMetatoken);
    CONTRACT(label("Minting tokens"), minting.test_mintTokens);
}

/** Returns the metatoken token ID for the given metatoken category and NFT ID. */
export function getMetatokenID(address : Address, nft : BigNumber | number) {
    nft = BigNumber.from(nft);
    if (nft.gt(MAX_NFT_ID)) {
        throw new Error("NFT ID too large!");
    }

    const id = nft.add(BigNumber.from(address).shl(TOKEN_ADDRESS_SHIFT));

    if (id.gt(MAX_UINT256)) {
        throw new Error("ID overflow!");
    }

    return id;
}
