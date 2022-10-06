import { BigNumber } from "ethers";
import { ERC1155MMockArtifact, ERC1155MMockContract } from "~/abi/ERC1155MMock";
import { ERC20EmulatorArtifact, ERC20EmulatorContract } from "~/abi/ERC20Emulator";
import {
    ERC20MetatokenABI,
    ERC20MetatokenArtifact,
    ERC20MetatokenContract,
    ERC20MetatokenMethods,
} from "~/abi/ERC20Metatoken";
import { redeployContract } from "~/artifacts";
import {
    encodeFunctionCalldata,
    getFunctionSelector,
    getProxiedCallOptions,
    metatokenStatusIs,
    METATOKEN_STATUS,
    ProxiedCallOptions,
} from "~/erc1155m";
import { getMetatokenID } from "~/metatokens";
import { CONTRACT, expectBNEqual, expectReversion, IT } from "~/utils";

// The flags for the metatoken hooks
// const CAT_HAS_HOOK_NFT_BURN = 0x01;
// Const CAT_HAS_HOOK_NFT_MINT      = 0x04;
// const CAT_HAS_HOOK_NFT_TRANSFER = 0x08;
// const CAT_HAS_HOOK_META_BURN = 0x10;
const CAT_HAS_HOOK_META_MINT = 0x40;
const CAT_HAS_HOOK_META_TRANSFER = 0x80;

export function runTests() {
    CONTRACT("ERC20Emulator", test_erc20Emulator);
}

function getSelector(func : keyof ERC20MetatokenMethods & string) {
    return getFunctionSelector(ERC20MetatokenABI, func);
}

async function callProxyView(
    instance : ERC1155MMockContract,
    metatokenAddress : Address,
    func : keyof ERC20MetatokenMethods & string,
    options : ProxiedCallOptions,
    calldata : Bytes,
) {
    const result = await instance.proxyMetatokenView(
        metatokenAddress,
        getSelector(func),
        getProxiedCallOptions(options),
        calldata,
    );

    return result;
}

function test_erc20Emulator(accounts : Address[]) {
    const [firstHolder, secondHolder, transferer, recipient] = accounts;

    let erc1155mInstance : ERC1155MMockContract;
    let metatokenInstance : ERC20MetatokenContract;
    let emulatorInstance : ERC20EmulatorContract;

    let tokenId : BigNumber;
    const firstAmount = 100;
    const secondAmount = 200;
    const transferAmount = 50;
    const partialAmount = Math.floor(transferAmount / 2);

    const name = "erc20 emulated";
    const symbol = "ERC20";
    const decimals = 10;

    let proxyCallerView : (
        func : keyof ERC20MetatokenMethods & string,
        options : ProxiedCallOptions,
        calldata : Bytes
    ) => Promise<Bytes>;

    const metatokenHooks = CAT_HAS_HOOK_META_MINT | CAT_HAS_HOOK_META_TRANSFER;

    before(async () => {
        erc1155mInstance = await redeployContract<ERC1155MMockArtifact>(
            "ERC1155MMock",
            {
                args : [""],
            }
        );

        metatokenInstance = await redeployContract<ERC20MetatokenArtifact>(
            "ERC20Metatoken",
            {
                args : [],
            },
        );

        emulatorInstance = await redeployContract<ERC20EmulatorArtifact>(
            "ERC20Emulator",
            {
                args : [],
            },
        );

        tokenId = getMetatokenID(metatokenInstance.address, 1);
        proxyCallerView = callProxyView.bind(undefined, erc1155mInstance, metatokenInstance.address);
    });

    IT("Should be able to initialize emulator", async () => {
        await emulatorInstance.initialize(
            erc1155mInstance.address,
            tokenId,
            metatokenInstance.address,
        );
        await erc1155mInstance.setApprovalForAll(
            emulatorInstance.address,
            true,
            {
                from : firstHolder,
            }
        );
        await erc1155mInstance.setApprovalForAll(
            emulatorInstance.address,
            true,
            {
                from : secondHolder,
            }
        );

        assert.strictEqual(await emulatorInstance.tokenAddress(), erc1155mInstance.address);
        expectBNEqual(await emulatorInstance.tokenId(), tokenId);
        assert.strictEqual(await emulatorInstance.metatokenAddress(), metatokenInstance.address);
    });

    IT("Should be able to register metatoken", async () => {
        await erc1155mInstance.registerMetatoken(metatokenInstance.address, true);

        const details = await erc1155mInstance.getMetatokenDetails(metatokenInstance.address);
        assert.strictEqual(metatokenStatusIs(details.status, METATOKEN_STATUS.REGISTERED), true);
        assert.strictEqual(metatokenStatusIs(details.status, METATOKEN_STATUS.ENABLED), true);
        expectBNEqual(details.hooks, metatokenHooks);
    });

    IT("Should be able to allow proxied functions", async () => {
        // The process for creating the proxied selector is the same for creating the metatoken id.
        const selectors = [
            "initialize",
        ].map((selector) => getSelector(selector as keyof ERC20MetatokenMethods));
        const allowlistSelectors = selectors.map((selector) =>
            getMetatokenID(metatokenInstance.address, BigNumber.from(selector)));

        for (let i = 0; i < allowlistSelectors.length; i++) {
            assert.strictEqual(await erc1155mInstance.isProxiedSelectorAllowed(allowlistSelectors[i]), false);
        }

        await erc1155mInstance.allowMetatokenSelectors(allowlistSelectors);

        for (let i = 0; i < allowlistSelectors.length; i++) {
            assert.strictEqual(await erc1155mInstance.isProxiedSelectorAllowed(allowlistSelectors[i]), true);
        }
    });

    IT("Should be able to initialize metatoken", async () => {
        await erc1155mInstance.proxyMetatokenCall(
            metatokenInstance.address,
            getSelector("initialize"),
            getProxiedCallOptions({
                sendRaw : true,
            }),
            encodeFunctionCalldata(["string", "string", "uint256"], [name, symbol, decimals]),
        );
    });

    IT("Should be able to mint ERC20", async () => {
        await erc1155mInstance.mint(
            firstHolder,
            tokenId,
            firstAmount,
            "0x0" as Bytes
        );
        await erc1155mInstance.mint(
            secondHolder,
            tokenId,
            secondAmount,
            "0x0" as Bytes
        );

        expectBNEqual(await emulatorInstance.balanceOf(firstHolder), firstAmount);
        expectBNEqual(await emulatorInstance.balanceOf(secondHolder), secondAmount);
        expectBNEqual(await emulatorInstance.totalSupply(), firstAmount + secondAmount);
    });

    IT("Should be able to transfer (direct)", async () => {
        await emulatorInstance.transfer(
            recipient,
            transferAmount,
            {
                from : firstHolder,
            },
        );

        expectBNEqual(await emulatorInstance.balanceOf(firstHolder), firstAmount - transferAmount);
        expectBNEqual(await emulatorInstance.balanceOf(recipient), transferAmount);
        expectBNEqual(await emulatorInstance.totalSupply(), firstAmount + secondAmount);
    });

    IT("Should not be able to safeTransfer (not approved)", async () => {
        expectBNEqual(await emulatorInstance.allowance(secondHolder, transferer), 0);

        await expectReversion(
            emulatorInstance,
            "InsufficientAllowance()",
            transferer,
            "transferFrom",
            secondHolder,
            recipient,
            transferAmount
        );
    });

    IT("Should be able to approve transfer", async () => {
        expectBNEqual(await emulatorInstance.allowance(secondHolder, transferer), 0);

        await emulatorInstance.approve(
            transferer,
            transferAmount,
            {
                from : secondHolder,
            },
        );

        expectBNEqual(await emulatorInstance.allowance(secondHolder, transferer), transferAmount);
    });

    IT("Should be able to transfer (partial)", async () => {
        await emulatorInstance.transferFrom(
            secondHolder,
            recipient,
            partialAmount,
            {
                from : transferer,
            }
        );

        expectBNEqual(await emulatorInstance.allowance(secondHolder, transferer), transferAmount - partialAmount);
        expectBNEqual(await emulatorInstance.balanceOf(secondHolder), secondAmount - partialAmount);
        expectBNEqual(await emulatorInstance.balanceOf(recipient), transferAmount + partialAmount);
    });

    IT("Should be able to transfer (full)", async () => {
        await emulatorInstance.transferFrom(
            secondHolder,
            recipient,
            transferAmount - partialAmount,
            {
                from : transferer,
            }
        );

        expectBNEqual(await emulatorInstance.allowance(secondHolder, transferer), 0);
        expectBNEqual(await emulatorInstance.balanceOf(secondHolder), secondAmount - transferAmount);
        expectBNEqual(await emulatorInstance.balanceOf(recipient), transferAmount * 2);
    });
}
