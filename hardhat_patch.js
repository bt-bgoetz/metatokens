// node_modules\hardhat\internal\hardhat-network\stack-traces\error-inferrer.js:306
_checkCustomErrors(trace, stacktrace, lastInstruction) {
    const returnData = new return_data_1.ReturnData(trace.returnData);
    if (returnData.isEmpty() || returnData.isErrorReturnData()) {
        // if there is no return data, or if it's a Error(string),
        // then it can't be a custom error
        return;
    }
    let errorMessage = "reverted with an unrecognized custom error";
    if (returnData._selector.length === 8) {
        errorMessage += `: ${returnData._selector}`;
    }
    for (const customError of trace.bytecode.contract.customErrors) {
        // Force the latest instance of each selector to be the cached ones.
        customErrorMap.set(customError.selector.toString("hex"), customError);
    }
    if (customErrorMap.has(returnData._selector)) {
        const customError = customErrorMap.get(returnData._selector);
        // if the return data matches a custom error in the called contract,
        // we format the message using the returnData and the custom error instance
        const decodedValues = abi_1.defaultAbiCoder.decode(customError.paramTypes, returnData.value.slice(4));
        const params = abi_helpers_1.AbiHelpers.formatValues([...decodedValues]);
        errorMessage = `reverted with custom error '${customError.name}(${params})'`;
    }
    const inferredStacktrace = [...stacktrace];
    inferredStacktrace.push(this._instructionWithinFunctionToCustomErrorStackTraceEntry(trace, lastInstruction, errorMessage));
    return this._fixInitialModifier(trace, inferredStacktrace);
}