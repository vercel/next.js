# Symbolic Links

The `/file-symlink` route represents what the Next.js file structure may look
like when run under a build orchestrator, such as Bazel, where its sandbox sets
up source files as symlinks to their original source.

The `/directory-symlink` route covers resolving a module through a directory
symlink under `src`. The `/directory-symlink-chain` route covers the same
resolution through two consecutive directory symlinks.
