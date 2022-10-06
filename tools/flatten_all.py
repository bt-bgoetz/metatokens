from os import listdir, makedirs, rmdir, stat, unlink, walk
from os.path import exists, join, sep
from subprocess import run, PIPE

SRC_ROOT = "contracts"
DEST_ROOT = "flattened"
SRC_SUFFIX = ".sol"
DEST_SUFFIX = "_flattened.sol"
LICENSE_IDENTIFIER = "// SPDX-License-Identifier: "
SOLIDITY_VERSION = "pragma solidity "
FILE_IMPORT = "// File "
HARDHAT = "// Sources flattened with hardhat"
CACHE_FILE = "tools/.flattencache"
CACHE_SEP = "\0\0"
SKIP = ["%s/openzeppelin" % SRC_ROOT]

CACHED_PATHS = {}
FLATTENED_FILES = {}

def flatten(root, file):
    if root in SKIP:
        return

    # Build the paths
    src = join(SRC_ROOT, root, file + SRC_SUFFIX)
    dest_dir = join(DEST_ROOT, root)
    dest = join(dest_dir, file + DEST_SUFFIX)

    # Make all necessary directories
    makedirs(dest_dir, exist_ok=True)

    # Track the file so we don't remove it later, even if there was a failure in flattening.
    FLATTENED_FILES[dest] = 1

    # Check to see if it's been modified.
    modified = str(stat(src).st_mtime)
    if exists(dest) and src in CACHED_PATHS and CACHED_PATHS[src] == modified:
        print("Skipped: %s" % src)
        return

    # Flatten the file
    try:
        #p = Popen("yarn", args=["hardhat", "flatten", src, ">", dest])
        #p.wait()
        #system("yarn hardhat flatten %s > %s" % (src, dest))
        p = run(["yarn", "--silent", "hardhat", "flatten", src], shell=True, stdout=PIPE)
        flattened = p.stdout.decode("utf-8")
    except Exception as e:
        print("Could not flatten: %s" % src)
        print(e)
        return

    # Find the first license identifier and solidity version pragma in the source file copy it to the head of the
    # flattened file, removing all others.
    license = ""
    version = ""
    with open(src) as f:
        for line in f.readlines():
            # We are strict about the format of the identifier.
            if line[:len(LICENSE_IDENTIFIER)] == LICENSE_IDENTIFIER:
                license = line.rstrip()
            if line[:len(SOLIDITY_VERSION)] == SOLIDITY_VERSION:
                version = line.rstrip()

            if license != "" and version != "":
                break

    # Remove all duplicate identifiers / version pragmas from the flattened file.
    out_lines = []
    empty_count = 0
    for line in flattened.split("\n"):
        # Skip duplicate identifiers / version pragmas.
        if line[:len(LICENSE_IDENTIFIER)] == LICENSE_IDENTIFIER:
            continue
        if line[:len(SOLIDITY_VERSION)] == SOLIDITY_VERSION:
            continue
        # Skip hardhat's comment.
        if line[:len(HARDHAT)] == HARDHAT:
            continue
        # Skip the file import comments. We want to preserve the spacing with an empty line.
        if line[:len(FILE_IMPORT)] == FILE_IMPORT:
            out_lines.append("")
            continue

        # Preserve all others, removing duplicate adjacent empty lines
        if line.strip() == "":
            empty_count += 1
            if empty_count > 1:
                continue
        else:
            empty_count = 0
        out_lines.append(line.rstrip())

    # Prepend the original license and version.
    if version != "":
        out_lines.insert(0, version)
    if license != "":
        out_lines.insert(0, license)

    # Write out the changes.
    with open(dest, "w") as f:
        f.write("\n".join(out_lines))

    # Update the cache
    CACHED_PATHS[src] = modified

    # Log it
    print("Updated: %s" % src)
    if license == "":
        print("  WARNING: No SPDX identifier.")
    if version == "":
        print("  WARNING: No solidity pragma.")

# Read the cache of previously flattened files so we know which ones we could skip.
if exists(CACHE_FILE):
    with open(CACHE_FILE) as f:
        for line in f.readlines():
            path, mtime = line.strip().split(CACHE_SEP)
            CACHED_PATHS[path] = mtime

# Flatten all files.
for root, dirs, files in walk(SRC_ROOT):
    for file in files:
        if file[-len(SRC_SUFFIX):] == SRC_SUFFIX:
            flatten(root[len(SRC_ROOT)+1:], file[:-len(SRC_SUFFIX)])

# Update the cache
with open(CACHE_FILE, "w") as f:
    lines = []
    for path in CACHED_PATHS:
        lines.append("%s%s%s" % (path, CACHE_SEP, CACHED_PATHS[path]))
    f.write("\n".join(lines))

# Remove all flattened files that we didn't just generate.
empty_dirs = []
for root, dirs, files in walk(DEST_ROOT):
    removed_count = 0
    for file in files:
        path = join(root, file)
        if path not in FLATTENED_FILES:
            try:
                unlink(path)
            except Exception as e:
                print("Could not delete: %s" % path)
                print(e)
                continue

            removed_count += 1
            print("Deleted: %s" % path)

    # Keep track of the empty dir (in reverse order).
    if removed_count == len(files):
        empty_dirs.insert(0, root)

# Remove all empty directories.
removed_dirs = {}
for dir in empty_dirs:
    # We don't want to remove the root dir.
    if dir == DEST_ROOT:
        break

    # Remove the dir and all empty parent dirs.
    pieces = dir.split(sep)
    for i in range(len(pieces) - 1):
        parent_dir = join(DEST_ROOT, *pieces[1:len(pieces) - i])

        # Make sure we haven't already removed this dir.
        if parent_dir in removed_dirs:
            continue

        if len(listdir(parent_dir)) == 0:
            # Try and remove the dir.
            try:
                rmdir(parent_dir)
            except Exception as e:
                print("Could not remove empty dir: %s" % parent_dir)
                print(e)
                break

            removed_dirs[parent_dir] = 1
            print("Removed: %s" % parent_dir)
