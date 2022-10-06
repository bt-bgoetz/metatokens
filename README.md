# Metatokens

More details can be found in the white paper.

## Overview

Metatokens are first-class extensions to ERC-1155 contracts that allow for enhancements or restrictions to minting, burning, or transferring the underlying NFTs without requiring external oracles, intermediary transactions, or unsafe external calls. They can be constructed to fit a particular purpose or simply to provide constraints on the underlying token, whether or not there are any metatokens actually minted. They can also describe the contract as a whole, rather than an individual token, and can be NFTs themselves. This eliminates intermediaries while ensuring the holder of an NFT is also its true owner.

Since ERC-1155 tokens can have variable supplies within the same contract, it’s possible to group them according to their individual purpose. Metatokens expand this conceptually by creating wholly distinct groups of tokens, each backed by their own smart contract. Handling this complex behavior on-chain eliminates risky signature validation or burdensome integrations.

Metatokens are issued under the same base contract, for proof of authority, while offloading complex logic to external and standardizable contracts. They can be one-of-one NFTs, one-of-many NFTs, emulators of other token standards, and more. Metatoken extensions act as nested ERC-1155 contracts that exist to support and enhance the base tokens. Metatokens can be written to support current or future protocol standards, without requiring significant changes to the base contract. Extensions can issue a single metatoken that acts as an aggregate of all NFTs, or multiple metatokens that are matched one-to-one with base tokens.

All existing ERC-1155 contracts can be upgraded in place to support metatokens. ERC-721 contracts can also be upgraded in place, so long as their state is converted to match the ERC-1155 standard. There is no limit to the number of extensions that can be registered; extensions may also be registered to any number of ERC-1155 contracts.

# Development

Run `yarn install --frozen-lockfile` to install all packages.

To improve debugging of `delegatecall`, patch the hardhat network according to `hardhat_patch.js`.

## Scripts

- `yarn build` - compiles the tests
- `yarn build:tsc-alias` - updates the import paths in the compiled tests
- `yarn genabi:watch` - updates generated contract abis when contracts are changed
- `yarn flatten:watch` - automatically generates flattened, single-source contract files
- `yarn test:watch` - restarts tests whenever a test file or contract is updated

## Setup

Run `yarn build` to compile the scripts and `yarn script:tsc-alias` to ensure that the path aliases are updated correctly.

## Integration

See `getMetatokenID()` in `tests\metatokens\index.ts` for how to combine the metatoken address and token ID.
