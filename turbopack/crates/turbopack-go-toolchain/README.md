# Official Go toolchain provisioning

This crate resolves an explicitly selected Go installation or provisions the pinned
Go 1.27.2 distribution embedded by a consumer. It has no task-engine dependency.
The `embedded` Cargo feature includes one complete official archive for Cargo's
`TARGET`. The feature is disabled by default. Native consumers opt in explicitly;
WASM cannot provision executable Go tools.

`prepare(source, options, cancellation)` returns a `PreparedToolchain` containing
absolute executable/GOROOT paths, reported host/version metadata, an identity,
and an installation lease. Keep it alive for the entire build/watch session.
`apply` controls GOROOT, GOENV, GOTOOLCHAIN and telemetry; consumers choose build
flags, module/cache policy, watching and output publication. External installations
must stay immutable during the session.

## Build inputs

From the repository root:

```sh
cargo xtask prepare-go-toolchain --target aarch64-apple-darwin
cargo build -p turbopack-cli
```

Preparation requires HTTPS-capable `curl`, not Go. It downloads the exact archive
listed in `archives.json`, verifies size and SHA-256, and atomically caches it in
`target/go-toolchain-archives`. `TURBOPACK_GO_ARCHIVE_DIR` overrides that directory.
Offline preparation accepts a previously cached verified archive. Cargo's build
script never accesses the network or executes the target toolchain. The archive
and generated per-file integrity manifest become part of the executable.

Pin updates require reviewing all archive URLs, official checksums, platform
requirements and CI qualification. Never update to a version discovered at build
or runtime. Official release metadata: https://go.dev/dl/?mode=json.

## Runtime cache

The default directory is `~/Library/Caches/turbopack/go-toolchains` on macOS,
`$LOCALAPPDATA/Turbopack/go-toolchains` on Windows, and
`$XDG_CACHE_HOME/turbopack/go-toolchains` (or `~/.cache/...`) on Linux.
`TURBOPACK_GO_TOOLCHAIN_CACHE` or `PrepareOptions.cache_directory` overrides it.
Use a private local filesystem that supports file locks and atomic directory
renames. It must be outside source, output, build-cache and module-cache trees.

Installations are keyed by format version, Go version/platform and archive hash.
Extraction runs under an exclusive OS file lock into a private adjacent temporary
directory. All file content and metadata are checked before atomic publication.
Cache reuse checks file hashes once per preparation. A shared lease prevents
repair while another session uses the installation. A damaged leased installation
returns an error; stop those sessions and retry. Missing/corrupt installations
are rebuilt from embedded bytes, without downloads. Cancellation interrupts lock
waits and extraction; abandoned temporary directories are removed on the next
exclusive preparation. Older completed versions are retained and may be removed
when no sessions use them. Same-user changes during a session are outside the
immutability contract; the cache is not a sandbox against its owner.

## Platforms and size

Supported mappings: macOS amd64/arm64, Windows MSVC amd64/arm64, and GNU/musl Linux
amd64/arm64. GNU and musl share the official Linux archive; qualify both runtimes
before shipping. Go 1.27 requires macOS 13+. Cross-building Rust chooses TARGET's
payload without running it. Go application cross-compilation and CGO are consumer
policy; the CLI currently supports neither.

Complete archives add approximately 64–76 MiB to each executable and roughly
230 MB of file contents to a cold cache, plus filesystem allocation overhead.
Go's separate build cache also consumes disk space. No payload pruning is applied.
Extraction and full verification incur disk I/O on the first Go command/session;
JavaScript commands do not extract or verify it.

Retain all Go LICENSE, PATENTS and vendored third-party notices. The archive
includes these; distributions must also provide accessible notices with their
binary artifacts. Go's license: https://go.dev/LICENSE.
