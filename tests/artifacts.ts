import * as chalk from "chalk";

interface DeploymentArgs<A extends Artifact> {
    /** The address of the deployed contract. */
    address? : Address;

    /** If redeployment should be forced. */
    redeploy? : boolean;

    /** The constructor args for the artifact. */
    args : ConstructorArgsFromArtifact<A>;
}

/** The mapping of contract name and address to deployed contracts by their address. */
const DEPLOYED_CONTRACTS = new Map<string, Map<Address, Promise<DeployedContract>>>();
/** The default address key for {@link DEPLOYED_CONTRACTS} maps. */
const DEFAULT_ADDRESS_KEY = "DEFAULT" as Address;

/** Resets the contract for the given artifact to its default state. (See {@link getDeployedContract}). */
export async function redeployContract<A extends Artifact>(
    name : string,
    args : DeploymentArgs<A>
) {
    // Remove the reference to the cached contract.
    const addressMap = DEPLOYED_CONTRACTS.get(name);
    if (addressMap !== undefined) {
        const addressKey = args.address || DEFAULT_ADDRESS_KEY;
        addressMap.delete(addressKey);
    }

    return getDeployedContract<A>(
        name,
        {
            ...args,
            redeploy : true,
        }
    );
}

/** Gets the contract for the given artifact, optionally by address. Deploys missing contracts (if no address). */
export async function getDeployedContract<A extends Artifact, DC = ContractFromArtifact<A>>(
    name : string,
    args : DeploymentArgs<A>,
) {
    // Check to see if we have already deployed this contract.
    const addressKey = args.address || DEFAULT_ADDRESS_KEY;
    let addressMap = DEPLOYED_CONTRACTS.get(name);
    if (addressMap !== undefined) {
        if (addressMap.has(addressKey)) {
            return await (addressMap.get(addressKey) as Promise<DC>);
        }
    }

    // The promise that we'll be caching. We hold a reference to its resolvers to memoize existence checks / deployment.
    let resolver : undefined | ((abi : DeployedContract) => void);
    let rejecter : undefined | ((error? : Error) => void);
    const contractPromise = new Promise<DeployedContract>((resolve, reject) => {
        resolver = resolve;
        rejecter = reject;
    });
    if (resolver === undefined || rejecter === undefined) {
        throw new Error("Could not get promise resolvers.");
    }

    // Store it in the cache.
    if (addressMap === undefined) {
        addressMap = new Map();
    }
    addressMap.set(addressKey, contractPromise);

    // Try and see if the contract has already been deployed.
    let contract : DC | undefined;
    if (args.redeploy !== true) {
        try {
            if (args.address === undefined) {
                contract = await artifacts.require(name).deployed();
            } else {
                contract = await artifacts.require(name).at(args.address);
            }
        } catch (error) {
            const { message } = error as { message? : string };
            // We can't determine what type of error this is.
            if (typeof message !== "string") {
                rejecter(error as Error);
                throw error;
            }

            // Could not find the deployed contract, so try deploying it. If we're looking up by address and the
            // contract isn't deployed, we won't try to deploy it.
            if (message !== `Trying to get deployed instance of ${name}, but none was set.`) {
                args.redeploy = true;
            } else {
                rejecter(error as Error);
                throw error;
            }
        }
    }
    if (args.redeploy === true) {
        contract = await deployContract<A>(name, ...args.args);
    }
    if (contract === undefined) {
        throw new Error("Contract not deployed.");
    }

    // Resolve the promise and return the contract.
    resolver(contract as DeployedContract);
    return contract;
}

/** Deploys a contract. Should be exclusively called via {@link getDeployedContract}. */
async function deployContract<A extends Artifact>(name : string, ...args : ConstructorArgsFromArtifact<A>) {
    const start = new Date().getTime();

    // Deploy the contract.
    const artifact = artifacts.require(name);
    const contract = await artifact.new(...args);

    artifact.setAsDeployed(contract);

    // Log it.
    const durationText = logTime(start);
    const label = chalk.blue(`    Deployed: ${name} `);

    console.log(`${label}${durationText}`);

    return contract;
}

function logTime(start : number, low = 2000, mid = 5000, multiplier = 1) {
    const duration = new Date().getTime() - start;
    let durationText = `(${duration.toLocaleString()} ms)`;
    if (duration < low * multiplier) {
        durationText = chalk.green(durationText);
    } else if (duration < mid * multiplier) {
        durationText = chalk.yellow(durationText);
    } else {
        durationText = chalk.red(durationText);
    }

    return durationText;
}

