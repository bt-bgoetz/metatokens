# metatokens

Metatokens are first-class extensions to ERC-1155 contracts that allow for enhancements or restrictions to minting, burning, or transferring the underlying NFTs without requiring external oracles, intermediary transactions, or unsafe external calls1. They can be constructed to fit a particular purpose or simply to provide constraints on the underlying token, whether or not there are any metatokens actually minted. They can also describe the contract as a whole, rather than an individual token, and can be NFTs themselves. This eliminates intermediaries while ensuring the holder of an NFT is also its true owner.

Metatoken extensions act as nested ERC-1155 contracts that exist to support and enhance the base tokens. Extensions can be written to support current or future protocol standards, without requiring significant changes to the base contract. Extensions can issue a single metatoken that acts as an aggregate of all NFTs, or multiple metatokens that are matched one-to-one with base tokens. Metatokens are issued under the same base contract, for proof of authority, while offloading complex logic to external and standardizable contracts. They can be one-of-one NFTs, one-of- many NFTs, emulators of other token standards, and more.

RC-1155M contracts provide hooks into the mutability actions of ERC-1155 tokens. Each extension can be registered against any number of actions, and must provide appropriate external functions for these hooks. The ERC-1155M contract provides two hooks for each action: pre-action and post-action. This results in a total of 6 groups and 12 hooks for extensions to implement; however, they must implement both the pre-action and post-action hooks for the specific action they are registered for, with a minimum of one action per extension (see: IMetatoken1155). Hooks may revert if applicable, but the pre-action hooks’ mutability must be either view or pure.

# development

Run `yarn install --frozen-lockfile` to install all packages.

To improve debugging of `delegatecall`, patch the hardhat network according to `hardhat_patch.js`.

# scripts

- `yarn build` - compiles the tests
- `yarn build:tsc-alias` - updates the import paths in the compiled tests
- `yarn genabi:watch` - updates generated contract abis when contracts are changed
- `yarn flatten:watch` - automatically generates flattened, single-source contract files
- `yarn test:watch` - restarts tests whenever a test file or contract is updated
- `yarn script:tsc-alias` - updates the import paths for the hardhat scripts

# deployment / minting scripts

# setup

Run `yarn build` to compile the scripts and `yarn script:tsc-alias` to ensure that the path aliases are updated correctly.
