import { ESLintUtils } from "@typescript-eslint/utils";

export * from "./createRule";

// This is done for convenience - saves migrating all of the old rules
export * from "@typescript-eslint/type-utils";
const {
    applyDefault,
    deepMerge,
    isObjectNotArray,
    getParserServices,
    nullThrows,
    NullThrowsReasons,
} = ESLintUtils;
type InferMessageIdsTypeFromRule<T> =
  ESLintUtils.InferMessageIdsTypeFromRule<T>;
type InferOptionsTypeFromRule<T> = ESLintUtils.InferOptionsTypeFromRule<T>;

export {
    applyDefault,
    deepMerge,
    isObjectNotArray,
    getParserServices,
    nullThrows,
    InferMessageIdsTypeFromRule,
    InferOptionsTypeFromRule,
    NullThrowsReasons,
};
