import { ERC1155MMockArtifact, ERC1155MMockContract } from "~/abi/ERC1155MMock";
import { RestrictedMetatokenMockArtifact, RestrictedMetatokenMockContract } from "~/abi/RestrictedMetatokenMock";
import { redeployContract } from "~/artifacts";
import { metatokenStatusIs, METATOKEN_STATUS } from "~/erc1155m";
import { DESCRIBE, expectBNEqual, expectReversion, IT } from "~/utils";
import { getMetatokenID } from ".";

// The flags for the metatoken hooks
const CAT_HAS_HOOK_NFT_BURN = 0x01;
// Const CAT_HAS_HOOK_NFT_MINT      = 0x04;
const CAT_HAS_HOOK_NFT_TRANSFER = 0x08;
const CAT_HAS_HOOK_META_BURN = 0x10;
const CAT_HAS_HOOK_META_MINT = 0x40;
const CAT_HAS_HOOK_META_TRANSFER = 0x80;

export function test_registerMetatoken(accounts : Address[]) {
    const [admin, other] = accounts;

    const etatokenHooks =
        CAT_HAS_HOOK_NFT_BURN |
        CAT_HAS_HOOK_NFT_TRANSFER |
        CAT_HAS_HOOK_META_BURN |
        CAT_HAS_HOOK_META_MINT |
        CAT_HAS_HOOK_META_TRANSFER;

    let coreInstance : ERC1155MMockContract;
    let metatokenInstance : RestrictedMetatokenMockContract;
    const redeploy = async () => {
        coreInstance = await redeployContract<ERC1155MMockArtifact>(
            "ERC1155MMock",
            {
                redeploy : true,
                args : [""],
            },
        );
        metatokenInstance = await redeployContract<RestrictedMetatokenMockArtifact>(
            "RestrictedMetatokenMock",
            {
                redeploy : true,
                args : [],
            },
        );
    };

    DESCRIBE("metatoken registrations", () => {
        const tokenID = 1;
        let metatokenID : BigNumber;
        const initialValue = 1000;
        const secondValue = 1500;
        const thirdValue = 500;

        before(async () => {
            await redeploy();
            metatokenID = getMetatokenID(metatokenInstance.address, tokenID);
        });

        IT("should be able to register", async () => {
            let { status, hooks } = await coreInstance.getMetatokenDetails(metatokenInstance.address);
            assert.strictEqual(metatokenStatusIs(status, METATOKEN_STATUS.REGISTERED), false);
            assert.strictEqual(metatokenStatusIs(status, METATOKEN_STATUS.IS_IMPLEMENTATION), false);
            assert.strictEqual(metatokenStatusIs(status, METATOKEN_STATUS.ENABLED), false);
            expectBNEqual(hooks, 0);

            await coreInstance.registerMetatoken(
                metatokenInstance.address,
                true
            );

            ({ status, hooks } = await coreInstance.getMetatokenDetails(metatokenInstance.address));
            assert.strictEqual(metatokenStatusIs(status, METATOKEN_STATUS.REGISTERED), true);
            assert.strictEqual(metatokenStatusIs(status, METATOKEN_STATUS.IS_IMPLEMENTATION), false);
            assert.strictEqual(metatokenStatusIs(status, METATOKEN_STATUS.ENABLED), true);
            expectBNEqual(hooks, etatokenHooks);
        });

        IT("should not be able to mint value token for nonexistent NFT", async () => {
            await expectReversion(
                coreInstance,
                undefined, // "NoNFTSupply()",
                admin,
                "mintBatch",
                admin,
                [metatokenID],
                [initialValue],
                "0x0" as Bytes,
            );
        });

        IT("should be able to mint NFT", async () => {
            expectBNEqual(await coreInstance.totalSupply(tokenID), 0);
            await coreInstance.mintBatch(
                admin,
                [tokenID],
                [1],
                "0x0" as Bytes,
            );
            expectBNEqual(await coreInstance.totalSupply(tokenID), 1);
            expectBNEqual(await coreInstance.balanceOf(admin, tokenID), 1);
        });

        IT("should be able to mint value token", async () => {
            expectBNEqual(await coreInstance.totalSupply(metatokenID), 0);
            await coreInstance.mintBatch(
                admin,
                [metatokenID],
                [initialValue],
                "0x0" as Bytes,
            );
            expectBNEqual(await coreInstance.totalSupply(metatokenID), initialValue);
            expectBNEqual(await coreInstance.balanceOf(admin, metatokenID), initialValue);
        });

        IT("should not be able to transfer NFT", async () => {
            await expectReversion(
                coreInstance,
                undefined, // "BurnMetaFirst()",
                admin,
                "safeTransferFrom",
                admin,
                other,
                tokenID,
                1,
                "0x0" as Bytes,
            );
        });

        IT("should not be able to burn NFT", async () => {
            await expectReversion(
                coreInstance,
                undefined, // "BurnMetaFirst()",
                admin,
                "burnBatch",
                admin,
                [tokenID],
                [1],
            );
        });

        IT("should not be able to partially transfer value token", async () => {
            await expectReversion(
                coreInstance,
                undefined, // "FullSupplyOnly()",
                admin,
                "safeTransferFrom",
                admin,
                other,
                metatokenID,
                initialValue - 1,
                "0x0" as Bytes,
            );
        });

        IT("should be able to transfer value token", async () => {
            expectBNEqual(await coreInstance.balanceOf(admin, metatokenID), initialValue);
            expectBNEqual(await coreInstance.balanceOf(other, metatokenID), 0);
            await coreInstance.safeTransferFrom(
                admin,
                other,
                metatokenID,
                initialValue,
                "0x0" as Bytes
            );
            expectBNEqual(await coreInstance.balanceOf(admin, metatokenID), 0);
            expectBNEqual(await coreInstance.balanceOf(other, metatokenID), initialValue);
        });

        IT("should not be able to mint value token", async () => {
            await expectReversion(
                coreInstance,
                undefined, // "TokenLocked()",
                admin,
                "mintBatch",
                admin,
                [metatokenID],
                [1],
                "0x0" as Bytes,
            );
        });

        IT("should not be able to burn value token", async () => {
            await expectReversion(
                coreInstance,
                undefined, // "FullMetaBurnRequired()",
                other,
                "burnBatch",
                other,
                [metatokenID],
                [1],
                "0x0" as Bytes,
            );
        });

        IT("should be able to mint additional value tokens", async () => {
            expectBNEqual(await coreInstance.balanceOf(other, metatokenID), initialValue);
            expectBNEqual(await coreInstance.balanceOf(coreInstance.address, metatokenID), 0);
            await coreInstance.safeTransferFrom(
                other,
                coreInstance.address,
                metatokenID,
                initialValue,
                "0x0" as Bytes,
                {
                    from : other,
                },
            );
            expectBNEqual(await coreInstance.balanceOf(other, metatokenID), 0);
            expectBNEqual(await coreInstance.balanceOf(coreInstance.address, metatokenID), initialValue);

            expectBNEqual(await coreInstance.totalSupply(metatokenID), initialValue);
            await coreInstance.mintBatch(
                coreInstance.address,
                [metatokenID],
                [secondValue - initialValue],
                "0x0" as Bytes,
            );
            expectBNEqual(await coreInstance.totalSupply(metatokenID), secondValue);
            expectBNEqual(await coreInstance.balanceOf(coreInstance.address, metatokenID), secondValue);
        });

        IT("should not be able to partially burn value tokens", async () => {
            await expectReversion(
                coreInstance,
                undefined,
                admin,
                "burnBatch",
                coreInstance.address,
                [metatokenID],
                [secondValue - thirdValue],
            );
        });

        IT("should be able to burn value tokens", async () => {
            await coreInstance.burnBatch(
                coreInstance.address,
                [metatokenID],
                [secondValue],
            );
            expectBNEqual(await coreInstance.totalSupply(metatokenID), 0);
            expectBNEqual(await coreInstance.balanceOf(coreInstance.address, metatokenID), 0);
        });

        IT("should be able to transfer NFT", async () => {
            expectBNEqual(await coreInstance.balanceOf(admin, tokenID), 1);
            expectBNEqual(await coreInstance.balanceOf(other, tokenID), 0);
            await coreInstance.safeTransferFrom(
                admin,
                other,
                tokenID,
                1,
                "0x0" as Bytes,
            );
            expectBNEqual(await coreInstance.balanceOf(admin, tokenID), 0);
            expectBNEqual(await coreInstance.balanceOf(other, tokenID), 1);
        });
    });
}
