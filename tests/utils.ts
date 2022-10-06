import { JsonFragment } from "@ethersproject/abi";
import { TransactionReceipt } from "@ethersproject/abstract-provider";
import { BN } from "bn.js";
import { BigNumber, utils } from "ethers";
import { ethers } from "hardhat";
import { sep } from "path";
import { CallResult } from "./transactions";

const GAS_PRICE = 90;
const ETH_VALUE = 5000;

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

export interface EventLogs<T> {
    logs : (...args : any[]) => void;
    args : T;
}

/** Readable skip flag. */
export const SKIP_TEST = true;

/** Wraps Mocha.contract so we can reset the test #. */
export function CONTRACT(label : string, testingGroup : (accounts : Address[]) => void, skip? : boolean) {
    if (skip === true) {
        return;
    }

    contract(label, (accounts) => testingGroup(accounts));
}

/** Wraps Mocha.context so we can insert the src location. */
export function CONTEXT(label : string, callback : () => Promise<void> | void) {
    context(`${label} - ${getSrcLocation(1)}`, callback);
}

/** Wraps Mocha.describe so we can insert the src location. */
export function DESCRIBE(label : string, callback : () => Promise<void> | void) {
    describe(`${label} - ${getSrcLocation(1)}`, callback);
}

/** Wraps Mocha.it so we can insert the src location. */
export function IT(label : string, callback : () => Promise<void> | void) {
    it(`${label} - ${getSrcLocation(1)}`, callback);
}

/** Wraps console.* so we can instert the src location. */
export const CONSOLE : Console = {
    ...console,
    debug : (...args : any[]) => console.debug(getSrcLocation(1), ...args),
    error : (...args : any[]) => console.error(getSrcLocation(1), ...args),
    log : (...args : any[]) => console.log(getSrcLocation(1), ...args),
    warn : (...args : any[]) => console.warn(getSrcLocation(1), ...args),
};

/** Returns the src location of the caller. */
export function getSrcLocation(depth = 0) {
    const { stack } = new Error();
    if (stack === undefined) {
        throw new Error("No call stack.");
    }

    const callerLine = stack.split("\n")[depth + 2].trim();
    const pathParts = callerLine.split(sep).slice(__dirname.split(sep).length);
    const callPath = `(tests${sep}${pathParts.join(sep)}`;

    return callPath;
}

/** Generates the FROM statements for all provided accounts. */
export function makeFROM(accounts : Address[]) {
    return accounts.map((account) => ({ from : account }));
}

export function logGas(name : string, gas : number) {
    const fiat = Math.round(gas * GAS_PRICE * ETH_VALUE / 10000000) / 100;
    let decimal = `${fiat - Math.floor(fiat)}`;
    if (decimal.length === 1) {
        decimal = ".00";
    } else if (decimal.length === 3) {
        decimal += "0";
    } else {
        decimal = `.${decimal.slice(2, 4)}`;
    }

    console.log(`\t${name}():`, gas, `$${Math.floor(fiat).toLocaleString()}${decimal}`);
}

/** Adds assertions to make sure the two addresses match. */
export function addressIs(
    addressA : DeployedContract | BigNumber | Address | string,
    addressB : DeployedContract | BigNumber | Address | string,
    assertionMessage? : string
) {
    assert.equal(normalizeAddress(addressA), normalizeAddress(addressB), assertionMessage);
}

export function bignumberFrom(number : BigNumberish | typeof BN) {
    if (typeof number === "number" || typeof number === "string" || Array.isArray(number)) {
        return BigNumber.from(number);
    }
    if (BigNumber.isBigNumber(number)) {
        return number;
    }
    return BigNumber.from(number.toString());
}

export function decodeLogs<Events>(abi : JsonFragment[], receipt : TransactionReceipt) {
    return {
        ...receipt,
        logs : receipt.logs.map((log) => {
            try {
                const decoded = new utils.Interface(abi).parseLog(log);

                return {
                    event : decoded.name,
                    args : decoded.args,
                };
            } catch (error) {
                if (!(error as { message : string }).message.includes("no matching event")) {
                    throw error;
                }

                return {
                    event : null,
                    args : [],
                };
            }
        }),
    } as unknown as CallResult<Events>;
}

export function expectBNEqual(value : BigNumberish | typeof BN, expected : BigNumberish | typeof BN, label? : string) {
    value = bignumberFrom(value);
    expected = bignumberFrom(expected);

    assert.strictEqual(value.toString(), expected.toString(), label);
}

/** Ensures that the specified event was emitted for a given transaction receipt. */
export function expectEvent<Events, E extends keyof Events & string = keyof Events & string>(
    receipt : CallResult<Events>,
    event : E,
    eventArgs? : Partial<Events[E]>
) {
    const events = getReceiptEvents(receipt, event, eventArgs);
    if (events.length === 0 && eventArgs !== undefined) {
        const potentiallyMatching = getReceiptEvents(receipt, event);
        if (potentiallyMatching.length > 0) {
            CONSOLE.log(`Potentially matching ${event} events:`, potentiallyMatching);
            CONSOLE.log(`Your args:`, eventArgs);
        }
    }

    assert.isAtLeast(events.length, 1, "expected at least one event");
}

/** Ensures that the specified event was emitted during the constructor for the provided artifact. */
export async function expectEventInConstruction<Events, E extends keyof Events & string = keyof Events & string>(
    instance : DeployedContract<any, any, Events>,
    event : E,
    eventArgs? : Partial<Events[E]>
) {
    await expectEventInTransaction(instance.abi, instance.transactionHash, event, eventArgs);
}

/** Ensures that the specified event was emitted during the provided transaction. */
export async function expectEventInTransaction<Events, E extends keyof Events & string = keyof Events & string>(
    abi : JsonFragment[],
    transactionHash : TransactionHash,
    event : E,
    eventArgs? : Partial<Events[E]>
) {
    const receipt = await ethers.provider.getTransactionReceipt(transactionHash);
    expectEvent(decodeLogs<Events>(abi, receipt), event, eventArgs);
}

/** Ensures that no event with the matching parameters was emitted for a given transaction receipt. */
export function expectNoEvent<Events, E extends keyof Events & string = keyof Events & string>(
    receipt : CallResult<Events>,
    event : E,
    eventArgs? : Partial<Events[E]>
) {
    const events = getReceiptEvents(receipt, event, eventArgs);
    if (events.length > 0 && eventArgs !== undefined) {
        const potentiallyMatching = getReceiptEvents(receipt, event);
        if (potentiallyMatching.length > 0) {
            CONSOLE.log(
                `Potentially matching ${event} events:\n`,
                potentiallyMatching,
                `\nYour args:\n`,
                eventArgs
            );
        }
    }
    assert.strictEqual(events.length, 0, "expected no events");
}

/** Ensures that no event with the matching parameters was emitted during the constructor for the provided artifact. */
export async function expectNoEventInConstruction<Events, E extends keyof Events & string = keyof Events & string>(
    instance : DeployedContract<any, any, Events>,
    event : E,
    eventArgs? : Partial<Events[E]>
) {
    await expectNoEventInTransaction(instance.abi, instance.transactionHash, event, eventArgs);
}

/** Ensures that no event with the matching parameters was emitted during the provided transaction. */
export async function expectNoEventInTransaction<Events, E extends keyof Events & string = keyof Events & string>(
    abi : JsonFragment[],
    transactionHash : TransactionHash,
    event : E,
    eventArgs? : Partial<Events[E]>
) {
    const receipt = await ethers.provider.getTransactionReceipt(transactionHash);

    expectNoEvent(decodeLogs<Events>(abi, receipt), event, eventArgs);
}

/**
 * Calls a function that is expecting a specific reversion.
 *
 * @param revertReason Can be the empty string if no revert message is expected.
 */
export async function expectReversion<ABI extends Record<string, any>, Method extends keyof ABI & string>(
    instance : ABI,
    revertReason : string | undefined,
    from : Address,
    method : Method,
    ...args : Parameters<ABI[Method]>
) {
    if (revertReason === "") {
        revertReason = "invalid opcode";
    }
    try {
        await instance[method](...args, { from });
    } catch (error) {
        const { message } = error as { message? : string };
        if (
            message === "VM Exception while processing transaction: reverted with an unrecognized custom error" ||
            message === "Returned error: VM Exception while processing transaction: revert with unrecognized return data or custom error"
        ) {
            // We can't parse unrecognized errors, so consider them to be a true condition.
            if (revertReason !== undefined) {
                CONSOLE.warn(`Got unrecognized custom error instead of: ${revertReason}`);
            }
            assert.isOk(true);
            return;
        } else if (message === "Transaction reverted without a reason string") {
            // We don't have any error to parse, so consider it to be a true condition.
            if (revertReason !== undefined) {
                CONSOLE.warn(`Got no error reason instead of: ${revertReason}`);
            }
            assert.isOk(true);
            return;
        } else if (revertReason !== undefined && message !== undefined && !message.includes(revertReason)) {
            CONSOLE.log("REVERT REASON", message);
            assert.equal(message, revertReason);
            return;
        } else {
            assert.isOk(true);
            return;
        }
    }
    assert.isNotOk(true, `${method}(...[${args.length}]) did not revert`);
}

export function normalizeAddress(address : DeployedContract | BigNumber | Address | string) {
    if (isDeployedContract(address)) {
        address = address.address;
    }

    // Convert it to hex if it's a BigNumber.
    if (typeof address !== "string") {
        address = address.toHexString();
    }

    // Make sure it's prefixed with 0x.
    if (!address.startsWith("0x")) {
        address = address.padStart(40, "0");
        address = `0x${address}`;
    }

    // Make sure it's lowercase.
    return address.toLowerCase() as Address;
}

/** Adds assertions that the two values are equal. */
export async function numberIs<ABI extends Record<string, any>, Method extends keyof ABI & string>(
    instance : ABI,
    target : BigNumberish,
    assertionMessage : string,
    method : Method,
    ...args : Parameters<ABI[Method]>
) {
    const value = await instance[method](...args);
    try {
        assert.isTrue(BigNumber.from(target).eq(bignumberFrom(value)), assertionMessage);
    } catch (error) {
        const { message } = error as { message? : string };
        if (message !== undefined && message.includes("AssertionError")) {
            throw error;
        }
        assert.isNotOk(true, message);
    }
}

/** Returns all events on the given transaction receipt that match the name and parameters. */
function getReceiptEvents<Events, E extends keyof Events & string>(
    receipt : CallResult<Events>,
    eventName : E,
    eventArgs? : Partial<Events[E]>
) {
    const events = receipt.logs.filter(({ event, args }) => {
        // Make sure the event name matches.
        if (event !== eventName) {
            return false;
        }
        if (eventArgs === undefined) {
            return true;
        }

        // Check all the args.
        const keys = Object.keys(eventArgs);
        for (let i = 0; i < keys.length; i++) {
            // Make sure the key exists.
            const key = keys[i];
            if (args[key] === undefined) {
                return false;
            }

            // Make sure the value is correct.
            const value = args[key];
            switch (typeof eventArgs[key]) {
                case "bigint":
                case "boolean":
                case "number":
                case "string":
                    if (eventArgs[key] !== value) {
                        return false;
                    }
                    break;

                case "function":
                case "symbol":
                case "undefined":
                    throw new Error("Cannot be function / symbol / undefined.");

                default:
                    if (BigNumber.isBigNumber(eventArgs[key])) {
                        if (!bignumberFrom(eventArgs[key]).eq(bignumberFrom(value))) {
                            return false;
                        } else {
                            break;
                        }
                    }

                    throw new Error(`Unknown type for ${eventArgs[key].toString() as string}`);
            }
        }

        return true;
    });

    // Filter out only the named event args for easier readability.
    return events.map(({ address, event, id, args }) => {
        const reduced = {
            address,
            event,
            id,
            args : {},
        };
        Object.keys(args).forEach((key) => {
            if (key === "__length__") {
                return;
            }
            if (typeof key === "string" && !/^\d+$/.test(key)) {
                let value = args[key];
                if (BN.isBN(value)) {
                    value = bignumberFrom(value as unknown as typeof BN).toHexString();
                }
                reduced.args[key] = value;
            }
        });

        return reduced;
    });
}

function isDeployedContract(contract : any) : contract is DeployedContract {
    return contract.address !== undefined;
}
