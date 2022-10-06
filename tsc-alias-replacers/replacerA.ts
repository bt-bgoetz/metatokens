import { relative, resolve } from "path";
import type { AliasReplacerArguments } from "tsc-alias";
import { newStringRegex } from "tsc-alias/dist/utils";
import normalizePath = require("normalize-path");

export default function exampleReplacer({ orig, file, config } : AliasReplacerArguments) {
    const requiredModule = newStringRegex().exec(orig)?.groups?.path;

    // Check if import is already resolved.
    if (requiredModule === undefined || requiredModule.startsWith(".")) {
        return orig;
    }

    // Find the alias paths as defined in tsconfig.json for this import.
    const alias = config.aliasTrie.search(requiredModule);
    if (alias === null) {
        return orig;
    }

    // Get resolved paths from the module.
    let subModule = requiredModule
        .split("/")
        .slice(1)
        .join("/");
    if (subModule.endsWith("/")) {
        subModule = subModule.slice(0, subModule.length - 1);
    }

    // Get resolved paths to the defined aliases.
    const paths = alias.paths.map(({ path, basePath }) => {
        if (path.startsWith("src")) {
            path = normalizePath(path).slice(4);
        }

        const fileRoot = resolve(file, "..");
        const aliasPath = resolve(basePath, path);
        const modulePath = resolve(aliasPath, subModule);
        const relativeFrom = relative(fileRoot, modulePath);

        if (!relativeFrom.startsWith("..")) {
            return `./${relativeFrom}`;
        } else {
            return relativeFrom;
        }
    });

    if (paths.length > 1) {
        console.warn(`Alias has multiple paths: ${alias.prefix}`);
    }

    // Use the first path.
    const index = orig.indexOf(requiredModule);
    const newImportScript = `${orig.substring(0, index)}${paths[0]}${orig.substring(index + requiredModule.length)}`;
    const modulePath = newStringRegex().exec(newImportScript)?.groups?.path;
    if (modulePath === undefined) {
        console.warn(`Could not find module path: ${alias.prefix}`);
        return orig;
    }

    const normalized = newImportScript.replace(modulePath, normalizePath(modulePath));

    return normalized;
}
