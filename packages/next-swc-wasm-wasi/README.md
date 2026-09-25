# `@next/swc-wasm-wasi`

Architecture-independent N-API/WASI bindings used by the experimental `next build --wasi` command.
This self-contained package is downloaded on demand at the exact version of `next`; applications
should not depend on it directly. Its emnapi runtime files are copied from exact pinned versions by
the repository's WASI release build.

The module is trusted build tooling, not a security sandbox. Next.js preopens the host root so
absolute project, workspace, package-manager, and cache paths retain their native-binding meaning.
