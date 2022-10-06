import BN = require("bn.js");
import { defaultAbiCoder, Interface, ParamType } from "ethers/lib/utils";
import { bignumberFrom } from "~/utils";
import * as proxyableMetatokens from "./proxyableMetatokens";

/** The possible options for proxied calls. */
export interface ProxiedCallOptions {
    /** Include the metatoken address and original sender along with the provided data. */
    includeSender? : boolean;
    /** Send the data raw instead of encoding it as bytes. */
    sendRaw? : boolean;
}
const enum PROXIED_CALL_OPTIONS {
    INCLUDE_SENDER = 0x1,
    SEND_RAW = 0x2,
}

export const enum METATOKEN_STATUS {
    REGISTERED = 0x1,
    IS_IMPLEMENTATION = 0x2,
    ENABLED = 0x4,
}

export function runTests() {
    proxyableMetatokens.runTests();
}

/** Encodes the provided data for a proxied function call. */
export function encodeFunctionCalldata(types : (string | ParamType)[], values : any[]) {
    if (types.length !== values.length) {
        throw new Error("Arrays must have same length.");
    }

    return defaultAbiCoder.encode(types, values) as Bytes;
}

/**
 * Decodes the result of a proxied call (or proxied view call).
 */
export function decodeProxiedCallResult(types : (string | ParamType)[], data : Bytes) {
    // Proxied metatoken calls return a `bytes` value which needs to be unwrapped before the actual
    // values can be decoded.
    const decodedBytes = defaultAbiCoder.decode(["bytes"], data)[0];

    return defaultAbiCoder.decode(types, decodedBytes);
}

/** Returns the function signature for the provided function in the provided ABI. */
export function getFunctionSelector<M>(abi : JsonFragment[], func : keyof M & string) {
    return new Interface(abi).getSighash(func) as Bytes4;
}

/** Returns the bitarray for the provided proxied metatoken call options. */
export function getProxiedCallOptions(options : ProxiedCallOptions) {
    let callOptions = 0;
    if (options.includeSender === true) {
        callOptions |= PROXIED_CALL_OPTIONS.INCLUDE_SENDER;
    }
    if (options.sendRaw === true) {
        callOptions |= PROXIED_CALL_OPTIONS.SEND_RAW;
    }

    return callOptions;
}

export function metatokenStatusIs(metatokenStatus : BigNumberish | typeof BN, status : METATOKEN_STATUS) {
    metatokenStatus = bignumberFrom(metatokenStatus);

    if (metatokenStatus.lt(0) || metatokenStatus.gte(2 ** 16)) {
        throw new Error(`Metatoken status not uint16: ${metatokenStatus.toHexString()}`);
    }

    const statusVal : number = status;

    return (metatokenStatus.toNumber() & statusVal) === statusVal;
}
