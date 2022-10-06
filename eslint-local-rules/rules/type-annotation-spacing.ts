/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import type { TSESTree } from "@typescript-eslint/utils";
import * as util from "../util";
import {
    isClassOrTypeElement,
    isFunction,
    isFunctionOrFunctionType,
    isIdentifier,
    isTSConstructorType,
    isTSFunctionType,
    isVariableDeclarator,
} from "@typescript-eslint/utils/dist/ast-utils";

interface WhitespaceRule {
    readonly before? : boolean;
    readonly beforeOptional? : boolean;
    readonly after? : boolean;
    readonly afterOptional? : boolean;
}

interface WhitespaceOverride {
    readonly colon? : WhitespaceRule;
    readonly arrow? : WhitespaceRule;
    readonly variable? : WhitespaceRule;
    readonly property? : WhitespaceRule;
    readonly parameter? : WhitespaceRule;
    readonly returnType? : WhitespaceRule;
}

interface Config extends WhitespaceRule {
    readonly overrides? : WhitespaceOverride;
}

type WhitespaceRules = Required<WhitespaceOverride>;

type Options = [Config?];
type MessageIds =
    | "expectedSpaceAfter"
    | "expectedSpaceBefore"
    | "expectedSpaceBetween"
    | "unexpectedSpaceAfter"
    | "unexpectedSpaceBefore"
    | "unexpectedSpaceBetween";

const definition = {
    type : "object",
    properties : {
        before : { type : "boolean" },
        beforeOptional : { type : "boolean" },
        after : { type : "boolean" },
        afterOptional : { type : "boolean" },
    },
    additionalProperties : false,
};

function createRules(options? : Config) : WhitespaceRules {
    const globals = {
        ...(options?.before !== undefined ? { before : options.before } : {}),
        ...(options?.beforeOptional !== undefined ? { beforeOptional : options.beforeOptional } : {}),
        ...(options?.after !== undefined ? { after : options.after } : {}),
        ...(options?.afterOptional !== undefined ? { afterOptional : options.afterOptional } : {}),
    };
    const override = options?.overrides ?? {};
    const colon = {
        ...{
            before : false,
            beforeOptional : true,
            after : true,
            afterOptional : false,
        },
        ...globals,
        ...override.colon,
    };
    const arrow = {
        ...{
            before : true,
            beforeOptional : false,
            after : true,
            afterOptional : false,
        },
        ...globals,
        ...override.arrow,
    };

    return {
        colon : colon,
        arrow : arrow,
        variable : {
            ...colon,
            ...override.variable,
        },
        property : {
            ...colon,
            ...override.property,
        },
        parameter : {
            ...colon,
            ...override.parameter,
        },
        returnType : {
            ...colon,
            ...override.returnType,
        },
    };
}

function getIdentifierRules(
    rules : WhitespaceRules,
    node : TSESTree.Node | undefined,
) : WhitespaceRule {
    const scope = node?.parent;

    if (isVariableDeclarator(scope)) {
        return rules.variable;
    } else if (isFunctionOrFunctionType(scope)) {
        return rules.parameter;
    } else {
        return rules.colon;
    }
}

function getRules(
    rules : WhitespaceRules,
    node : TSESTree.TypeNode,
) : WhitespaceRule {
    const scope = node.parent?.parent;

    if (isTSFunctionType(scope) || isTSConstructorType(scope)) {
        return rules.arrow;
    } else if (isIdentifier(scope)) {
        return getIdentifierRules(rules, scope);
    } else if (isClassOrTypeElement(scope)) {
        return rules.property;
    } else if (isFunction(scope)) {
        return rules.returnType;
    } else {
        return rules.colon;
    }
}

export default util.createRule<Options, MessageIds>({
    name : "type-annotation-spacing",
    meta : {
        type : "layout",
        docs : {
            description : "Require consistent spacing around type annotations",
            recommended : false,
        },
        fixable : "whitespace",
        messages : {
            expectedSpaceAfter : "Expected a space after the '{{type}}'.",
            expectedSpaceBefore : "Expected a space before the '{{type}}'.",
            expectedSpaceBetween : "Expected a space between the '{{previousToken}}' and the '{{type}}'.",
            unexpectedSpaceAfter : "Unexpected space after the '{{type}}'.",
            unexpectedSpaceBefore : "Unexpected space before the '{{type}}'.",
            unexpectedSpaceBetween : "Unexpected space between the '{{previousToken}}' and the '{{type}}'.",
        },
        schema : [
            {
                type : "object",
                properties : {
                    before : { type : "boolean" },
                    beforeOptional : { type : "boolean" },
                    after : { type : "boolean" },
                    afterOptional : { type : "boolean" },
                    overrides : {
                        type : "object",
                        properties : {
                            colon : definition,
                            arrow : definition,
                            variable : definition,
                            parameter : definition,
                            property : definition,
                            returnType : definition,
                        },
                        additionalProperties : false,
                    },
                },
                additionalProperties : false,
            },
        ],
    },
    defaultOptions : [
    // Technically there is a default, but the overrides mean
    // that if we apply them here, it will break the no override case.
        {},
    ],
    create(context, [options]) {
        const punctuators = [":", "=>"];
        const sourceCode = context.getSourceCode();

        const ruleSet = createRules(options);

        /**
         * Checks if there's proper spacing around type annotations (no space
         * before colon, one space after).
         */
        // eslint-disable-next-line complexity
        function checkTypeAnnotationSpacing(
            typeAnnotation : TSESTree.TypeNode,
        ) : void {
            const nextToken = typeAnnotation;
            const punctuatorTokenEnd = sourceCode.getTokenBefore(nextToken)!;
            let punctuatorTokenStart = punctuatorTokenEnd;
            let previousToken = sourceCode.getTokenBefore(punctuatorTokenEnd)!;
            let type = punctuatorTokenEnd.value;

            if (!punctuators.includes(type)) {
                return;
            }

            const { before, beforeOptional, after, afterOptional } = getRules(ruleSet, typeAnnotation);

            // Check after the ':'
            const hasSpaceAfter = (nextToken.range[0] - punctuatorTokenEnd.range[1]) > 0;
            if (after && !hasSpaceAfter) {
                context.report({
                    node : punctuatorTokenEnd,
                    messageId : "expectedSpaceAfter",
                    data : {
                        type,
                    },
                    fix(fixer) {
                        return fixer.insertTextAfter(punctuatorTokenEnd, " ");
                    },
                });
            } else if (!after && hasSpaceAfter) {
                context.report({
                    node : punctuatorTokenEnd,
                    messageId : "unexpectedSpaceAfter",
                    data : {
                        type,
                    },
                    fix(fixer) {
                        return fixer.removeRange([
                            punctuatorTokenEnd.range[1],
                            nextToken.range[0],
                        ]);
                    },
                });
            }

            // Check optional types
            if (type === ":" && previousToken.value === "?") {
                const hasSpaceBetween = sourceCode.isSpaceBetweenTokens(previousToken, punctuatorTokenStart);

                // Doesn't match '? :'
                const needsSpaceBetween = afterOptional && !hasSpaceBetween;
                // Doesn't match '?:'
                const needsNoSpaceBetween = !afterOptional && hasSpaceBetween;

                if (needsSpaceBetween) {
                    context.report({
                        node : punctuatorTokenStart,
                        messageId : "expectedSpaceBetween",
                        data : {
                            type,
                            previousToken : previousToken.value,
                        },
                        fix(fixer) {
                            return fixer.insertTextAfter(previousToken, " ");
                        },
                    });
                } else if (needsNoSpaceBetween) {
                    context.report({
                        node : punctuatorTokenStart,
                        messageId : "unexpectedSpaceBetween",
                        data : {
                            type,
                            previousToken : previousToken.value,
                        },
                        fix(fixer) {
                            return fixer.removeRange([
                                previousToken.range[1],
                                punctuatorTokenStart.range[0],
                            ]);
                        },
                    });
                }

                // Shift the start to the ?
                type = "?";
                punctuatorTokenStart = previousToken;
                previousToken = sourceCode.getTokenBefore(previousToken)!;

                // Handle the +/- modifiers for optional modification operators
                if (previousToken.value === "+" || previousToken.value === "-") {
                    type = `${previousToken.value}?`;
                    punctuatorTokenStart = previousToken;
                    previousToken = sourceCode.getTokenBefore(previousToken)!;
                }

                // Check for spaces before the '?'
                const hasSpaceBefore = (punctuatorTokenStart.range[0] - previousToken.range[1]) > 0;
                if (!beforeOptional && hasSpaceBefore) {
                    context.report({
                        node : punctuatorTokenStart,
                        messageId : "unexpectedSpaceBefore",
                        data : {
                            type,
                        },
                        fix(fixer) {
                            return fixer.removeRange([
                                previousToken.range[1],
                                punctuatorTokenStart.range[0],
                            ]);
                        },
                    });
                } else if (beforeOptional && !hasSpaceBefore) {
                    context.report({
                        node : punctuatorTokenStart,
                        messageId : "expectedSpaceBefore",
                        data : {
                            type,
                        },
                        fix(fixer) {
                            return fixer.insertTextAfter(previousToken, " ");
                        },
                    });
                }
            } else {
                const hasSpaceBefore = (punctuatorTokenStart.range[0] - previousToken.range[1]) > 0;
                if (before && !hasSpaceBefore) {
                    context.report({
                        node : punctuatorTokenStart,
                        messageId : "expectedSpaceBefore",
                        data : {
                            type,
                        },
                        fix(fixer) {
                            return fixer.insertTextAfter(previousToken, " ");
                        },
                    });
                } else if (!before && hasSpaceBefore) {
                    context.report({
                        node : punctuatorTokenStart,
                        messageId : "unexpectedSpaceBefore",
                        data : {
                            type,
                        },
                        fix(fixer) {
                            return fixer.removeRange([
                                previousToken.range[1],
                                punctuatorTokenStart.range[0],
                            ]);
                        },
                    });
                }
            }
        }

        return {
            TSMappedType(node) : void {
                if (node.typeAnnotation) {
                    checkTypeAnnotationSpacing(node.typeAnnotation);
                }
            },
            TSTypeAnnotation(node) : void {
                checkTypeAnnotationSpacing(node.typeAnnotation);
            },
        };
    },
});
