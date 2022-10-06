// The MIT License (MIT)
// https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/test/token/ERC1155/ERC1155.test.js

import { BigNumber } from "ethers";
import {
    ERC1155MMockArtifact,
    ERC1155MMockContract,
    ERC1155MMockEvents,
} from "~/abi/ERC1155MMock";
import { redeployContract } from "~/artifacts";
import { CallResult } from "~/transactions";
import {
    bignumberFrom,
    CONTEXT,
    DESCRIBE,
    expectEvent,
    expectNoEvent,
    expectNoEventInConstruction,
    expectReversion,
    IT,
    numberIs,
    ZERO_ADDRESS,
} from "~/utils";
import { shouldBehaveLikeERC1155 } from "./erc1155Behaviour";

const ARTIFACT = "ERC1155MMock";

export function test_ERC1155(accounts : Address[]) {
    const [
        operator,
        tokenHolder,
        tokenBatchHolder,
        minter,
        firstTokenHolder,
        secondTokenHolder,
        multiTokenHolder,
        recipient,
        proxy,
    ] = accounts;

    const initialURI = "https://token-cdn-domain/{id}.json";

    let instance : ERC1155MMockContract;
    const getInstance = async (redeploy = false) => {
        if (redeploy || instance as unknown === undefined) {
            instance = await redeployContract<ERC1155MMockArtifact>(
                ARTIFACT,
                {
                    redeploy : true,
                    args : [initialURI],
                }
            );
        }

        return instance;
    };

    beforeEach(async () => {
        await getInstance(true);
    });

    shouldBehaveLikeERC1155(
        getInstance,
        minter,
        firstTokenHolder,
        secondTokenHolder,
        multiTokenHolder,
        recipient,
        proxy
    );

    DESCRIBE("internal functions", () => {
        const tokenId = BigNumber.from(1990);
        const mintAmount = BigNumber.from(9001);
        const burnAmount = BigNumber.from(3000);

        const tokenBatchIds = [BigNumber.from(2000), BigNumber.from(2010), BigNumber.from(2020)];
        const mintAmounts = [BigNumber.from(5000), BigNumber.from(10000), BigNumber.from(42195)];
        const burnAmounts = [BigNumber.from(5000), BigNumber.from(9001), BigNumber.from(195)];

        const data = "0x12345678" as Bytes;

        DESCRIBE("_mint", () => {
            let receipt : CallResult<ERC1155MMockEvents>;

            IT("reverts with a zero destination address", async () => {
                await expectReversion(
                    instance,
                    undefined,
                    operator,
                    "mint",
                    ZERO_ADDRESS,
                    tokenId,
                    mintAmount,
                    data
                );
            });

            CONTEXT("with minted tokens", () => {
                beforeEach(async () => {
                    receipt = await instance.mint(tokenHolder, tokenId, mintAmount, data, { from : operator });
                });

                IT("emits a TransferSingle event", () => {
                    expectEvent(receipt, "TransferSingle", {
                        operator,
                        from : ZERO_ADDRESS,
                        to : tokenHolder,
                        id : tokenId,
                        value : mintAmount,
                    });
                });

                IT("credits the minted amount of tokens", async () => {
                    await numberIs(instance, mintAmount, "", "balanceOf", tokenHolder, tokenId);
                });
            });
        });

        DESCRIBE("_mintBatch", () => {
            IT("reverts with a zero destination address", async () => {
                await expectReversion(
                    instance,
                    undefined,
                    operator,
                    "mintBatch",
                    ZERO_ADDRESS,
                    tokenBatchIds,
                    mintAmounts,
                    data,
                );
            });

            IT("reverts if length of inputs do not match", async () => {
                await expectReversion(
                    instance,
                    undefined,
                    operator,
                    "mintBatch",
                    tokenBatchHolder,
                    tokenBatchIds,
                    mintAmounts.slice(1),
                    data,
                );

                await expectReversion(
                    instance,
                    undefined,
                    operator,
                    "mintBatch",
                    tokenBatchHolder,
                    tokenBatchIds.slice(1),
                    mintAmounts,
                    data,
                );
            });

            CONTEXT("with minted batch of tokens", () => {
                let receipt : CallResult<ERC1155MMockEvents>;

                beforeEach(async () => {
                    receipt = await instance.mintBatch(
                        tokenBatchHolder,
                        tokenBatchIds,
                        mintAmounts,
                        data,
                        { from : operator },
                    );
                });

                IT("emits a TransferBatch event", () => {
                    expectEvent(receipt, "TransferBatch", {
                        operator,
                        from : ZERO_ADDRESS,
                        to : tokenBatchHolder,
                    });
                });

                IT("credits the minted batch of tokens", async () => {
                    const holderBatchBalances = await instance.balanceOfBatch(
                        new Array(tokenBatchIds.length).fill(tokenBatchHolder),
                        tokenBatchIds,
                    );

                    for (let i = 0; i < holderBatchBalances.length; i++) {
                        assert.strictEqual(
                            bignumberFrom(holderBatchBalances[i]).toHexString(),
                            mintAmounts[i].toHexString()
                        );
                    }
                });
            });
        });

        DESCRIBE("_burn", () => {
            IT("reverts when burning the zero account's tokens", async () => {
                await expectReversion(instance, undefined, operator, "burn", ZERO_ADDRESS, tokenId, mintAmount,);
            });

            IT("reverts when burning a non-existent token id", async () => {
                await expectReversion(instance, undefined, operator, "burn", tokenHolder, tokenId, mintAmount,);
            });

            IT("reverts when burning more than available tokens", async () => {
                await instance.mint(
                    tokenHolder,
                    tokenId,
                    mintAmount,
                    data,
                    { from : operator },
                );

                await expectReversion(
                    instance,
                    undefined,
                    operator,
                    "burn",
                    tokenHolder,
                    tokenId,
                    mintAmount.add(1),
                );
            });

            CONTEXT("with minted-then-burnt tokens", () => {
                let receipt : CallResult<ERC1155MMockEvents>;

                beforeEach(async () => {
                    await instance.mint(tokenHolder, tokenId, mintAmount, data);
                    receipt = await instance.burn(
                        tokenHolder,
                        tokenId,
                        burnAmount,
                        { from : operator },
                    );
                });

                IT("emits a TransferSingle event", () => {
                    expectEvent(receipt, "TransferSingle", {
                        operator,
                        from : tokenHolder,
                        to : ZERO_ADDRESS,
                        id : tokenId,
                        value : burnAmount,
                    });
                });

                IT("accounts for both minting and burning", async () => {
                    await numberIs(instance, mintAmount.sub(burnAmount), "", "balanceOf", tokenHolder, tokenId);
                });
            });
        });

        DESCRIBE("_burnBatch", () => {
            IT("reverts when burning the zero account's tokens", async () => {
                await expectReversion(
                    instance,
                    undefined,
                    operator,
                    "burnBatch",
                    ZERO_ADDRESS,
                    tokenBatchIds,
                    burnAmounts,
                );
            });

            IT("reverts if length of inputs do not match", async () => {
                await expectReversion(
                    instance,
                    undefined,
                    operator,
                    "burnBatch",
                    tokenBatchHolder,
                    tokenBatchIds,
                    burnAmounts.slice(1),
                );

                await expectReversion(
                    instance,
                    undefined,
                    operator,
                    "burnBatch",
                    tokenBatchHolder,
                    tokenBatchIds.slice(1),
                    burnAmounts,
                );
            });

            IT("reverts when burning a non-existent token id", async () => {
                await expectReversion(
                    instance,
                    undefined,
                    operator,
                    "burnBatch",
                    tokenBatchHolder,
                    tokenBatchIds,
                    burnAmounts,
                );
            });

            CONTEXT("with minted-then-burnt tokens", () => {
                let receipt : CallResult<ERC1155MMockEvents>;

                beforeEach(async () => {
                    await instance.mintBatch(tokenBatchHolder, tokenBatchIds, mintAmounts, data);
                    receipt = await instance.burnBatch(
                        tokenBatchHolder,
                        tokenBatchIds,
                        burnAmounts,
                        { from : operator },
                    );
                });

                IT("emits a TransferBatch event", () => {
                    expectEvent(receipt, "TransferBatch", {
                        operator,
                        from : tokenBatchHolder,
                        to : ZERO_ADDRESS,
                        // Ids: tokenBatchIds,
                        // values: burnAmounts,
                    });
                });

                IT("accounts for both minting and burning", async () => {
                    const holderBatchBalances = await instance.balanceOfBatch(
                        new Array(tokenBatchIds.length).fill(tokenBatchHolder),
                        tokenBatchIds,
                    );

                    for (let i = 0; i < holderBatchBalances.length; i++) {
                        assert.strictEqual(
                            bignumberFrom(holderBatchBalances[i]).toHexString(),
                            mintAmounts[i].sub(burnAmounts[i]).toHexString()
                        );
                    }
                });
            });
        });
    });

    DESCRIBE("ERC1155MetadataURI", () => {
        const firstTokenID = BigNumber.from(42);
        const secondTokenID = BigNumber.from(1337);

        IT("emits no URI event in constructor", async () => {
            await expectNoEventInConstruction(instance, "URI");
        });

        IT("sets the initial URI for all token types", async () => {
            assert.strictEqual(await instance.uri(firstTokenID), initialURI);
            assert.strictEqual(await instance.uri(secondTokenID), initialURI);
        });

        DESCRIBE("_setURI", () => {
            const newURI = "https://token-cdn-domain/{locale}/{id}.json";

            IT("emits no URI event", async () => {
                const receipt = await instance.setURI(newURI);

                expectNoEvent(receipt, "URI");
            });

            IT("sets the new URI for all token types", async () => {
                await instance.setURI(newURI);

                assert.strictEqual(await instance.uri(firstTokenID), newURI);
                assert.strictEqual(await instance.uri(secondTokenID), newURI);
            });
        });
    });
}
