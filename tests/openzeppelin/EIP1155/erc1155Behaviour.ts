import { BigNumber } from "ethers";
import {
    ERC1155ReceiverMockABI,
    ERC1155ReceiverMockArtifact,
    ERC1155ReceiverMockContract,
    ERC1155ReceiverMockEvents,
} from "~/abi/ERC1155ReceiverMock";
import { ERC1155MMockContract, ERC1155MMockEvents } from "~/abi/ERC1155MMock";
import { CallResult } from "~/transactions";
import {
    CONTEXT,
    DESCRIBE,
    expectBNEqual,
    expectEvent,
    expectEventInTransaction,
    expectReversion,
    IT,
    numberIs,
    ZERO_ADDRESS,
} from "~/utils";
import { shouldSupportInterfaces } from "../supportsInterface";

interface TransferDetails {
     logs : CallResult<ERC1155MMockEvents>;
     to : Address;
}

const ZERO_BYTES = "0x" as Bytes;

const ERC1155ReceiverMock = artifacts.require<ERC1155ReceiverMockArtifact>("ERC1155ReceiverMock");

export function shouldBehaveLikeERC1155(
    instanceGetter : (redeploy? : boolean) => Promise<ERC1155MMockContract>,
    minter : Address,
    firstTokenHolder : Address,
    secondTokenHolder : Address,
    multiTokenHolder : Address,
    recipient : Address,
    proxy : Address
) {
    const firstTokenId = BigNumber.from(1);
    const secondTokenId = BigNumber.from(2);
    const unknownTokenId = BigNumber.from(3);

    const firstAmount = BigNumber.from(1000);
    const secondAmount = BigNumber.from(2000);

    const RECEIVER_SINGLE_MAGIC_VALUE = "0xf23a6e61" as Bytes4;
    const RECEIVER_BATCH_MAGIC_VALUE = "0xbc197c81" as Bytes4;

    DESCRIBE("like an ERC1155", async () => {
        DESCRIBE("balanceOf", () => {
            IT("reverts when queried about the zero address", async () => {
                const instance = await instanceGetter();
                await expectReversion(
                    instance,
                    undefined,
                    minter,
                    "balanceOf",
                    ZERO_ADDRESS,
                    firstTokenId,
                );
            });

            CONTEXT("when accounts don't own tokens", () => {
                IT("returns zero for given addresses", async () => {
                    const instance = await instanceGetter();
                    await numberIs(instance, 0, "", "balanceOf", firstTokenHolder, firstTokenId);
                    await numberIs(instance, 0, "", "balanceOf", secondTokenHolder, secondTokenId);
                    await numberIs(instance, 0, "", "balanceOf", firstTokenHolder, unknownTokenId);
                });
            });

            CONTEXT("when accounts own some tokens", () => {
                beforeEach(async () => {
                    const instance = await instanceGetter();
                    await instance.mint(firstTokenHolder, firstTokenId, firstAmount, ZERO_BYTES, {
                        from : minter,
                    });
                    await instance.mint(
                        secondTokenHolder,
                        secondTokenId,
                        secondAmount,
                        ZERO_BYTES,
                        {
                            from : minter,
                        },
                    );
                });

                IT("returns the amount of tokens owned by the given addresses", async () => {
                    const instance = await instanceGetter();
                    await numberIs(
                        instance,
                        firstAmount,
                        "",
                        "balanceOf",
                        firstTokenHolder,
                        firstTokenId
                    );
                    await numberIs(
                        instance,
                        secondAmount,
                        "",
                        "balanceOf",
                        secondTokenHolder,
                        secondTokenId
                    );
                    await numberIs(
                        instance,
                        0,
                        "",
                        "balanceOf",
                        firstTokenHolder,
                        unknownTokenId
                    );
                });
            });
        });

        DESCRIBE("balanceOfBatch", () => {
            IT("reverts when input arrays don't match up", async () => {
                const instance = await instanceGetter();
                await expectReversion(
                    instance,
                    undefined,
                    minter,
                    "balanceOfBatch",
                    [firstTokenHolder, secondTokenHolder, firstTokenHolder, secondTokenHolder],
                    [firstTokenId, secondTokenId, unknownTokenId],
                );

                await expectReversion(
                    instance,
                    undefined,
                    minter,
                    "balanceOfBatch",
                    [firstTokenHolder, secondTokenHolder],
                    [firstTokenId, secondTokenId, unknownTokenId],
                );
            });

            IT("reverts when one of the addresses is the zero address", async () => {
                const instance = await instanceGetter();
                await expectReversion(
                    instance,
                    undefined,
                    minter,
                    "balanceOfBatch",
                    [firstTokenHolder, secondTokenHolder, ZERO_ADDRESS],
                    [firstTokenId, secondTokenId, unknownTokenId],
                );
            });

            CONTEXT("when accounts don't own tokens", () => {
                IT("returns zeros for each account", async () => {
                    const instance = await instanceGetter();
                    const result = await instance.balanceOfBatch(
                        [firstTokenHolder, secondTokenHolder, firstTokenHolder],
                        [firstTokenId, secondTokenId, unknownTokenId],
                    );
                    assert.isTrue(Array.isArray(result));
                    expectBNEqual(result[0], 0);
                    expectBNEqual(result[1], 0);
                    expectBNEqual(result[2], 0);
                });
            });

            CONTEXT("when accounts own some tokens", () => {
                beforeEach(async () => {
                    const instance = await instanceGetter();
                    await instance.mint(firstTokenHolder, firstTokenId, firstAmount, ZERO_BYTES, {
                        from : minter,
                    });
                    await instance.mint(
                        secondTokenHolder,
                        secondTokenId,
                        secondAmount,
                        ZERO_BYTES,
                        {
                            from : minter,
                        },
                    );
                });

                IT("returns amounts owned by each account in order passed", async () => {
                    const instance = await instanceGetter();
                    const result = await instance.balanceOfBatch(
                        [secondTokenHolder, firstTokenHolder, firstTokenHolder],
                        [secondTokenId, firstTokenId, unknownTokenId],
                    );
                    assert.isTrue(Array.isArray(result));
                    expectBNEqual(result[0], secondAmount);
                    expectBNEqual(result[1], firstAmount);
                    expectBNEqual(result[2], 0);
                });

                IT("returns multiple times the balance of the same address when asked", async () => {
                    const instance = await instanceGetter();
                    const result = await instance.balanceOfBatch(
                        [firstTokenHolder, secondTokenHolder, firstTokenHolder],
                        [firstTokenId, secondTokenId, firstTokenId],
                    );
                    assert.isTrue(Array.isArray(result));
                    expectBNEqual(result[0], firstAmount);
                    expectBNEqual(result[1], secondAmount);
                    expectBNEqual(result[2], firstAmount);
                });
            });
        });

        DESCRIBE("setApprovalForAll", () => {
            let receipt : CallResult<ERC1155MMockEvents>;
            beforeEach(async () => {
                const instance = await instanceGetter();
                receipt = await instance.setApprovalForAll(proxy, true, { from : multiTokenHolder });
            });

            IT("sets approval status which can be queried via isApprovedForAll", async () => {
                const instance = await instanceGetter();
                assert.isTrue(await instance.isApprovedForAll(multiTokenHolder, proxy));
            });

            IT("emits an ApprovalForAll log", () => {
                expectEvent(receipt, "ApprovalForAll", {
                    account : multiTokenHolder,
                    operator : proxy,
                    approved : true,
                });
            });

            IT("can unset approval for an operator", async () => {
                const instance = await instanceGetter();
                await instance.setApprovalForAll(proxy, false, { from : multiTokenHolder });
                assert.isFalse(await instance.isApprovedForAll(multiTokenHolder, proxy));
            });

            IT("reverts if attempting to approve self as an operator", async () => {
                const instance = await instanceGetter();
                await expectReversion(
                    instance,
                    undefined,
                    minter,
                    "setApprovalForAll",
                    multiTokenHolder,
                    true,
                    { from : multiTokenHolder }
                );
            });
        });

        DESCRIBE("safeTransferFrom", () => {
            beforeEach(async () => {
                const instance = await instanceGetter();
                await instance.mint(multiTokenHolder, firstTokenId, firstAmount, ZERO_BYTES, {
                    from : minter,
                });
                await instance.mint(
                    multiTokenHolder,
                    secondTokenId,
                    secondAmount,
                    ZERO_BYTES,
                    {
                        from : minter,
                    },
                );
            });

            IT("reverts when transferring more than balance", async () => {
                const instance = await instanceGetter();
                await expectReversion(
                    instance,
                    undefined,
                    minter,
                    "safeTransferFrom",
                    multiTokenHolder,
                    recipient,
                    firstTokenId,
                    firstAmount.add(1),
                    ZERO_BYTES,
                    { from : multiTokenHolder },
                );
            });

            IT("reverts when transferring to zero address", async () => {
                const instance = await instanceGetter();
                await expectReversion(
                    instance,
                    undefined,
                    minter,
                    "safeTransferFrom",
                    multiTokenHolder,
                    ZERO_ADDRESS,
                    firstTokenId,
                    firstAmount,
                    ZERO_BYTES,
                    { from : multiTokenHolder },
                );
            });

            CONTEXT("when called by the multiTokenHolder", () => {
                const transferDetails : TransferDetails = {
                    to : recipient,
                    logs : undefined as unknown as CallResult<ERC1155MMockEvents>,
                };

                beforeEach(async () => {
                    const instance = await instanceGetter();
                    transferDetails.logs = await instance.safeTransferFrom(
                        multiTokenHolder,
                        recipient,
                        firstTokenId,
                        firstAmount,
                        ZERO_BYTES,
                        {
                            from : multiTokenHolder,
                        }
                    );
                });

                transferWasSuccessful(
                    instanceGetter,
                    multiTokenHolder,
                    multiTokenHolder,
                    firstTokenId,
                    firstAmount,
                    transferDetails
                );

                IT("preserves existing balances which are not transferred by multiTokenHolder", async () => {
                    const instance = await instanceGetter();
                    const balance1 = await instance.balanceOf(multiTokenHolder, secondTokenId);
                    expectBNEqual(balance1, secondAmount);

                    const balance2 = await instance.balanceOf(recipient, secondTokenId);
                    expectBNEqual(balance2, 0);
                });
            });

            CONTEXT("when called by an operator on behalf of the multiTokenHolder", () => {
                CONTEXT("when operator is not approved by multiTokenHolder", () => {
                    beforeEach(async () => {
                        const instance = await instanceGetter();
                        await instance.setApprovalForAll(proxy, false, { from : multiTokenHolder });
                    });

                    IT("reverts", async () => {
                        const instance = await instanceGetter();
                        await expectReversion(
                            instance,
                            undefined,
                            minter,
                            "safeTransferFrom",
                            multiTokenHolder,
                            recipient,
                            firstTokenId,
                            firstAmount,
                            ZERO_BYTES,
                            {
                                from : proxy,
                            }
                        );
                    });
                });

                CONTEXT("when operator is approved by multiTokenHolder", () => {
                    const transferDetails : TransferDetails = {
                        to : recipient,
                        logs : undefined as unknown as CallResult<ERC1155MMockEvents>,
                    };

                    beforeEach(async () => {
                        const instance = await instanceGetter();
                        await instance.setApprovalForAll(proxy, true, { from : multiTokenHolder });
                        transferDetails.logs = await instance.safeTransferFrom(
                            multiTokenHolder,
                            recipient,
                            firstTokenId,
                            firstAmount,
                            ZERO_BYTES,
                            {
                                from : proxy,
                            }
                        );
                    });

                    transferWasSuccessful(
                        instanceGetter,
                        proxy,
                        multiTokenHolder,
                        firstTokenId,
                        firstAmount,
                        transferDetails
                    );

                    IT("preserves operator's balances not involved in the transfer", async () => {
                        const instance = await instanceGetter();
                        const balance1 = await instance.balanceOf(proxy, firstTokenId);
                        expectBNEqual(balance1, 0);

                        const balance2 = await instance.balanceOf(proxy, secondTokenId);
                        expectBNEqual(balance2, 0);
                    });
                });
            });

            CONTEXT("when sending to a valid receiver", () => {
                let receiver : ERC1155ReceiverMockContract;

                beforeEach(async () => {
                    receiver = await ERC1155ReceiverMock.new(
                        RECEIVER_SINGLE_MAGIC_VALUE,
                        false,
                        RECEIVER_BATCH_MAGIC_VALUE,
                        false,
                    );
                });

                CONTEXT("without data", () => {
                    const transferDetails : TransferDetails = {
                        to : receiver.address,
                        logs : undefined as unknown as CallResult<ERC1155MMockEvents>,
                    };

                    beforeEach(async () => {
                        const instance = await instanceGetter();
                        transferDetails.logs = await instance.safeTransferFrom(
                            multiTokenHolder,
                            receiver.address,
                            firstTokenId,
                            firstAmount,
                            ZERO_BYTES,
                            { from : multiTokenHolder },
                        );
                    });

                    transferWasSuccessful(
                        instanceGetter,
                        multiTokenHolder,
                        multiTokenHolder,
                        firstTokenId,
                        firstAmount,
                        transferDetails
                    );

                    IT("calls onERC1155Received", async () => {
                        await expectEventInTransaction<ERC1155ReceiverMockEvents>(
                            ERC1155ReceiverMockABI,
                            transferDetails.logs.tx,
                            "Received",
                            {
                                operator : multiTokenHolder,
                                from : multiTokenHolder,
                                id : firstTokenId,
                                value : firstAmount,
                                data : undefined,
                            }
                        );
                    });
                });

                CONTEXT("with data", () => {
                    const transferDetails : TransferDetails = {
                        to : receiver.address,
                        logs : undefined as unknown as CallResult<ERC1155MMockEvents>,
                    };

                    const data = "0xf00dd00d" as Bytes;
                    beforeEach(async () => {
                        const instance = await instanceGetter();
                        transferDetails.logs = await instance.safeTransferFrom(
                            multiTokenHolder,
                            receiver.address,
                            firstTokenId,
                            firstAmount,
                            data,
                            { from : multiTokenHolder },
                        );
                    });

                    transferWasSuccessful(
                        instanceGetter,
                        multiTokenHolder,
                        multiTokenHolder,
                        firstTokenId,
                        firstAmount,
                        transferDetails
                    );

                    IT("calls onERC1155Received", async () => {
                        await expectEventInTransaction<ERC1155ReceiverMockEvents>(
                            ERC1155ReceiverMockABI,
                            transferDetails.logs.tx,
                            "Received",
                            {
                                operator : multiTokenHolder,
                                from : multiTokenHolder,
                                id : firstTokenId,
                                value : firstAmount,
                                data,
                            }
                        );
                    });
                });
            });

            CONTEXT("to a receiver contract returning unexpected value", () => {
                let receiver : ERC1155ReceiverMockContract;

                beforeEach(async () => {
                    receiver = await ERC1155ReceiverMock.new(
                        "0x00c0ffee" as Bytes4,
                        false,
                        RECEIVER_BATCH_MAGIC_VALUE,
                        false,
                    );
                });

                IT("reverts", async () => {
                    const instance = await instanceGetter();
                    await expectReversion(
                        instance,
                        undefined,
                        minter,
                        "safeTransferFrom",
                        multiTokenHolder,
                        receiver.address,
                        firstTokenId,
                        firstAmount,
                        ZERO_BYTES,
                        {
                            from : multiTokenHolder,
                        }
                    );
                });
            });

            CONTEXT("to a receiver contract that reverts", () => {
                let receiver : ERC1155ReceiverMockContract;

                beforeEach(async () => {
                    receiver = await ERC1155ReceiverMock.new(
                        RECEIVER_SINGLE_MAGIC_VALUE,
                        true,
                        RECEIVER_BATCH_MAGIC_VALUE,
                        false,
                    );
                });

                IT("reverts", async () => {
                    const instance = await instanceGetter();
                    await expectReversion(
                        instance,
                        undefined,
                        minter,
                        "safeTransferFrom",
                        multiTokenHolder,
                        receiver.address,
                        firstTokenId,
                        firstAmount,
                        ZERO_BYTES,
                        {
                            from : multiTokenHolder,
                        }
                    );
                });
            });

            CONTEXT("to a contract that does not implement the required function", () => {
                IT("reverts", async () => {
                    const instance = await instanceGetter();
                    await expectReversion(
                        instance,
                        undefined,
                        multiTokenHolder,
                        "safeTransferFrom",
                        multiTokenHolder,
                        instance.address,
                        firstTokenId,
                        firstAmount,
                        ZERO_BYTES
                    );
                });
            });
        });

        DESCRIBE("safeBatchTransferFrom", () => {
            beforeEach(async () => {
                const instance = await instanceGetter();
                await instance.mint(multiTokenHolder, firstTokenId, firstAmount, ZERO_BYTES, {
                    from : minter,
                });
                await instance.mint(
                    multiTokenHolder,
                    secondTokenId,
                    secondAmount,
                    ZERO_BYTES,
                    {
                        from : minter,
                    },
                );
            });

            IT("reverts when transferring amount more than any of balances", async () => {
                const instance = await instanceGetter();
                await expectReversion(
                    instance,
                    undefined,
                    minter,
                    "safeBatchTransferFrom",
                    multiTokenHolder,
                    recipient,
                    [firstTokenId, secondTokenId],
                    [firstAmount, secondAmount.add(1)],
                    ZERO_BYTES,
                    { from : multiTokenHolder },
                );
            });

            IT("reverts when ids array length doesn't match amounts array length", async () => {
                const instance = await instanceGetter();
                await expectReversion(
                    instance,
                    undefined,
                    minter,
                    "safeBatchTransferFrom",
                    multiTokenHolder,
                    recipient,
                    [firstTokenId],
                    [firstAmount, secondAmount],
                    ZERO_BYTES,
                    { from : multiTokenHolder },
                );

                await expectReversion(
                    instance,
                    undefined,
                    minter,
                    "safeBatchTransferFrom",
                    multiTokenHolder,
                    recipient,
                    [firstTokenId, secondTokenId],
                    [firstAmount],
                    ZERO_BYTES,
                    { from : multiTokenHolder },
                );
            });

            IT("reverts when transferring to zero address", async () => {
                const instance = await instanceGetter();
                await expectReversion(
                    instance,
                    undefined,
                    minter,
                    "safeBatchTransferFrom",
                    multiTokenHolder,
                    ZERO_ADDRESS,
                    [firstTokenId, secondTokenId],
                    [firstAmount, secondAmount],
                    ZERO_BYTES,
                    { from : multiTokenHolder },
                );
            });

            CONTEXT("when called by the multiTokenHolder", () => {
                const transferDetails : TransferDetails = {
                    to : undefined as unknown as Address,
                    logs : undefined as unknown as CallResult<ERC1155MMockEvents>,
                };

                beforeEach(async () => {
                    const instance = await instanceGetter();
                    transferDetails.to = recipient;
                    transferDetails.logs = await instance.safeBatchTransferFrom(
                        multiTokenHolder,
                        recipient,
                        [firstTokenId, secondTokenId],
                        [firstAmount, secondAmount],
                        ZERO_BYTES,
                        { from : multiTokenHolder },
                    );
                });

                batchTransferWasSuccessful(
                    instanceGetter,
                    multiTokenHolder,
                    multiTokenHolder,
                    [firstTokenId, secondTokenId],
                    [firstAmount, secondAmount],
                    transferDetails
                );
            });

            CONTEXT("when called by an operator on behalf of the multiTokenHolder", () => {
                CONTEXT("when operator is not approved by multiTokenHolder", () => {
                    beforeEach(async () => {
                        const instance = await instanceGetter();
                        await instance.setApprovalForAll(proxy, false, { from : multiTokenHolder });
                    });

                    IT("reverts", async () => {
                        const instance = await instanceGetter();
                        await expectReversion(
                            instance,
                            undefined,
                            minter,
                            "safeBatchTransferFrom",
                            multiTokenHolder,
                            recipient,
                            [firstTokenId, secondTokenId],
                            [firstAmount, secondAmount],
                            ZERO_BYTES,
                            { from : proxy },
                        );
                    });
                });

                CONTEXT("when operator is approved by multiTokenHolder", () => {
                    const transferDetails : TransferDetails = {
                        to : undefined as unknown as Address,
                        logs : undefined as unknown as CallResult<ERC1155MMockEvents>,
                    };

                    beforeEach(async () => {
                        const instance = await instanceGetter();
                        transferDetails.to = recipient;
                        await instance.setApprovalForAll(proxy, true, { from : multiTokenHolder });
                        transferDetails.logs = await instance.safeBatchTransferFrom(
                            multiTokenHolder,
                            recipient,
                            [firstTokenId, secondTokenId],
                            [firstAmount, secondAmount],
                            ZERO_BYTES,
                            { from : proxy },
                        );
                    });

                    batchTransferWasSuccessful(
                        instanceGetter,
                        proxy,
                        multiTokenHolder,
                        [firstTokenId, secondTokenId],
                        [firstAmount, secondAmount],
                        transferDetails
                    );

                    IT("preserves operator's balances not involved in the transfer", async () => {
                        const instance = await instanceGetter();
                        const balance1 = await instance.balanceOf(proxy, firstTokenId);
                        expectBNEqual(balance1, 0);
                        const balance2 = await instance.balanceOf(proxy, secondTokenId);
                        expectBNEqual(balance2, 0);
                    });
                });
            });

            CONTEXT("when sending to a valid receiver", () => {
                let receiver : ERC1155ReceiverMockContract;

                beforeEach(async () => {
                    receiver = await ERC1155ReceiverMock.new(
                        RECEIVER_SINGLE_MAGIC_VALUE,
                        false,
                        RECEIVER_BATCH_MAGIC_VALUE,
                        false,
                    );
                });

                CONTEXT("without data", () => {
                    const transferDetails : TransferDetails = {
                        to : undefined as unknown as Address,
                        logs : undefined as unknown as CallResult<ERC1155MMockEvents>,
                    };

                    beforeEach(async () => {
                        const instance = await instanceGetter();
                        transferDetails.to = receiver.address;
                        transferDetails.logs = await instance.safeBatchTransferFrom(
                            multiTokenHolder,
                            receiver.address,
                            [firstTokenId, secondTokenId],
                            [firstAmount, secondAmount],
                            ZERO_BYTES,
                            { from : multiTokenHolder },
                        );
                    });

                    batchTransferWasSuccessful(
                        instanceGetter,
                        multiTokenHolder,
                        multiTokenHolder,
                        [firstTokenId, secondTokenId],
                        [firstAmount, secondAmount],
                        transferDetails
                    );

                    IT("calls onERC1155BatchReceived", async () => {
                        await expectEventInTransaction<ERC1155ReceiverMockEvents>(
                            ERC1155ReceiverMockABI,
                            transferDetails.logs.tx,
                            "BatchReceived",
                            {
                                operator : multiTokenHolder,
                                from : multiTokenHolder,
                                // Ids: [firstTokenId, secondTokenId],
                                // values: [firstAmount, secondAmount],
                                data : undefined,
                            }
                        );
                    });
                });

                CONTEXT("with data", () => {
                    const transferDetails : TransferDetails = {
                        to : undefined as unknown as Address,
                        logs : undefined as unknown as CallResult<ERC1155MMockEvents>,
                    };

                    const data = "0xf00dd00d" as Bytes;
                    beforeEach(async () => {
                        const instance = await instanceGetter();
                        transferDetails.to = receiver.address;
                        transferDetails.logs = await instance.safeBatchTransferFrom(
                            multiTokenHolder,
                            receiver.address,
                            [firstTokenId, secondTokenId],
                            [firstAmount, secondAmount],
                            data,
                            { from : multiTokenHolder },
                        );
                    });

                    batchTransferWasSuccessful(
                        instanceGetter,
                        multiTokenHolder,
                        multiTokenHolder,
                        [firstTokenId, secondTokenId],
                        [firstAmount, secondAmount],
                        transferDetails
                    );

                    IT("calls onERC1155Received", async () => {
                        await expectEventInTransaction<ERC1155ReceiverMockEvents>(
                            ERC1155ReceiverMockABI,
                            transferDetails.logs.tx,
                            "BatchReceived",
                            {
                                operator : multiTokenHolder,
                                from : multiTokenHolder,
                                // Ids: [firstTokenId, secondTokenId],
                                // values: [firstAmount, secondAmount],
                                data,
                            }
                        );
                    });
                });
            });

            CONTEXT("to a receiver contract returning unexpected value", () => {
                let receiver : ERC1155ReceiverMockContract;

                beforeEach(async () => {
                    receiver = await ERC1155ReceiverMock.new(
                        RECEIVER_SINGLE_MAGIC_VALUE,
                        false,
                        RECEIVER_SINGLE_MAGIC_VALUE,
                        false,
                    );
                });

                IT("reverts", async () => {
                    const instance = await instanceGetter();
                    await expectReversion(
                        instance,
                        undefined,
                        minter,
                        "safeBatchTransferFrom",
                        multiTokenHolder,
                        receiver.address,
                        [firstTokenId, secondTokenId],
                        [firstAmount, secondAmount],
                        ZERO_BYTES,
                        { from : multiTokenHolder },
                    );
                });
            });

            CONTEXT("to a receiver contract that reverts", () => {
                let receiver : ERC1155ReceiverMockContract;

                beforeEach(async () => {
                    receiver = await ERC1155ReceiverMock.new(
                        RECEIVER_SINGLE_MAGIC_VALUE,
                        false,
                        RECEIVER_BATCH_MAGIC_VALUE,
                        true,
                    );
                });

                IT("reverts", async () => {
                    const instance = await instanceGetter();
                    await expectReversion(
                        instance,
                        undefined,
                        minter,
                        "safeBatchTransferFrom",
                        multiTokenHolder,
                        receiver.address,
                        [firstTokenId, secondTokenId],
                        [firstAmount, secondAmount],
                        ZERO_BYTES,
                        { from : multiTokenHolder },
                    );
                });
            });

            CONTEXT("to a receiver contract that reverts only on single transfers", () => {
                let receiver : ERC1155ReceiverMockContract;
                const transferDetails : TransferDetails = {
                    to : undefined as unknown as Address,
                    logs : undefined as unknown as CallResult<ERC1155MMockEvents>,
                };

                beforeEach(async () => {
                    const instance = await instanceGetter();
                    receiver = await ERC1155ReceiverMock.new(
                        RECEIVER_SINGLE_MAGIC_VALUE,
                        true,
                        RECEIVER_BATCH_MAGIC_VALUE,
                        false,
                    );

                    transferDetails.to = receiver.address;
                    transferDetails.logs = await instance.safeBatchTransferFrom(
                        multiTokenHolder,
                        receiver.address,
                        [firstTokenId, secondTokenId],
                        [firstAmount, secondAmount],
                        ZERO_BYTES,
                        { from : multiTokenHolder },
                    );
                });

                batchTransferWasSuccessful(
                    instanceGetter,
                    multiTokenHolder,
                    multiTokenHolder,
                    [firstTokenId, secondTokenId],
                    [firstAmount, secondAmount],
                    transferDetails
                );

                IT("calls onERC1155BatchReceived", async () => {
                    await expectEventInTransaction<ERC1155ReceiverMockEvents>(
                        ERC1155ReceiverMockABI,
                        transferDetails.logs.tx,
                        "BatchReceived",
                        {
                            operator : multiTokenHolder,
                            from : multiTokenHolder,
                            // Ids: [firstTokenId, secondTokenId],
                            // values: [firstAmount, secondAmount],
                            data : undefined,
                        }
                    );
                });
            });

            CONTEXT("to a contract that does not implement the required function", () => {
                IT("reverts", async () => {
                    const instance = await instanceGetter();
                    await expectReversion(
                        instance,
                        undefined,
                        multiTokenHolder,
                        "safeBatchTransferFrom",
                        multiTokenHolder,
                        instance.address,
                        [firstTokenId, secondTokenId],
                        [firstAmount, secondAmount],
                        ZERO_BYTES,
                    );
                });
            });
        });

        shouldSupportInterfaces(await instanceGetter(), ["ERC165", "ERC1155"]);
    });
}

function transferWasSuccessful(
    instanceGetter : (redeploy? : boolean) => Promise<ERC1155MMockContract>,
    operator : Address,
    from : Address,
    id : BigNumber,
    value : BigNumber,
    details : TransferDetails
) {
    IT("debits transferred balance from sender", async () => {
        const instance = await instanceGetter();
        const newBalance = await instance.balanceOf(from, id);
        expectBNEqual(newBalance, 0);
    });

    IT("credits transferred balance to receiver", async () => {
        const instance = await instanceGetter();
        const newBalance = await instance.balanceOf(details.to, id);
        expectBNEqual(newBalance, value);
    });

    IT("emits a TransferSingle log", () => {
        expectEvent(details.logs, "TransferSingle", {
            operator,
            from,
            to : details.to,
            id,
            value,
        });
    });
}

function batchTransferWasSuccessful(
    instanceGetter : (redeploy? : boolean) => Promise<ERC1155MMockContract>,
    operator : Address,
    from : Address,
    ids : BigNumber[],
    values : BigNumber[],
    details : TransferDetails
) {
    IT("debits transferred balances from sender", async () => {
        const instance = await instanceGetter();
        const newBalances = await instance.balanceOfBatch(new Array(ids.length).fill(from), ids);
        for (const newBalance of newBalances) {
            expectBNEqual(newBalance, 0);
        }
    });

    IT("credits transferred balances to receiver", async () => {
        const instance = await instanceGetter();
        const newBalances = await instance.balanceOfBatch(new Array(ids.length).fill(details.to), ids);
        for (let i = 0; i < newBalances.length; i++) {
            expectBNEqual(newBalances[i], values[i]);
        }
    });

    IT("emits a TransferBatch log", () => {
        expectEvent(details.logs, "TransferBatch", {
            operator,
            from,
            to : details.to,
            // Ids,
            // values,
        });
    });
}
