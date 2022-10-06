import { BigNumber, utils } from "ethers";
import { ethers } from "hardhat";
import { AddressImplMockArtifact, AddressImplMockContract } from "~/abi/AddressImplMock";
import {
    CallReceiverMockABI,
    CallReceiverMockArtifact,
    CallReceiverMockContract,
    CallReceiverMockEvents,
} from "~/abi/CallReceiverMock";
import { EtherReceiverMockArtifact, EtherReceiverMockContract } from "~/abi/EtherReceiverMock";
import { redeployContract } from "~/artifacts";
import { DESCRIBE, expectBNEqual, expectEvent, expectEventInTransaction, expectReversion, IT } from "~/utils";

interface BalanceTracker {
    delta : () => Promise<BigNumber>;
    deltaWithFees : () => Promise<{
        delta : BigNumber;
        fees : BigNumber;
    }>;
    fees : () => Promise<BigNumber>;
}

/** Creates a balance tracker that can be queried to return the delta of balance in eth in the previous block. */
async function balanceTracker(account : Address) : Promise<BalanceTracker> {
    let previousBalance : BigNumber | undefined;

    const getValues = async () => {
        const currentBlock = await ethers.provider.getBlockNumber();

        const currentBalance = await ethers.provider.getBalance(account, currentBlock);
        let delta = BigNumber.from(0);
        if (previousBalance !== undefined) {
            delta = currentBalance.sub(previousBalance);
        }
        previousBalance = currentBalance;

        const { transactions } = await ethers.provider.getBlockWithTransactions(currentBlock - 1);
        let fees = BigNumber.from(0);
        for (let i = 0; i < transactions.length; i++) {
            if (transactions[i].from === account) {
                const receipt = await ethers.provider.getTransactionReceipt(transactions[i].hash);
                fees = fees.add(receipt.gasUsed);
            }
        }

        return {
            delta,
            fees,
        };
    };

    await getValues();

    return {
        delta : async () => (await getValues()).delta,
        deltaWithFees : async () => getValues(),
        fees : async () => (await getValues()).fees,
    };
}

/** Generates an ABI encoded call. */
function encodeFunctionCall(abi : string, ...inputs : any[]) {
    const functionName = abi.split(" ")[1].split("(")[0];
    return new utils.Interface([abi]).encodeFunctionData(functionName, inputs) as Bytes;
}

async function redeploySimpleContract<A extends Artifact>(artifact : string) {
    return redeployContract<A>(
        artifact,
        {
            redeploy : true,
            args : [] as ConstructorArgsFromArtifact<A>,
        }
    );
}

async function sendETH(from : Address, to : Address, amount : BigNumber) {
    await ethers.provider.getSigner(from).sendTransaction({
        from,
        to,
        value : amount,
    });
}

export function test_Address(accounts : Address[]) {
    // We use address(0) as the deployer, which throws off balance deltas.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [_deployer, recipient, other] = accounts;

    let addressImpl : AddressImplMockContract;
    beforeEach(async () => {
        addressImpl = await redeploySimpleContract<AddressImplMockArtifact>("AddressImplMock");
    });

    DESCRIBE("isContract", () => {
        IT("returns false for account address", async () => {
            assert.strictEqual(await addressImpl.isContract(other), false);
        });

        IT("returns true for contract address", async () => {
            const contract = await redeploySimpleContract<AddressImplMockArtifact>("AddressImplMock");
            assert.strictEqual(await addressImpl.isContract(contract.address), true);
        });
    });

    DESCRIBE("sendValue", () => {
        let recipientTracker : BalanceTracker;

        beforeEach(async () => {
            recipientTracker = await balanceTracker(recipient);
        });

        context("when sender contract has no funds", () => {
            IT("sends 0 wei", async () => {
                await addressImpl.sendValue(other, 0);

                expectBNEqual(await recipientTracker.delta(), 0);
            });

            IT("reverts when sending non-zero amounts", async () => {
                await expectReversion(addressImpl, undefined, recipient, "sendValue", other, 1);
            });
        });

        context("when sender contract has funds", () => {
            const funds = BigNumber.from(10000);
            beforeEach(async () => {
                await sendETH(other, addressImpl.address, funds);
            });

            IT("sends 0 wei", async () => {
                await addressImpl.sendValue(recipient, 0);

                expectBNEqual(await recipientTracker.delta(), 0);
            });

            IT("sends non-zero amounts", async () => {
                await addressImpl.sendValue(recipient, funds.sub(1));

                expectBNEqual(await recipientTracker.delta(), funds.sub(1));
            });

            IT("sends the whole balance", async () => {
                await addressImpl.sendValue(recipient, funds);

                expectBNEqual(await recipientTracker.delta(), funds);
                expectBNEqual(await ethers.provider.getBalance(addressImpl.address), 0);
            });

            IT("reverts when sending more than the balance", async () => {
                await expectReversion(addressImpl, undefined, recipient, "sendValue", other, funds.add(1));
            });

            context("with contract recipient", () => {
                let contractRecipient : EtherReceiverMockContract;

                beforeEach(async () => {
                    contractRecipient = await redeploySimpleContract<EtherReceiverMockArtifact>("EtherReceiverMock");
                });

                IT("sends funds", async () => {
                    const tracker = await balanceTracker(contractRecipient.address);

                    await contractRecipient.setAcceptEther(true);
                    await addressImpl.sendValue(contractRecipient.address, funds);
                    expectBNEqual(await tracker.delta(), funds);
                });

                IT("reverts on recipient revert", async () => {
                    await contractRecipient.setAcceptEther(false);
                    await expectReversion(
                        addressImpl,
                        undefined,
                        recipient,
                        "sendValue",
                        contractRecipient.address,
                        funds
                    );
                });
            });
        });
    });

    DESCRIBE("functionCall", () => {
        let contractRecipient : CallReceiverMockContract;

        beforeEach(async () => {
            contractRecipient = await redeploySimpleContract<CallReceiverMockArtifact>("CallReceiverMock");
        });

        context("with valid contract receiver", () => {
            IT("calls the requested function", async () => {
                const abiEncodedCall = encodeFunctionCall("function mockFunction()");
                const receipt = await addressImpl.functionCall(contractRecipient.address, abiEncodedCall);

                expectEvent(receipt, "CallReturnValue", { data : "0x1234" });
                await expectEventInTransaction<CallReceiverMockEvents>(
                    CallReceiverMockABI,
                    receipt.tx,
                    "MockFunctionCalled"
                );
            });

            IT("reverts when the called function reverts with no reason", async () => {
                const abiEncodedCall = encodeFunctionCall("function mockFunctionRevertsNoReason()");

                await expectReversion(
                    addressImpl,
                    undefined,
                    recipient,
                    "functionCall",
                    contractRecipient.address,
                    abiEncodedCall
                );
            });

            IT("reverts when the called function reverts, bubbling up the revert reason", async () => {
                const abiEncodedCall = encodeFunctionCall("function mockFunctionRevertsReason()");

                await expectReversion(
                    addressImpl,
                    undefined,
                    recipient,
                    "functionCall",
                    contractRecipient.address,
                    abiEncodedCall
                );
            });

            IT("reverts when the called function runs out of gas", async () => {
                const abiEncodedCall = encodeFunctionCall("function mockFunctionOutOfGas()");

                await expectReversion(
                    addressImpl,
                    undefined,
                    recipient,
                    "functionCall",
                    contractRecipient.address,
                    abiEncodedCall,
                    {
                        gas : BigNumber.from(100000),
                    },
                );
            });

            IT("reverts when the called function throws", async () => {
                const abiEncodedCall = encodeFunctionCall("function mockFunctionThrows()");

                await expectReversion(
                    addressImpl,
                    undefined,
                    recipient,
                    "functionCall",
                    contractRecipient.address,
                    abiEncodedCall,
                );
            });

            IT("reverts when function does not exist", async () => {
                const abiEncodedCall = encodeFunctionCall("function mockFunctionDoesNotExist()");

                await expectReversion(
                    addressImpl,
                    undefined,
                    recipient,
                    "functionCall",
                    contractRecipient.address,
                    abiEncodedCall,
                );
            });
        });

        context("with non-contract receiver", () => {
            IT("reverts when address is not a contract", async () => {
                const abiEncodedCall = encodeFunctionCall("function mockFunction()");

                await expectReversion(
                    addressImpl,
                    undefined,
                    recipient,
                    "functionCall",
                    recipient,
                    abiEncodedCall,
                );
            });
        });
    });

    DESCRIBE("functionCallWithValue", () => {
        let contractRecipient : CallReceiverMockContract;

        beforeEach(async () => {
            contractRecipient = await redeploySimpleContract<CallReceiverMockArtifact>("CallReceiverMock");
        });

        context("with zero value", () => {
            IT("calls the requested function", async () => {
                const abiEncodedCall = encodeFunctionCall("function mockFunction()");

                const receipt = await addressImpl.functionCallWithValue(contractRecipient.address, abiEncodedCall, 0);

                expectEvent(receipt, "CallReturnValue", { data : "0x1234" });
                await expectEventInTransaction<CallReceiverMockEvents>(
                    CallReceiverMockABI,
                    receipt.tx,
                    "MockFunctionCalled"
                );
            });
        });

        context("with non-zero value", () => {
            const amount = BigNumber.from(12000);

            IT("reverts if insufficient sender balance", async () => {
                const abiEncodedCall = encodeFunctionCall("function mockFunction()");

                await expectReversion(
                    addressImpl,
                    undefined,
                    recipient,
                    "functionCallWithValue",
                    contractRecipient.address,
                    abiEncodedCall,
                    amount,
                );
            });

            IT("calls the requested function with existing value", async () => {
                const abiEncodedCall = encodeFunctionCall("function mockFunction()");

                const tracker = await balanceTracker(contractRecipient.address);

                await sendETH(other, addressImpl.address, amount);

                const receipt = await addressImpl.functionCallWithValue(
                    contractRecipient.address,
                    abiEncodedCall,
                    amount
                );

                expectBNEqual(await tracker.delta(), amount);

                expectEvent(receipt, "CallReturnValue", { data : "0x1234" });
                await expectEventInTransaction<CallReceiverMockEvents>(
                    CallReceiverMockABI,
                    receipt.tx,
                    "MockFunctionCalled"
                );
            });

            IT("calls the requested function with transaction funds", async () => {
                const abiEncodedCall = encodeFunctionCall("function mockFunction()");

                const tracker = await balanceTracker(contractRecipient.address);

                expectBNEqual(await ethers.provider.getBalance(addressImpl.address), 0);
                const receipt = await addressImpl.functionCallWithValue(
                    contractRecipient.address,
                    abiEncodedCall,
                    amount,
                    {
                        from : other,
                        value : amount,
                    },
                );

                expectBNEqual(await tracker.delta(), amount);

                expectEvent(receipt, "CallReturnValue", { data : "0x1234" });
                await expectEventInTransaction<CallReceiverMockEvents>(
                    CallReceiverMockABI,
                    receipt.tx,
                    "MockFunctionCalled"
                );
            });

            IT("reverts when calling non-payable functions", async () => {
                const abiEncodedCall = encodeFunctionCall("function mockFunctionNonPayable()");

                await sendETH(other, addressImpl.address, amount);

                await expectReversion(
                    addressImpl,
                    undefined,
                    recipient,
                    "functionCallWithValue",
                    contractRecipient.address,
                    abiEncodedCall,
                    amount,
                );
            });
        });
    });

    DESCRIBE("functionStaticCall", () => {
        let contractRecipient : CallReceiverMockContract;

        beforeEach(async () => {
            contractRecipient = await redeploySimpleContract<CallReceiverMockArtifact>("CallReceiverMock");
        });

        IT("calls the requested function", async () => {
            const abiEncodedCall = encodeFunctionCall("function mockStaticFunction()");

            const receipt = await addressImpl.functionStaticCall(contractRecipient.address, abiEncodedCall);

            expectEvent(receipt, "CallReturnValue", { data : "0x1234" });
        });

        IT("reverts on a non-static function", async () => {
            const abiEncodedCall = encodeFunctionCall("function mockFunction()");

            await expectReversion(
                addressImpl,
                undefined,
                recipient,
                "functionStaticCall",
                contractRecipient.address,
                abiEncodedCall,
            );
        });

        IT("bubbles up revert reason", async () => {
            const abiEncodedCall = encodeFunctionCall("function mockFunctionRevertsReason()");

            await expectReversion(
                addressImpl,
                undefined,
                recipient,
                "functionStaticCall",
                contractRecipient.address,
                abiEncodedCall,
            );
        });

        IT("reverts when address is not a contract", async () => {
            const abiEncodedCall = encodeFunctionCall("function mockFunction()");

            await expectReversion(
                addressImpl,
                undefined,
                recipient,
                "functionStaticCall",
                recipient,
                abiEncodedCall,
            );
        });
    });

    DESCRIBE("functionDelegateCall", () => {
        let contractRecipient : CallReceiverMockContract;

        beforeEach(async () => {
            contractRecipient = await redeploySimpleContract<CallReceiverMockArtifact>("CallReceiverMock");
        });

        IT("delegate calls the requested function", async () => {
            const abiEncodedCall = encodeFunctionCall("function mockFunctionWritesStorage()");

            const receipt = await addressImpl.functionDelegateCall(contractRecipient.address, abiEncodedCall);

            expectEvent(receipt, "CallReturnValue", { data : "0x1234" });

            assert.strictEqual(await addressImpl.sharedAnswer(), "42");
        });

        IT("bubbles up revert reason", async () => {
            const abiEncodedCall = encodeFunctionCall("function mockFunctionRevertsReason()");

            await expectReversion(
                addressImpl,
                undefined,
                recipient,
                "functionDelegateCall",
                contractRecipient.address,
                abiEncodedCall,
            );
        });

        IT("reverts when address is not a contract", async () => {
            const abiEncodedCall = encodeFunctionCall("function mockFunction()");

            await expectReversion(
                addressImpl,
                undefined,
                recipient,
                "functionDelegateCall",
                recipient,
                abiEncodedCall,
            );
        });
    });
}
