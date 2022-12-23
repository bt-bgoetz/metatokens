import { HardhatUpgrades } from "@openzeppelin/hardhat-upgrades";
import { BaseContract, ContractFactory } from "ethers";
import { ethers as hardhatEthers, upgrades as hardhatUpgrades } from "hardhat";

// Re-export to allow for direct control.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
export const upgrades = hardhatUpgrades as HardhatUpgrades;

const cachedFactories = new Map<string, Promise<ContractFactory>>();

/** Wrapper around {@link upgrades.deployProxy}, using the artifact name instead of its contract factory. */
export async function deployProxy(artifact : string, ...args : any[]) {
    // Get the contract factory, caching it if it's the first time we're deploying it.
    let factoryPromise = cachedFactories.get(artifact);
    if (factoryPromise === undefined) {
        factoryPromise = hardhatEthers.getContractFactory(artifact);
        cachedFactories.set(artifact, factoryPromise);
    }
    const factory = await factoryPromise;

    return await upgrades.deployProxy(factory, ...args) as BaseContract;
}
