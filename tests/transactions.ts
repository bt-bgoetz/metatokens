import { providers } from "ethers";

type EventArgs<T = any> = { [key in keyof T] : T[key] extends Record<string, any> ? T[key] : never };

/** The result of a non-view call. */
export interface CallResult<E extends EventArgs> extends providers.TransactionResponse {
    tx : TransactionHash;
    receipt : TransactionReceipt<keyof E & string, E>;
    logs : TransactionLog<keyof E & string, E>[];
}

export interface TransactionLog<N extends keyof E & string, E extends EventArgs> {
    transactionIndex : number;
    transactionHash : TransactionHash;
    blockHash : TransactionHash;
    blockNumber : number;
    removed : boolean;
    logIndex : number;
    address : Address;
    id : string;
    event : N;
    args : E[N];
}

export interface TransactionReceipt<N extends keyof E & string, E extends EventArgs> {
    to : Address;
    from : Address;
    contractAddress : Address;

    transactionIndex : number;
    transactionHash : TransactionHash;

    gasUsed : number;
    cumulativeGasUsed : BigNumber;
    effectiveGasPrice : BigNumber;

    logs : TransactionLog<N, E>[];

    blockNumber : number;
    confirmations : number;
    type : number;
    status : number;
}
