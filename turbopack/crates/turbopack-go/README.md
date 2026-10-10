# Native Go file compilation

This crate builds an explicit list of `.go` files into one host executable using
Go's compiler, dependency resolver and linker. Entry files share one directory;
imported packages retain normal Go source selection. The crate has no framework
file conventions. See [the CLI README](../turbopack-cli/README.md) for usage and
first-iteration support boundaries.

## Task graph

Discovery and compilation are memoized Turbo Tasks. Source files stay in the real
project; they are never copied into a compiler workspace.
Go owns the dependency graph and package compilation cache. Turbopack records a
flat set of filesystem inputs reported by Go; it does not parse Go imports or
implement package resolution.

1. Discovery tracks the named files, module metadata and entry-directory
   membership, then runs `go list -deps -json=<required fields> -e` against those
   filenames. Module configuration is parsed by `go mod edit -json` in a separate
   memoized task keyed by the recorded `go.mod` fingerprint, including live stamps.
   Source and asset edits reuse this configuration query.
2. The reported package files, build-tag candidates, package directories and
   embedded assets are read through Turbo Tasks FS. Embed patterns also track
   directory inventories where future matches can appear. Missing local imports
   retain dependencies on their nearest existing directories.
3. When Go reports previously untracked files or directories, a second `go list`
   pass validates discovery after their registration. Named files using only the
   standard library and no embedded assets need one scan because all mutable inputs
   are already tracked.
   File hashes are checked against the real files, and metadata stamps guard
   changes during discovery. Inconsistent discovery is invalidated and retried;
   known stale filesystem reads are refreshed before issuing Go commands.
4. Compilation runs `go build` against the same real files, emitting into a
   temporary output directory. It checks file stamps and directory membership
   before and after execution. Changes invalidate the compilation and discovery
   before their output can become a current result.
5. The bundle reports an explicit success, failure, retry or cancellation outcome.
   Success owns executable bytes and permission metadata; failure owns Go diagnostics.
   Consumers read the operation strongly consistently. The CLI validates its
   inputs again before publishing the executable with an atomic rename.

The filesystem also registers the discovery task directly for external-read
invalidation. This covers metadata changes even when an ordinary cached file
read would retain identical bytes. Unix stamps include inode and ctime to detect
replacement and edit-and-restore changes during subprocess execution. Filesystem
validation is best effort against concurrently running writers; it does not lock
source files against edits.

Output collision checks compare filesystem identities, protecting existing inputs
through case, Unicode and hard-link aliases. Future embed matches are checked
against the actual directory names on disk and the proposed output filename.
Different directory names remain distinct on case-sensitive filesystems. Session
invocation counters are held in memory and do not write instrumentation into inputs.
The writable Go build cache must be outside the source project and module cache,
with neither directory tree containing the other. Discovery rejects overlapping
paths before running `go list` or `go build`, including aliases, so compiler writes
cannot become embedded inputs and cause an unbounded retry loop.

Versioned modules come from `GOMODCACHE`, whose selected inputs are tracked using
another Turbo Tasks disk filesystem. Builds disable downloads, CGO, ambient Go
environment files, automatic toolchain switching and workspace selection. Module
resolution is read-only. The Go installation and resolved build environment are
immutable session inputs. Changing the toolchain requires a new session.

At most two Go actions execute concurrently. Each subprocess has a 180-second
limit. Cancellation/timeout terminates the process tree (a process group on Unix,
`taskkill /T` on Windows). Compilation subprocess errors, including timeouts, become
failed build outcomes so watch consumers can retain their output and recover after
an input edit. Source reads explicitly reject symlink components within the project
and module cache, independently of debug-only filesystem checks.
The temporary output directory is removed after bytes
have been read. Turbo Tasks memoization is process-local; Go's own build cache
persists between processes.

## Verification

```sh
cargo test -p turbopack-go -p turbopack-cli
```

The library tests mutate real test projects in one live task graph. Controlled races
change dependency bodies or introduce new imports during discovery and compilation
on every platform, then execute the first returned result. Unix races also cover
same-size edits with restored mtimes, edit-and-restore, and file replacement,
checking that stale compilation is retried even when length and mtime are unchanged.
The native controlled-Go fixture is shared with CLI publication tests. Module tests
compare both `go.mod` and `go.sum` before and after failed and successful builds,
including missing/partial checksums with a populated cache and checksum-only repair.
Cache-placement regressions reject overlapping directories with a bounded completion
time, preserve the last executable and assert that no discovery or compilation runs.
Invocation assertions cover a single scan for standard-library-only entrypoints
without embedded assets,
unchanged-result reuse, compilation after source/asset edits, and reuse of module
configuration queries. Unix metadata races additionally verify that editing and
restoring `go.mod` refreshes its configuration query even with a restored mtime.
CLI integration tests use real watcher notifications to exercise dependency creation, source selection,
embedded assets, module repair, publication and diagnostics. A checked-in offline
Go module proxy provides a versioned dependency without network access.

Process tests spawn a controlled parent and descendant and verify that cancellation,
dropping the build future and the subprocess deadline terminate both. The deadline
test uses a short internal timeout with an independent completion bound; production
commands retain their 180-second limit.
The CLI watch regression also waits for the production compilation deadline with
an independent 195-second bound, verifies the previous executable survives, and
repairs the source in the same active watcher.
The ignored `child_process_helper`
entrypoint is invoked by those tests as a subprocess fixture. It contains no skipped
test assertions. Windows tests retain process handles to verify termination;
Unix CLI tests additionally exercise Ctrl-C during compilation. CI is configured
with Go 1.24 and 1.27 on Linux, macOS and Windows. `TURBOPACK_GO` can override the
test toolchain path.
