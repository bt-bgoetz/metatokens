import json
import os
import re
from sys import exc_info

ARRAY_RE = re.compile("^.*\[\d*\]$")
BYTES_RE = re.compile("^bytes(\d+)?$")
NUMBER_RE = re.compile("^u?int(\d+)?$")

# Cache of build filenames to their details for additional parsing.
CACHED_BUILD_INFO = {}

def firstUpper(string):
    return string[0].upper() + string[1:]

def mapArrayType(type, isOutput):
    parts = type.split("[")
    baseType = mapType(parts[0], isOutput)
    size = parts[1].split("]")[0]

    if size == "":
        if "|" in baseType:
            baseType = "(%s)" % baseType
        return "%s[]" % baseType

    return "[%s]" % (", ".join([baseType] * int(size)))

def mapType(type, isOutput):
    if ARRAY_RE.match(type) is not None:
        return mapArrayType(type, isOutput)

    if type == "address":
        return "Address"

    if type == "bool":
        return "boolean"

    if type == "string":
        return "string"

    if NUMBER_RE.match(type) is not None:
        if isOutput:
            return "BigNumber | typeof BN"
        else:
            return "CN<%s>" % firstUpper(type)

    if BYTES_RE.match(type) is not None:
        return firstUpper(type)
    
    print("WARN: unknown type: %s" % type)

    return type

def parseEvent(abi):
    try:
        eventName = abi["name"]
        inputs = abi["inputs"]
        anonymous = abi["anonymous"]
    except:
        # Missing any of the required fields
        return

    # Parse the parameters
    properties = []
    for input in inputs:
        try:
            name = input["name"]
            type = input["type"]
        except:
            return

        properties.append([name, mapType(type, False)])

    return eventName, properties, anonymous

def parseFunction(abi):
    try:
        functionName = abi["name"]
        inputs = abi["inputs"]
        outputs = abi["outputs"]
        mutability = abi["stateMutability"]
    except:
        # Missing any of the required fields
        return

    # Parse the parameters
    parameters = []
    unnamedArgCount = 0
    for input in inputs:
        try:
            name = input["name"]
            type = input["type"]
        except:
            return

        if name == "":
            unnamedArgCount += 1
            name = "arg%s" % unnamedArgCount

        parameters.append([name, mapType(type, False)])

    # Parse the result
    result = None
    if len(outputs) > 1:
        print("WARN: multiple outputs: %s" % name)
        return
    if len(outputs) == 1:
        output = outputs[0]
        try:
            type = output["type"]
        except:
            return

        if type == "tuple":
            component_types = []
            components = output["components"]
            for i in range(len(components)):
                component = components[i]
                component_type = mapType(component["type"], True)
                component_types.append("%s : %s" % (i, component_type))

                
                if "name" in component and component["name"] != "":
                    component_types.append("%s : %s" % (component["name"], component_type))
            result = "{ %s }" % "; ".join(component_types)
        else:
            result = mapType(type, True)

    return functionName, parameters, result, mutability

def parseABI(abi):
    functions = []
    events = []
    for item in abi:
        if "type" not in item:
            continue

        if item["type"] == "constructor":
            # We make a fake function from the constructor
            item["name"] = "__constructor__"
            item["outputs"] = []
            constructor = parseFunction(item)
            if constructor is not None:
                functions.append(constructor)
            del item["outputs"]

        if item["type"] == "function":
            function = parseFunction(item)
            if function is not None:
                functions.append(function)

        if item["type"] == "event":
            event = parseEvent(item)
            if event is not None:
                events.append(event)

    return functions, events

def renderParameters(parameters, mutability):
    rendered = []

    for parameter in parameters:
        rendered.append("%s : %s" % (parameter[0], parameter[1]))

    if mutability == "payable":
        rendered.append("optionsPayable? : OptionsPayable")
    elif mutability == "nonpayable":
        rendered.append("optionsNonPayable? : OptionsNonPayable")

    return ", ".join(rendered)

def renderResult(contractName, name, result, mutability):
    if mutability == "payable" or mutability == "nonpayable":
        if result is None:
            return "CallResult<%sEvents>" % contractName
        if "mock" not in name and "proxy" not in name:
            print("WARN: non-void result for non-view/non-pure: %s" % name)

    if result is None:
        return "void"

    return result

def renderEventProperties(properties):
    for i in range(len(properties)):
        name, type = properties[i]
        properties[i] = "%s : %s" % (name, type)

    return "; ".join(properties)

def renderDocumentation(docs):
    docs = docs.replace("\r", "").replace("@dev", "")
    if "\n" not in docs:
        return "    /** %s */\n" % docs.strip()
    else:
        lines = [_.strip() for _ in docs.split("\n")]
        lines = "\n     * ".join(lines)
        return "    /**\n     * %s\n     */\n" % lines

def renderEvent(details, documentation):
    name, properties, anonymous = details

    docs = ""
    if name in documentation:
        docs = renderDocumentation(documentation[name])

    return "%s    %s : { %s };" % (docs, name, renderEventProperties(properties))

def renderFunction(contractName, details, documentation):
    name, parameters, result, mutability = details

    docs = ""
    if name in documentation:
        docs = renderDocumentation(documentation[name])

    return "%s    %s : (%s) => Promise<%s>;" % (docs, name, renderParameters(parameters, mutability), renderResult(contractName, name, result, mutability))

def renderABI(artifact, functions, events, documentation, ownDefinitions):
    name = artifact["contractName"]

    output = [
        "/* eslint-disable max-len */",
        "/* eslint-disable @typescript-eslint/no-use-before-define */\n",
        'import type { BN } from "bn.js";',
        'import { CallResult } from "tests/transactions";',
        "",
        "export type %sArtifact = Artifact<typeof %sABI, %sMethods, %sEvents>;" % (name, name, name, name),
        "export type %sContract = DeployedContract<typeof %sABI, %sMethods, %sEvents>;\n" % (name, name, name, name),
    ]

    if len(events) > 0:
        output.append("export interface %sEvents {" % name)
        for event in events:
            output.append(renderEvent(event, documentation["EventDefinition"]))
        output.append("}\n")
    else:
        output.append("// eslint-disable-next-line @typescript-eslint/no-empty-interface")
        output.append("export interface %sEvents {}\n" % name)

    needs_call_result_import = False
    needs_bn_import = False
    if len(functions) > 0:
        # We'll be sorting the functions first by mutability then by name, grouped by own / inherited.
        function_groups = {
            "Constructors" : {},
            "Own Functions" : {},
            "Inherited Functions" : {},
        }

        # Render all the functions
        for function in functions:
            function_name = function[0]
            mutability = function[3]

            if function_name == "__constructor__":
                group = function_groups["Constructors"] 
            elif function_name in ownDefinitions["FunctionDefinition"]:
                group = function_groups["Own Functions"]
            else:
                group = function_groups["Inherited Functions"]

            if mutability not in group:
                group[mutability] = {}
            group[mutability][function_name] = renderFunction(name, function, documentation["FunctionDefinition"])
            if not needs_call_result_import and "CallResult<" in group[mutability][function_name]:
                needs_call_result_import = True
            if not needs_bn_import and "typeof BN" in group[mutability][function_name]:
                needs_bn_import = True

        # Combine the mutabilities.
        output.append("export interface %sMethods {" % name)
        first = True
        for group in ["Constructors", "Own Functions", "Inherited Functions"]:
            # Skip empty groups
            if sum([len(function_groups[group][_]) for _ in function_groups[group]]) == 0:
                continue

            if not first:
                output.append("")
            first = False

            group_label = "// %s //" % firstUpper(group)
            output.append("    %s" % ("/" * len(group_label)))
            output.append("    %s" % group_label)
            output.append("    %s" % ("/" * len(group_label)))

            for mutability in ["pure", "view", "payable", "nonpayable"]:
                if mutability not in function_groups[group]:
                    continue
                output.append("")
                
                if group != "Constructors":
                    output.append("    // %s Functions" % firstUpper(mutability))
                for function_name in sorted(function_groups[group][mutability].keys()):
                    output.append(function_groups[group][mutability][function_name])
        output.append("}\n")
    else:
        output.append("// eslint-disable-next-line @typescript-eslint/no-empty-interface")
        output.append("export interface %sMethods {}\n" % name)

    # We don't need to import CallResult
    removed = 0
    if not needs_bn_import:
        output.remove(output[2])
        removed += 1
    if not needs_call_result_import:
        output.remove(output[3 - removed])
        removed += 1
    if removed == 2:
        output.remove(output[4 - removed])

    # Export the JSON, trimmed.
    json_export = json.dumps(artifact["abi"], indent=4)
    json_lines = json_export.split("\n")
    for i in range(len(json_lines)):
        json_lines[i] = re.sub(r'^( +)"([^"]+)":', r'\1\2 :', json_lines[i])
        json_lines[i] = re.sub(r'^(.+["\}])$', r'\1,', json_lines[i])
    json_export = "\n".join(json_lines)
    output.append("export const %sABI = %s;\n" % (name, json_export))

    with open("tests/abi/%s.ts" % name, "wb") as f:
        f.write(bytes("\n".join(output), "UTF-8"))

# Attempts to get the build info for a given compilation, caching for subsequent calls.
# Returns None if there was an error.
def getBuildInfo(path):
    debug_path = path[:-5] + ".dbg.json"
    if not os.path.exists(debug_path):
        print("WARN: No debug file for: %s" % path)
        return None

    # Get the name of the build-info file for this contract.
    with open(debug_path) as f:
        try:
            debug_details = json.load(f)
        except Exception as e:
            print(e)
            return None

    if "buildInfo" not in debug_details:
        print("WARN: Could not extract build info from: %s" % debug_path)
        return None

    # Get the actual build file, caching it if we haven't seen it before.
    build_file = debug_details["buildInfo"].replace("\\", "/").split("/")[-1]
    if build_file not in CACHED_BUILD_INFO:
        if not os.path.exists("artifacts/build-info/%s" % build_file):
            raise Exception("Missing build file for %s: %s" % (path, build_file))

        with open("artifacts/build-info/%s" % build_file) as f:
            CACHED_BUILD_INFO[build_file] = json.load(f)

    return CACHED_BUILD_INFO[build_file]

# Returns the documentation associated with a given artifact.
def getDocumentation(path):
    artifact_name = "/".join(path.replace("\\", "/").split("/")[1:-1])
    
    # Get the build info for this artifact.
    build_info = getBuildInfo(path)

    # Get the AST for this artifact
    ast = build_info["output"]["sources"][artifact_name]["ast"]["nodes"]

    # Extract the function documentation from this artifact.
    documentation = {
        "EventDefinition" : {},
        "FunctionDefinition" : {},
    }
    ownDefinitions = {
        "EventDefinition" : {},
        "FunctionDefinition" : {},
    }
    for block in ast:
        if "nodes" not in block:
            continue

        for node in block["nodes"]:
            # Make sure we have documentation for this function / event
            values = []
            for key in ["nodeType", "visibility", "name"]:
                if key in node:
                    values.append(node[key])
                else:
                    values.append(None)

            if None in values:
                continue

            # Make sure it is in fact a function or event and that is not private.
            nodeType, visibility, name = values
            if nodeType not in documentation:
                #print(nodeType, name)
                continue
            if visibility not in ("public", "external"):
                continue

            # Mark it as an own-definition.
            ownDefinitions[nodeType][name] = True

            # Make sure it has documentation.
            if "documentation" not in node:
                continue
            documentation[nodeType][name] = node["documentation"]["text"]

    return documentation, ownDefinitions

def generateABI(path):
    keywords = [
        "1155M",
        "Emulator",
        "Metatoken",
        "Mock",
    ]
    skip = True
    for keyword in keywords:
        if keyword in path:
            skip = False
            break
    if skip:
        return

    with open(path) as f:
        artifact = json.load(f)
    if "contractName" not in artifact or "abi" not in artifact:
        return

    # Get the documentation for this artifact.
    try:
        documentation, ownDefinitions = getDocumentation(path)
    except Exception as e:
        print(e.with_traceback(exc_info()[2]))
        documentation = {
            "EventDefinition" : {},
            "FunctionDefinition" : {},
        }
        ownDefinitions = {
            "EventDefinition" : {},
            "FunctionDefinition" : {},
        }

    functions, events = parseABI(artifact["abi"])
    renderABI(artifact, functions, events, documentation, ownDefinitions)

for root, dirs, files in os.walk("artifacts"):
    for f in files:
        if f[-5:] == ".json" and f[-9:] != ".dbg.json":
            generateABI(os.path.join(root, f))