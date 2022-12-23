declare class Web3Contract<ABI extends Record<string, any>> {
    constructor(abi : ABI, address : Address);
}
interface Web3 {
    eth : Web3Eth;
}
interface Web3Eth {
    Contract : typeof Web3Contract;
}

/** Options passed to a non-payable transaction call. */
interface OptionsNonPayable {
    gas? : BigNumber;
    from? : Address;
}
/** Options passed to a payable transaction call. */
interface OptionsPayable extends OptionsNonPayable {
    value? : ContractNumber;
}
declare const web3 : Web3;
