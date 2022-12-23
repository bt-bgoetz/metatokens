/** Returns the instance of a deployed artifact. */
type InstanceGetter<ABI extends JsonFragment[], Methods, Events> =
    (accounts : Address[]) => Promise<DeployedContract<ABI, Methods, Events>>;

type TestingGroup = (accounts : Address[]) => void;

interface ArtifactStore {
    require : <A extends Artifact>(artifact : string) => A;
}
/** Interface for getting any deployed artifact.*/
declare const artifacts : ArtifactStore;

type ArtifactConstructorArgs<M> =
    "__constructor__" extends keyof M ?
        M["__constructor__"] extends (...args : any) => any ? Parameters<M["__constructor__"]>
        : []
    : [];
type ArtifactConstructor<ABI extends JsonFragment[], Methods, Events> =
    (...args : ArtifactConstructorArgs<Methods>) => Promise<DeployedContract<ABI, Methods, Events>>;

interface Artifact<ABI extends JsonFragment[] = any, Methods = any, Events = any> {
    /** Get the deployed contract at the specified address. */
    at : (address : Address) => Promise<DeployedContract<ABI, Methods, Events>>;
    /** Get the deployed contract. */
    deployed : () => Promise<DeployedContract<ABI, Methods, Events>>;
    /** Deploy the contract. */
    new : ArtifactConstructor<ABI, Methods, Events>;
    /** Set the deployed contract. */
    setAsDeployed : (contract : DeployedContract<ABI, Methods, Events>) => void;
}

interface EstimatableMethod<M extends (...args : any) => any> {
    estimateGas : (...args : Parameters<M>) => Promise<BigNumber>;
}
type ContractMethod<M extends (...args : any) => any> = M & EstimatableMethod<M>;
type ContractMethods<M> = {
    [K in keyof M] :
        M[K] extends (...args : any) => any ? ContractMethod<M[K]>
        : M[K]
};

type DeployedContract<ABI extends JsonFragment[] = any, Methods = any, Events = any> =
    TruffleContract<ABI> & ContractMethods<Methods>
    & {
        contract : {
            events : Events;
            methods : Methods;
        };
    };

type ABIFromArtifact<A> = A extends Artifact<infer ABI> ? ABI : never;
type ConstructorArgsFromArtifact<A> = A extends Artifact<any, infer M> ? ArtifactConstructorArgs<M> : never;
type ContractFromArtifact<A> = A extends Artifact<infer ABI, infer M, infer E> ? DeployedContract<ABI, M, E> : never;
type MethodsFromArtifact<A> = A extends Artifact<any, infer M> ? M : never;

interface TruffleContract<ABI extends JsonFragment[]> {
    /** The ABI of the deployed contract. */
    abi : ABI;
    /** The address of the deployed contract. */
    address : Address;
    /** The transaction at which this contract was deployed. */
    transactionHash : TransactionHash;
}

interface JsonFragment {
    readonly name? : string;
    readonly type? : string;

    readonly anonymous? : boolean;

    readonly payable? : boolean;
    readonly constant? : boolean;
    readonly stateMutability? : string;

    readonly inputs? : readonly JsonFragmentType[];
    readonly outputs? : readonly JsonFragmentType[];

    readonly gas? : string;
}

interface JsonFragmentType {
    readonly name? : string;
    readonly indexed? : boolean;
    readonly type? : string;
    readonly internalType? : any; // @TODO: in v6 reduce type
    readonly components? : readonly JsonFragmentType[];
}
