import { BigNumber } from "ethers";
import { ERC1155MMockArtifact, ERC1155MMockContract } from "~/abi/ERC1155MMock";
import { redeployContract } from "~/artifacts";
import { CONTEXT, expectBNEqual, IT } from "~/utils";

const ARTIFACT = "ERC1155MMock";

export function test_ERC1155Supply(accounts : Address[]) {
    const [holder] = accounts;

    const initialURI = "https://token.com";

    const firstTokenId = BigNumber.from(37);
    const firstTokenAmount = BigNumber.from(42);

    const secondTokenId = BigNumber.from(19842);
    const secondTokenAmount = BigNumber.from(23);

    let instance : ERC1155MMockContract;
    beforeEach(async () => {
        instance = await redeployContract<ERC1155MMockArtifact>(
            ARTIFACT,
            {
                redeploy : true,
                args : [initialURI],
            }
        );
    });

    CONTEXT("before mint", () => {
        IT("exist", async () => {
            assert.strictEqual(await instance.exists(firstTokenId), false);
        });

        IT("totalSupply", async () => {
            expectBNEqual(await instance.totalSupply(firstTokenId), 0);
        });
    });

    CONTEXT("after mint", () => {
        CONTEXT("single", () => {
            beforeEach(async () => {
                await instance.mint(holder, firstTokenId, firstTokenAmount, "0x" as Bytes);
            });

            IT("exist", async () => {
                assert.strictEqual(await instance.exists(firstTokenId), true);
            });

            IT("totalSupply", async () => {
                expectBNEqual(await instance.totalSupply(firstTokenId), firstTokenAmount);
            });
        });

        CONTEXT("batch", () => {
            beforeEach(async () => {
                await instance.mintBatch(
                    holder,
                    [firstTokenId, secondTokenId],
                    [firstTokenAmount, secondTokenAmount],
                    "0x" as Bytes,
                );
            });

            IT("exist", async () => {
                assert.strictEqual(await instance.exists(firstTokenId), true);
                assert.strictEqual(await instance.exists(secondTokenId), true);
            });

            IT("totalSupply", async () => {
                expectBNEqual(await instance.totalSupply(firstTokenId), firstTokenAmount);
                expectBNEqual(await instance.totalSupply(secondTokenId), secondTokenAmount);
            });
        });
    });

    CONTEXT("after burn", () => {
        CONTEXT("single", () => {
            beforeEach(async () => {
                await instance.mint(holder, firstTokenId, firstTokenAmount, "0x" as Bytes);
                await instance.burn(holder, firstTokenId, firstTokenAmount);
            });

            IT("exist", async () => {
                assert.strictEqual(await instance.exists(firstTokenId), false);
            });

            IT("totalSupply", async () => {
                expectBNEqual(await instance.totalSupply(firstTokenId), 0);
            });
        });

        CONTEXT("batch", () => {
            beforeEach(async () => {
                await instance.mintBatch(
                    holder,
                    [firstTokenId, secondTokenId],
                    [firstTokenAmount, secondTokenAmount],
                    "0x" as Bytes,
                );
                await instance.burnBatch(
                    holder,
                    [firstTokenId, secondTokenId],
                    [firstTokenAmount, secondTokenAmount],
                );
            });

            IT("exist", async () => {
                assert.strictEqual(await instance.exists(firstTokenId), false);
                assert.strictEqual(await instance.exists(secondTokenId), false);
            });

            IT("totalSupply", async () => {
                expectBNEqual(await instance.totalSupply(firstTokenId), 0);
                expectBNEqual(await instance.totalSupply(secondTokenId), 0);
            });
        });
    });
}
