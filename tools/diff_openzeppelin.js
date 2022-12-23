const Diff = require("diff");
const fs = require("fs/promises");

const INITIAL_ROOT = "contracts";

async function exists(path) {
    try {
        await fs.access(path);
        return true;
    } catch {
        return false;
    }
}

async function compareFiles(path) {
    // Skip files that don't match with an existing node module import.
    const nodePath = `node_modules/@${path.slice(INITIAL_ROOT.length + 1)}`;
    if (!(await exists(nodePath))) {
        return;
    }

    // Get the contents of the two files.
    const pathContentsPromise = fs.readFile(path);
    const nodePathContentsPromise = fs.readFile(nodePath);
    const [pathContents, nodePathContents] = await Promise.all([pathContentsPromise, nodePathContentsPromise]);

    // Generate the diff.
    const diff = Diff.createTwoFilesPatch(nodePath, path, nodePathContents.toString(), pathContents.toString());
    const changes = Diff.parsePatch(diff).reduce((sum, { hunks }) => sum + hunks.length, 0);
    if (changes > 0) {
        return diff;
    }
}

function isSolidity(file) {
    return file.isFile() && /\.sol$/.test(file.name);
}

async function walk(root) {
    const files = await fs.readdir(root, { withFileTypes : true });
    const diffs = [];
    const promises = files.map(async (file) => {
        const path = `${root}/${file.name}`;
        if (file.isDirectory()) {
            diffs.push(...await walk(path));
        } else if (isSolidity(file)) {
            const diff = await compareFiles(path);
            if (diff !== undefined) {
                diffs.push(diff);
            }
        }
    });
    await Promise.all(promises);
    //console.log(files);

    return diffs;
}

async function diffAll() {
    const diffs = await walk(INITIAL_ROOT);
    if (diffs.length === 0) {
        diffs.push("### No changes found. ####");
        console.log("No changes found.");
    } else {
        console.log(`${diffs.length.toLocaleString()} change${diffs.length === 1 ? "" : "s"} found.`);
    }

    const combined = diffs.join("\n\n\n");
    await fs.writeFile("contract-diffs/combined.diff", combined);
}
diffAll();
