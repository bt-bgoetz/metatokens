import { keccak256, toUtf8Bytes } from "ethers/lib/utils";

export function makeERC165Interface(functionSignatures : string[] = []) {
    const INTERFACE_ID_LENGTH = 4;

    const interfaceIdBuffer = functionSignatures
        .map((signature) => keccak256(toUtf8Bytes(signature))) // Keccak256
        .map((h) => Buffer.from(h.substring(2), "hex").slice(0, 4)) // Bytes4()
        .reduce((memo, bytes) => {
            for (let i = 0; i < INTERFACE_ID_LENGTH; i++) {
                // eslint-disable-next-line operator-assignment
                memo[i] = memo[i] ^ bytes[i]; // Xor
            }
            return memo;
        }, Buffer.alloc(INTERFACE_ID_LENGTH));

    return `0x${interfaceIdBuffer.toString("hex")}`;
}

export function makeERC1820Interface(interfaceName : string) {
    return keccak256(toUtf8Bytes(interfaceName)); // Keccak256
}
