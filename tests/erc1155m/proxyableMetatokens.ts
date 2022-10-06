import { BigNumber } from "ethers";
import { Interface } from "ethers/lib/utils";
import { ERC1155MMockABI, ERC1155MMockArtifact, ERC1155MMockContract } from "~/abi/ERC1155MMock";
import {
    ProxyableMetatokenMockABI,
    ProxyableMetatokenMockArtifact,
    ProxyableMetatokenMockContract,
    ProxyableMetatokenMockMethods,
} from "~/abi/ProxyableMetatokenMock";
import { redeployContract } from "~/artifacts";
import { addressIs, CONSOLE, CONTRACT, expectBNEqual, expectReversion, IT } from "~/utils";
import { getMetatokenID } from "~/metatokens";
import {
    decodeProxiedCallResult,
    encodeFunctionCalldata,
    getFunctionSelector,
    getProxiedCallOptions,
    metatokenStatusIs,
    METATOKEN_STATUS,
    ProxiedCallOptions,
} from ".";

// The flags for the metatoken hooks
// const CAT_HAS_HOOK_NFT_BURN = 0x01;
// Const CAT_HAS_HOOK_NFT_MINT      = 0x04;
// const CAT_HAS_HOOK_NFT_TRANSFER = 0x08;
const CAT_HAS_HOOK_META_BURN = 0x10;
const CAT_HAS_HOOK_META_MINT = 0x40;
const CAT_HAS_HOOK_META_TRANSFER = 0x80;


export function runTests() {
    CONTRACT("Proxyable metatokens - simple view", test_simpleView);
    CONTRACT("Proxyable metatokens - complex view", test_complexView);
    CONTRACT("Proxyable metatokens - proxy call", test_proxyCall);
    CONTRACT("Proxyable metatokens - updating implementations", test_updatingImplementation);
}

function getSelector(func : keyof ProxyableMetatokenMockMethods & string) {
    return getFunctionSelector(ProxyableMetatokenMockABI, func);
}

function getUintCalldata(uint : BigNumberish) {
    return encodeFunctionCalldata(["uint256"], [uint]);
}

async function callProxyView(
    instance : ERC1155MMockContract,
    metatokenAddress : Address,
    func : keyof ProxyableMetatokenMockMethods & string,
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

function test_simpleView(accounts : Address[]) {
    const [firstHolder] = accounts;

    let erc1155mInstance : ERC1155MMockContract;
    let metatokenInstance : ProxyableMetatokenMockContract;

    let proxyCallerView : (
        func : keyof ProxyableMetatokenMockMethods & string,
        options : ProxiedCallOptions,
        calldata : Bytes
    ) => Promise<Bytes>;

    const metatokenHooks =
        CAT_HAS_HOOK_META_BURN |
        CAT_HAS_HOOK_META_MINT |
        CAT_HAS_HOOK_META_TRANSFER;

    before(async () => {
        erc1155mInstance = await redeployContract<ERC1155MMockArtifact>(
            "ERC1155MMock",
            {
                args : [""],
            }
        );

        metatokenInstance = await redeployContract<ProxyableMetatokenMockArtifact>(
            "ProxyableMetatokenMock",
            {
                args : [],
            },
        );

        proxyCallerView = callProxyView.bind(undefined, erc1155mInstance, metatokenInstance.address);
    });

    IT("Should be able to register metatoken", async () => {
        let details = await erc1155mInstance.getMetatokenDetails(metatokenInstance.address);
        assert.strictEqual(metatokenStatusIs(details.status, METATOKEN_STATUS.REGISTERED), false);
        assert.strictEqual(metatokenStatusIs(details.status, METATOKEN_STATUS.ENABLED), false);
        expectBNEqual(details.hooks, 0);

        await erc1155mInstance.registerMetatoken(metatokenInstance.address, true);

        details = await erc1155mInstance.getMetatokenDetails(metatokenInstance.address);
        assert.strictEqual(metatokenStatusIs(details.status, METATOKEN_STATUS.REGISTERED), true);
        assert.strictEqual(metatokenStatusIs(details.status, METATOKEN_STATUS.ENABLED), true);
        expectBNEqual(details.hooks, metatokenHooks);
    });

    IT("Should not be able to call non-allowed proxied function", async () => {
        const amount = 42;

        const selector = getSelector("simpleView");

        await expectReversion(
            erc1155mInstance,
            "NotAllowedMetatokenSelector()",
            firstHolder,
            "proxyMetatokenView",
            metatokenInstance.address,
            selector,
            getProxiedCallOptions({ sendRaw : true }),
            getUintCalldata(amount),
        );
    });

    IT("Should be able to allow proxied functions", async () => {
        // The process for creating the proxied selector is the same for creating the metatoken id.
        const selectors = [
            "simpleView",
            "simpleView2",
        ].map((selector) => getSelector(selector as keyof ProxyableMetatokenMockMethods));
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

    IT("Should be able to call a proxied function (without sender)", async () => {
        const amount = 42;

        const result = await proxyCallerView(
            "simpleView",
            { sendRaw : true },
            getUintCalldata(amount),
        );

        const resultAmount = decodeProxiedCallResult(["uint256"], result)[0];

        expectBNEqual(resultAmount, amount * 2);
    });

    IT("Should be able to call a proxied function (with sender)", async () => {
        const amount = 42;

        const result = await proxyCallerView(
            "simpleView2",
            {
                includeSender : true,
                sendRaw : true,
            },
            getUintCalldata(amount),
        );

        const resultAmount = decodeProxiedCallResult(["uint256"], result)[0];

        expectBNEqual(resultAmount, amount * 3);
    });

    IT("Should be able to deny a proxied function", async () => {
        // The process for creating the proxied selector is the same for creating the metatoken id.
        const selector = getSelector("simpleView");
        const allowlistSelector = getMetatokenID(metatokenInstance.address, BigNumber.from(selector));

        assert.strictEqual(await erc1155mInstance.isProxiedSelectorAllowed(allowlistSelector), true);

        await erc1155mInstance.denyMetatokenSelectors([allowlistSelector]);

        assert.strictEqual(await erc1155mInstance.isProxiedSelectorAllowed(allowlistSelector), false);
    });

    IT("Should not be able to call the denied proxied function", async () => {
        const amount = 42;

        const selector = getSelector("simpleView");

        await expectReversion(
            erc1155mInstance,
            "NotAllowedMetatokenSelector()",
            firstHolder,
            "proxyMetatokenView",
            metatokenInstance.address,
            selector,
            getProxiedCallOptions({ sendRaw : true }),
            getUintCalldata(amount),
        );
    });
}

function test_complexView(accounts : Address[]) {
    const [firstHolder, secondHolder] = accounts;

    let erc1155mInstance : ERC1155MMockContract;
    let metatokenInstance : ProxyableMetatokenMockContract;

    let tokenId : BigNumber;

    let proxyCallerView : (
        func : keyof ProxyableMetatokenMockMethods & string,
        options : ProxiedCallOptions,
        calldata : Bytes
    ) => Promise<Bytes>;

    const metatokenHooks =
        CAT_HAS_HOOK_META_BURN |
        CAT_HAS_HOOK_META_MINT |
        CAT_HAS_HOOK_META_TRANSFER;

    before(async () => {
        CONSOLE.log(new Interface(ERC1155MMockABI).getSighash("proxyMetatokenCall"));
        erc1155mInstance = await redeployContract<ERC1155MMockArtifact>(
            "ERC1155MMock",
            {
                args : [""],
            }
        );

        metatokenInstance = await redeployContract<ProxyableMetatokenMockArtifact>(
            "ProxyableMetatokenMock",
            {
                args : [],
            },
        );

        tokenId = getMetatokenID(metatokenInstance.address, 1);
        proxyCallerView = callProxyView.bind(undefined, erc1155mInstance, metatokenInstance.address);
    });

    IT("Should be able to register metatoken", async () => {
        let details = await erc1155mInstance.getMetatokenDetails(metatokenInstance.address);
        assert.strictEqual(metatokenStatusIs(details.status, METATOKEN_STATUS.REGISTERED), false);
        assert.strictEqual(metatokenStatusIs(details.status, METATOKEN_STATUS.ENABLED), false);
        expectBNEqual(details.hooks, 0);

        await erc1155mInstance.registerMetatoken(metatokenInstance.address, true);

        details = await erc1155mInstance.getMetatokenDetails(metatokenInstance.address);
        assert.strictEqual(metatokenStatusIs(details.status, METATOKEN_STATUS.REGISTERED), true);
        assert.strictEqual(metatokenStatusIs(details.status, METATOKEN_STATUS.ENABLED), true);
        expectBNEqual(details.hooks, metatokenHooks);
    });

    IT("Should be able to mint token", async () => {
        await erc1155mInstance.mint(firstHolder, tokenId, 1, "0x0" as Bytes);

        expectBNEqual(await erc1155mInstance.totalSupply(tokenId), 1);
        expectBNEqual(await erc1155mInstance.balanceOf(firstHolder, tokenId), 1);
    });

    IT("Should be able to transfer token", async () => {
        await erc1155mInstance.safeTransferFrom(
            firstHolder,
            secondHolder,
            tokenId,
            1,
            "0x0" as Bytes,
            { from : firstHolder }
        );

        expectBNEqual(await erc1155mInstance.totalSupply(tokenId), 1);
        expectBNEqual(await erc1155mInstance.balanceOf(firstHolder, tokenId), 0);
        expectBNEqual(await erc1155mInstance.balanceOf(secondHolder, tokenId), 1);
    });

    IT("Should be able to allow proxied function", async () => {
        // The process for creating the proxied selector is the same for creating the metatoken id.
        const selector = getSelector("getPreviousHolder");
        const allowlistSelector = getMetatokenID(metatokenInstance.address, BigNumber.from(selector));

        assert.strictEqual(await erc1155mInstance.isProxiedSelectorAllowed(allowlistSelector), false);

        await erc1155mInstance.allowMetatokenSelectors([allowlistSelector]);

        assert.strictEqual(await erc1155mInstance.isProxiedSelectorAllowed(allowlistSelector), true);
    });

    IT("Should be able to get the previous holder", async () => {
        const result = await proxyCallerView(
            "getPreviousHolder",
            {
                sendRaw : true,
            },
            getUintCalldata(tokenId)
        );

        const previousHolder = decodeProxiedCallResult(["address"], result)[0];

        assert.equal(previousHolder, firstHolder);
    });
}


function test_proxyCall(accounts : Address[]) {
    const [firstHolder, secondHolder, thirdHolder] = accounts;

    let erc1155mInstance : ERC1155MMockContract;
    let metatokenInstance : ProxyableMetatokenMockContract;

    let tokenId : BigNumber;

    let proxyCallerView : (
        func : keyof ProxyableMetatokenMockMethods & string,
        options : ProxiedCallOptions,
        calldata : Bytes
    ) => Promise<Bytes>;

    const metatokenHooks =
        CAT_HAS_HOOK_META_BURN |
        CAT_HAS_HOOK_META_MINT |
        CAT_HAS_HOOK_META_TRANSFER;

    before(async () => {
        CONSOLE.log(new Interface(ERC1155MMockABI).getSighash("proxyMetatokenCall"));
        erc1155mInstance = await redeployContract<ERC1155MMockArtifact>(
            "ERC1155MMock",
            {
                args : [""],
            }
        );

        metatokenInstance = await redeployContract<ProxyableMetatokenMockArtifact>(
            "ProxyableMetatokenMock",
            {
                args : [],
            },
        );

        tokenId = getMetatokenID(metatokenInstance.address, 1);

        proxyCallerView = callProxyView.bind(undefined, erc1155mInstance, metatokenInstance.address);
    });

    IT("Should be able to register metatoken", async () => {
        let details = await erc1155mInstance.getMetatokenDetails(metatokenInstance.address);
        assert.strictEqual(metatokenStatusIs(details.status, METATOKEN_STATUS.REGISTERED), false);
        assert.strictEqual(metatokenStatusIs(details.status, METATOKEN_STATUS.ENABLED), false);
        expectBNEqual(details.hooks, 0);

        await erc1155mInstance.registerMetatoken(metatokenInstance.address, true);

        details = await erc1155mInstance.getMetatokenDetails(metatokenInstance.address);
        assert.strictEqual(metatokenStatusIs(details.status, METATOKEN_STATUS.REGISTERED), true);
        assert.strictEqual(metatokenStatusIs(details.status, METATOKEN_STATUS.ENABLED), true);
        expectBNEqual(details.hooks, metatokenHooks);
    });

    IT("Should be able to mint token", async () => {
        await erc1155mInstance.mint(firstHolder, tokenId, 1, "0x0" as Bytes);

        expectBNEqual(await erc1155mInstance.totalSupply(tokenId), 1);
        expectBNEqual(await erc1155mInstance.balanceOf(firstHolder, tokenId), 1);
    });

    IT("Should be able to transfer token", async () => {
        await erc1155mInstance.safeTransferFrom(
            firstHolder,
            secondHolder,
            tokenId,
            1,
            "0x0" as Bytes,
            { from : firstHolder }
        );

        expectBNEqual(await erc1155mInstance.totalSupply(tokenId), 1);
        expectBNEqual(await erc1155mInstance.balanceOf(firstHolder, tokenId), 0);
        expectBNEqual(await erc1155mInstance.balanceOf(secondHolder, tokenId), 1);
    });

    IT("Should be able to allow proxied functions", async () => {
        // The process for creating the proxied selector is the same for creating the metatoken id.
        const selectors = [
            "getTokenName",
            "setTokenName",
        ].map((selector) => getSelector(selector as keyof ProxyableMetatokenMockMethods));
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

    IT("Should not be able to get the token name - not owner", async () => {
        const selector = getFunctionSelector<ProxyableMetatokenMockMethods>(
            ProxyableMetatokenMockABI,
            "getTokenName"
        );

        await expectReversion(
            erc1155mInstance,
            "NotOwnerOrPreviousOwner()",
            thirdHolder,
            "proxyMetatokenView",
            metatokenInstance.address,
            selector,
            getProxiedCallOptions({
                includeSender : true,
                sendRaw : true,
            }),
            getUintCalldata(tokenId),
        );
    });

    IT("Should be able to set the token name", async () => {
        const tokenName = "test token name";

        let getNameResult = await proxyCallerView(
            "getTokenName",
            {
                includeSender : true,
                sendRaw : true,
            },
            getUintCalldata(tokenId),
        );
        let name = decodeProxiedCallResult(["string"], getNameResult)[0];
        assert.strictEqual(name, "");

        await erc1155mInstance.proxyMetatokenCall(
            metatokenInstance.address,
            getSelector("setTokenName"),
            getProxiedCallOptions({
                sendRaw : true,
            }),
            encodeFunctionCalldata(["uint256", "string"], [tokenId, tokenName]),
            {
                from : secondHolder,
            }
        );

        getNameResult = await proxyCallerView(
            "getTokenName",
            {
                includeSender : true,
                sendRaw : true,
            },
            getUintCalldata(tokenId),
        );
        name = decodeProxiedCallResult(["string"], getNameResult)[0];
        assert.strictEqual(name, tokenName);
    });
}


function test_updatingImplementation(accounts : Address[]) {
    const [firstHolder] = accounts;

    let erc1155mInstance : ERC1155MMockContract;
    let metatokenInstance : ProxyableMetatokenMockContract;
    let metatokenInstance2 : ProxyableMetatokenMockContract;
    let implementationInstance : ProxyableMetatokenMockContract;

    const metatokenHooks =
        CAT_HAS_HOOK_META_BURN |
        CAT_HAS_HOOK_META_MINT |
        CAT_HAS_HOOK_META_TRANSFER;

    const tokenId = BigNumber.from(1);
    let metatokenTokenId1 : BigNumber;
    let implementationTokenId1 : BigNumber;
    let metatokenTokenId2 : BigNumber;

    before(async () => {
        CONSOLE.log(new Interface(ERC1155MMockABI).getSighash("proxyMetatokenCall"));
        erc1155mInstance = await redeployContract<ERC1155MMockArtifact>(
            "ERC1155MMock",
            {
                args : [""],
            }
        );

        metatokenInstance = await redeployContract<ProxyableMetatokenMockArtifact>(
            "ProxyableMetatokenMock",
            {
                args : [],
            },
        );
        metatokenTokenId1 = getMetatokenID(metatokenInstance.address, tokenId);
        metatokenTokenId2 = metatokenTokenId1.add(1);

        metatokenInstance2 = await redeployContract<ProxyableMetatokenMockArtifact>(
            "ProxyableMetatokenMock",
            {
                args : [],
            },
        );

        implementationInstance = await redeployContract<ProxyableMetatokenMockArtifact>(
            "ProxyableMetatokenMock",
            {
                args : [],
            },
        );
        implementationTokenId1 = getMetatokenID(implementationInstance.address, tokenId);
    });

    IT("Should be able to register metatoken 1", async () => {
        let { status, hooks } = await erc1155mInstance.getMetatokenDetails(metatokenInstance.address);
        assert.strictEqual(metatokenStatusIs(status, METATOKEN_STATUS.REGISTERED), false);
        assert.strictEqual(metatokenStatusIs(status, METATOKEN_STATUS.IS_IMPLEMENTATION), false);
        assert.strictEqual(metatokenStatusIs(status, METATOKEN_STATUS.ENABLED), false);
        expectBNEqual(hooks, 0);

        await erc1155mInstance.registerMetatoken(metatokenInstance.address, true);

        ({ status, hooks } = await erc1155mInstance.getMetatokenDetails(metatokenInstance.address));
        assert.strictEqual(metatokenStatusIs(status, METATOKEN_STATUS.REGISTERED), true);
        assert.strictEqual(metatokenStatusIs(status, METATOKEN_STATUS.IS_IMPLEMENTATION), false);
        assert.strictEqual(metatokenStatusIs(status, METATOKEN_STATUS.ENABLED), true);
        expectBNEqual(hooks, metatokenHooks);

        const registeredImplementation = await erc1155mInstance.getMetatokenImplementation(metatokenInstance.address);
        addressIs(registeredImplementation, metatokenInstance.address);
    });

    IT("Should be able to register metatoken 2", async () => {
        let { status, hooks } = await erc1155mInstance.getMetatokenDetails(metatokenInstance2.address);
        assert.strictEqual(metatokenStatusIs(status, METATOKEN_STATUS.REGISTERED), false);
        assert.strictEqual(metatokenStatusIs(status, METATOKEN_STATUS.IS_IMPLEMENTATION), false);
        assert.strictEqual(metatokenStatusIs(status, METATOKEN_STATUS.ENABLED), false);
        expectBNEqual(hooks, 0);

        await erc1155mInstance.registerMetatoken(metatokenInstance2.address, true);

        ({ status, hooks } = await erc1155mInstance.getMetatokenDetails(metatokenInstance2.address));
        assert.strictEqual(metatokenStatusIs(status, METATOKEN_STATUS.REGISTERED), true);
        assert.strictEqual(metatokenStatusIs(status, METATOKEN_STATUS.IS_IMPLEMENTATION), false);
        assert.strictEqual(metatokenStatusIs(status, METATOKEN_STATUS.ENABLED), true);
        expectBNEqual(hooks, metatokenHooks);

        const registeredImplementation = await erc1155mInstance.getMetatokenImplementation(metatokenInstance2.address);
        addressIs(registeredImplementation, metatokenInstance2.address);
    });

    IT("Should be able to mint metatoken", async () => {
        await erc1155mInstance.mint(firstHolder, metatokenTokenId1, 1, "0x0" as Bytes);

        expectBNEqual(await erc1155mInstance.totalSupply(metatokenTokenId1), 1);
        expectBNEqual(await erc1155mInstance.balanceOf(firstHolder, metatokenTokenId1), 1);
    });

    IT("Should be able to update implementation", async () => {
        await erc1155mInstance.updateMetatokenImplementation(
            metatokenInstance.address,
            implementationInstance.address
        );

        const metatokenStatus = (await erc1155mInstance.getMetatokenDetails(metatokenInstance.address)).status;
        assert.strictEqual(metatokenStatusIs(metatokenStatus, METATOKEN_STATUS.REGISTERED), true);
        assert.strictEqual(metatokenStatusIs(metatokenStatus, METATOKEN_STATUS.IS_IMPLEMENTATION), false);
        assert.strictEqual(metatokenStatusIs(metatokenStatus, METATOKEN_STATUS.ENABLED), true);

        const implementationStatus = (
            await erc1155mInstance.getMetatokenDetails(implementationInstance.address)
        ).status;
        assert.strictEqual(metatokenStatusIs(implementationStatus, METATOKEN_STATUS.REGISTERED), true);
        assert.strictEqual(metatokenStatusIs(implementationStatus, METATOKEN_STATUS.IS_IMPLEMENTATION), true);
        assert.strictEqual(metatokenStatusIs(implementationStatus, METATOKEN_STATUS.ENABLED), false);

        const registeredImplementation = await erc1155mInstance.getMetatokenImplementation(metatokenInstance.address);
        addressIs(registeredImplementation, implementationInstance.address);
    });

    IT("Should not be able to register implementation", async () => {
        await expectReversion(
            erc1155mInstance,
            undefined,
            firstHolder,
            "registerMetatoken",
            implementationInstance.address,
            true
        );

        const implementationStatus = (
            await erc1155mInstance.getMetatokenDetails(implementationInstance.address)
        ).status;
        assert.strictEqual(metatokenStatusIs(implementationStatus, METATOKEN_STATUS.ENABLED), false);
    });

    IT("Should not be able to mint implementation metatoken", async () => {
        await expectReversion(
            erc1155mInstance,
            undefined,
            firstHolder,
            "mint",
            firstHolder,
            implementationTokenId1,
            1,
            "0x0" as Bytes
        );

        expectBNEqual(await erc1155mInstance.totalSupply(metatokenTokenId1), 1);
        expectBNEqual(await erc1155mInstance.balanceOf(firstHolder, metatokenTokenId1), 1);

        expectBNEqual(await erc1155mInstance.totalSupply(implementationTokenId1), 0);
        expectBNEqual(await erc1155mInstance.balanceOf(firstHolder, implementationTokenId1), 0);
    });

    IT("Should be able to mint metatoken", async () => {
        await erc1155mInstance.mint(firstHolder, metatokenTokenId2, 1, "0x0" as Bytes);

        expectBNEqual(await erc1155mInstance.totalSupply(metatokenTokenId2), 1);
        expectBNEqual(await erc1155mInstance.balanceOf(firstHolder, metatokenTokenId2), 1);

        expectBNEqual(await erc1155mInstance.totalSupply(metatokenTokenId1), 1);
        expectBNEqual(await erc1155mInstance.balanceOf(firstHolder, metatokenTokenId1), 1);

        expectBNEqual(await erc1155mInstance.totalSupply(implementationTokenId1), 0);
        expectBNEqual(await erc1155mInstance.balanceOf(firstHolder, implementationTokenId1), 0);
    });

    IT("Should be able to update two metatokens to same implementation", async () => {
        await erc1155mInstance.updateMetatokenImplementation(
            metatokenInstance2.address,
            implementationInstance.address
        );

        const metatokenStatus = (await erc1155mInstance.getMetatokenDetails(metatokenInstance2.address)).status;
        assert.strictEqual(metatokenStatusIs(metatokenStatus, METATOKEN_STATUS.REGISTERED), true);
        assert.strictEqual(metatokenStatusIs(metatokenStatus, METATOKEN_STATUS.IS_IMPLEMENTATION), false);
        assert.strictEqual(metatokenStatusIs(metatokenStatus, METATOKEN_STATUS.ENABLED), true);

        const implementationStatus = (
            await erc1155mInstance.getMetatokenDetails(implementationInstance.address)
        ).status;
        assert.strictEqual(metatokenStatusIs(implementationStatus, METATOKEN_STATUS.REGISTERED), true);
        assert.strictEqual(metatokenStatusIs(implementationStatus, METATOKEN_STATUS.IS_IMPLEMENTATION), true);
        assert.strictEqual(metatokenStatusIs(implementationStatus, METATOKEN_STATUS.ENABLED), false);

        const registeredImplementation = await erc1155mInstance.getMetatokenImplementation(metatokenInstance2.address);
        addressIs(registeredImplementation, implementationInstance.address);
    });

    IT("Should be able to revert to original implementation", async () => {
        await erc1155mInstance.updateMetatokenImplementation(
            metatokenInstance.address,
            metatokenInstance.address
        );

        const metatokenStatus = (await erc1155mInstance.getMetatokenDetails(metatokenInstance.address)).status;
        assert.strictEqual(metatokenStatusIs(metatokenStatus, METATOKEN_STATUS.REGISTERED), true);
        assert.strictEqual(metatokenStatusIs(metatokenStatus, METATOKEN_STATUS.IS_IMPLEMENTATION), false);
        assert.strictEqual(metatokenStatusIs(metatokenStatus, METATOKEN_STATUS.ENABLED), true);

        const implementationStatus = (
            await erc1155mInstance.getMetatokenDetails(implementationInstance.address)
        ).status;
        assert.strictEqual(metatokenStatusIs(implementationStatus, METATOKEN_STATUS.REGISTERED), true);
        assert.strictEqual(metatokenStatusIs(implementationStatus, METATOKEN_STATUS.IS_IMPLEMENTATION), true);
        assert.strictEqual(metatokenStatusIs(implementationStatus, METATOKEN_STATUS.ENABLED), false);

        const registeredImplementation = await erc1155mInstance.getMetatokenImplementation(metatokenInstance.address);
        addressIs(registeredImplementation, metatokenInstance.address);
    });
}
