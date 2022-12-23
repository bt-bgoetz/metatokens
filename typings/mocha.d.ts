interface Assertions {
    /** Asserts that `object` is truthy. */
    isOk : <B>(object : B, label? : string) => void;
    /** Asserts that `object` is falsy. */
    isNotOk : <B>(object : B, label? : string) => void;

    /** Asserts non-strict equality (==) of `actual` and `expected`. */
    equal : <A, B>(actual : A, expected : B, label? : string) => void;
    /** Asserts non-strict inequality (!=) of `actual` and `expected`. */
    notEqual : <A, B>(actual : A, expected : B, label? : string) => void;

    /** Asserts strict equality (===) of `actual` and `expected`. */
    strictEqual : <A, B>(actual : A, expected : B, label? : string) => void;
    /** Asserts strict inequality (!==) of `actual` and `expected`. */
    notStrictEqual : <A, B>(actual : A, expected : B, label? : string) => void;

    /** Asserts that `actual` is deeply equal to `expected`. */
    deepEqual : <A, B>(actual : A, expected : B, label? : string) => void;
    /** Asserts that `actual` is not deeply equal to `expected`. */
    notDeepEqual : <A, B>(actual : A, expected : B, label? : string) => void;

    /** Asserts `value` is strictly greater than (>) `target`. */
    isAbove : <A, B>(value : A, target : B, label? : string) => void;
    /** Asserts `value` is greater than or equal to (>=) `target`. */
    isAtLeast : <A, B>(value : A, target : B, label? : string) => void;
    /** Asserts `value` is strictly less than (<) `target`. */
    isBelow : <A, B>(value : A, target : B, label? : string) => void;
    /** Asserts `value` is less than or equal to (<=) `target`. */
    isAtMost : <A, B>(value : A, target : B, label? : string) => void;

    /** Asserts that `value` is true. */
    isTrue : (value : boolean, label? : string) => void;
    /** Asserts that `value` is false. */
    isFalse : (value : boolean, label? : string) => void;
}
declare const assert : Assertions;
declare const contract : (group : string, callback : TestingGroup) => void;
