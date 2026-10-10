# Turbopack CLI

`turbopack-cli` builds JavaScript/TypeScript entrypoints and native Go executables.
The `build` command selects the language from the input filenames.

Build the CLI from the repository root:

```sh
cargo build -p turbopack-cli
```

## JavaScript and TypeScript

```sh
./target/debug/turbopack-cli build src/index.ts --dir path/to/project
./target/debug/turbopack-cli build src/index.ts --dir path/to/project --target browser
./target/debug/turbopack-cli dev src/index.ts --dir path/to/project
```

Entrypoints resolve relative to `--dir`, which defaults to the current directory.
JavaScript builds emit into `dist`. `dev` serves the JavaScript application and
rebuilds when its dependencies change. See `build --help` and `dev --help` for
available options.

## Go files

Install Go 1.24 or newer and make `go` available on `PATH`, or supply `--go` with
the path to its executable. These commands run from the repository root using the
included fixture:

```sh
./target/debug/turbopack-cli build cmd/files/main.go cmd/files/helper.go \
  --dir turbopack/crates/turbopack-go/tests/fixture \
  --output /tmp/turbopack-go-example
/tmp/turbopack-go-example
```

The result is a single executable. The fixture prints a JSON `body` containing
`explicit-v1`, the imported helper's message and the contents of its embedded asset.

All named files must be in one directory and form `package main` with a `main`
function. Unlisted sibling files are excluded: the fixture's `unused.go` contains
an initializer that panics, and does not run. Omitting `helper.go` reports the
undefined `value` function. Filenames have no framework-specific meaning.

Inputs resolve relative to `--dir`; absolute filenames also work. The nearest
ancestor `go.mod` identifies the module. Standalone files using only the standard
library do not require a module. If supplied, `--root` must contain the module or
standalone source directory. Outputs default to `<dir>/dist/<first-input-name>`,
with `.exe` on Windows. For `main.go helper.go`, the default is `dist/main`.
`--output` selects a different executable path, relative to the current directory.
An output cannot overwrite a tracked input or module configuration, or fall within
an embed pattern. Choose an output outside the matched directories to avoid
embedding the executable into itself on subsequent builds. Protection checks
filesystem identity, including case aliases on case-insensitive filesystems and
hard links. Outputs cannot have a `.go` extension, regardless of case.

Go's explicit-file semantics apply to the entry files, including its handling of
filename suffixes and build constraints. Imported packages use normal Go source
selection. `--tags` supplies build tags to both discovery and compilation.

### Module dependencies

Versioned pure-Go dependencies are supported through the normal `GOMODCACHE`.
Prepare dependencies with Go before building:

```sh
cd path/to/go-project
go mod tidy
go mod download
/path/to/next.js/target/debug/turbopack-cli build main.go helper.go
```

Compilation uses `-mod=readonly`, with downloads disabled. Missing dependencies
or checksums produce Go diagnostics; compilation does not modify `go.mod` or
`go.sum`. Go's build cache (`GOCACHE`) is reused; `--go-cache` overrides its path.
The build-cache directory must be outside the source project and module cache;
it also cannot contain either directory tree. Overlapping paths, including aliases,
are rejected before discovery or compilation. Use a separate cache directory, such
as a sibling of the project, to prevent cache writes from becoming embedded inputs.
Go environment files and automatic toolchain downloads are disabled. The resolved
host toolchain must stay unchanged for the duration of a build/watch session.

### Watching

```sh
./target/debug/turbopack-cli build cmd/files/main.go cmd/files/helper.go \
  --dir turbopack/crates/turbopack-go/tests/fixture \
  --output /tmp/turbopack-go-example --watch
```

The same Turbo Tasks graph observes source files, imported packages, module
metadata and embedded assets. It memoizes unchanged discovery and compilation.
Go runs against the real source directory; only its temporary output is isolated.
Dependency resolution comes from `go list`; `go build` owns package compilation
and its persistent build cache. Turbopack watches the files and directories Go
reports. Discovery normally needs one scan for entries using only the standard
library without embedded assets, with an extra validation scan for newly discovered
mutable inputs.
Validated executable bytes are published by atomic rename with executable
permissions. A deleted output is recreated from the graph's cached bytes.

A failed build prints diagnostics and retains the last successful executable.
Watch mode remains active for repairs; a failed one-shot build exits with code 1
and preserves an existing output. Go commands have a 180-second deadline;
compilation timeouts print diagnostics and keep watching for source repairs.
Ctrl-C and, on Unix, SIGTERM cancel active Go
commands and stop the watcher. Watch mode compiles executables; starting and
restarting the application is the caller's responsibility.

### First-iteration boundaries

- Native host executables with CGO disabled; application dependencies must be pure
  Go. Standard-library implementations may use assembly.
- Go entries are filenames, not package paths or patterns. Go and JavaScript
  inputs cannot be mixed in one invocation.
- Local module replacements, Go workspaces in the project, source symlinks,
  vendoring, cross-compilation and persistent Turbo Tasks caching are unsupported.
  Source checks reject symlinked files and directory components in consumed inputs,
  including entry directories and imported package directories.
- `dev` does not run Go executables; use `build --watch`. JavaScript target,
  optimization, issue-filtering and full-statistics options do not apply to Go.

Turbo Tasks memoization lasts for the current process. Go's build and module
caches persist independently between CLI runs.

## Tests

With Go on `PATH`:

```sh
cargo test -p turbopack-go -p turbopack-cli
```

Set `TURBOPACK_GO=/path/to/go/bin/go` to select another installed toolchain for
the tests. Tests cover runnable outputs, dependency tracking, build tags, embedded
assets, cached failures and repair, versioned dependencies from an offline module
proxy (including missing-checksum failures without metadata writes), rejected options
and dependencies, and protection of source and module files
through case and hard-link aliases. The removed `--command-log` instrumentation
option is rejected without modifying inputs; invocation counts are kept in memory.
Real CLI watchers cover missing-package creation, build-tag activation, nested
embedded assets and module-metadata repair. Publication tests keep executing the
previous output during a stalled rebuild and require a runnable executable through
replacement. Controlled discovery/compilation races run on every platform; Unix
cases additionally cover same-size edits with restored timestamps. Process-tree
tests exercise cancellation, dropped build futures and deadlines on each platform;
the CLI watch test also exercises the production 180-second compilation deadline,
retains the last executable and verifies recovery after a later edit. Unix tests
reject symlinked entry and imported package directories, and exercise Ctrl-C during
compilation. CI is
configured to run these tests on Linux, macOS and Windows with Go 1.24 and 1.27.
