import { ERC1155MMockArtifact, ERC1155MMockContract } from "~/abi/ERC1155MMock";
import { redeployContract } from "~/artifacts";
import { DESCRIBE, expectBNEqual, IT } from "~/utils";

export function test_mintTokens(accounts : Address[]) {
    const [transferer, burner] = accounts;

    let instance : ERC1155MMockContract;
    const redeploy = async () => {
        instance = await redeployContract<ERC1155MMockArtifact>(
            "ERC1155MMock",
            {
                redeploy : true,
                args : [""],
            },
        );
    };

    DESCRIBE("basic actions", () => {
        before(async () => {
            await redeploy();
        });

        const tokenID = 1234;
        const mintAmount = 17;
        const transferAmount = 4;
        const burnAmount = 1;

        IT("Should be able to mint NFT token", async () => {
            expectBNEqual(await instance.totalSupply(tokenID), 0);
            expectBNEqual(await instance.balanceOf(transferer, tokenID), 0);

            await instance.mintBatch(
                transferer,
                [tokenID],
                [mintAmount],
                "0x" as Bytes,
            );

            expectBNEqual(await instance.totalSupply(tokenID), mintAmount);
            expectBNEqual(await instance.balanceOf(transferer, tokenID), mintAmount);
        });

        IT("Should be able to transfer NFT token", async () => {
            expectBNEqual(await instance.balanceOf(burner, tokenID), 0);

            await instance.safeTransferFrom(
                transferer,
                burner,
                tokenID,
                transferAmount,
                "0x" as Bytes,
            );

            expectBNEqual(await instance.totalSupply(tokenID), mintAmount);
            expectBNEqual(await instance.balanceOf(transferer, tokenID), mintAmount - transferAmount);
            expectBNEqual(await instance.balanceOf(burner, tokenID), transferAmount);
        });

        IT("Should be able to burn NFT token", async () => {
            await instance.burnBatch(
                burner,
                [tokenID],
                [burnAmount],
            );

            expectBNEqual(await instance.totalSupply(tokenID), mintAmount - burnAmount);
            expectBNEqual(await instance.balanceOf(transferer, tokenID), mintAmount - transferAmount);
            expectBNEqual(await instance.balanceOf(burner, tokenID), transferAmount - burnAmount);
        });
    });
}
