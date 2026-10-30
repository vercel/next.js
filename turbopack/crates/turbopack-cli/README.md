# Turbopack CLI

`turbopack-cli` builds JavaScript/TypeScript entrypoints and, experimentally,
native executables from `.go` files. Both languages participate in the same
compiler task graph and output pipeline, including mixed entrypoints.

Build the CLI from the repository root:

```sh
cargo build -p turbopack-cli
./target/debug/turbopack-cli build --help
```

The shell examples below use POSIX syntax. On Windows, the CLI and generated
executables have an `.exe` suffix.

## JavaScript and TypeScript

```sh
./target/debug/turbopack-cli build src/index.ts --dir path/to/project
./target/debug/turbopack-cli build src/index.ts --dir path/to/project --target browser
./target/debug/turbopack-cli dev src/index.ts --dir path/to/project
```

Entrypoints resolve relative to `--dir`, which defaults to the current directory.
Builds emit into `dist`. `dev` serves the application and rebuilds when its
dependencies change. See `dev --help` for its options.

## Go quickstart

Install Go 1.24 or newer and put `go` on `PATH`, or select an installation with
`--go`. Save this as `main.go` in `path/to/go-project`:

```go
package main

import "fmt"

func main() {
	fmt.Println("Hello, Go!")
}
```

From the repository root, build and run it:

```sh
./target/debug/turbopack-cli build main.go --dir path/to/go-project
./path/to/go-project/dist/main
```

The executable prints `Hello, Go!`. This example uses only the standard library,
so it does not need a `go.mod` file.

If `main.go` calls functions defined in `helper.go`, name both files:

```sh
./target/debug/turbopack-cli build main.go helper.go --dir path/to/go-project
```

All named Go entry files must have the same parent directory and form `package main`
with a `main` function. That source directory can be the module root or a subdirectory
such as `cmd/server`. Unlisted sibling files are excluded. Explicitly named entries are
compiled regardless of their filename platform suffixes or `//go:build` tags;
imported packages use Go's normal host-platform and build-tag selection. Filenames
have no special application conventions.

### Options and paths

| Option    | Behavior and default                                                                               |
| --------- | -------------------------------------------------------------------------------------------------- |
| `--dir`   | Directory used to resolve input filenames; defaults to the current directory.                      |
| `--root`  | Optional containment check for the module or standalone source directory.                          |
| `--go`    | Go executable, resolved from `PATH` or a path relative to the current directory; defaults to `go`. |
| `--tags`  | Build tags passed to Go discovery and compilation; defaults to no additional tags.                 |
| `--watch` | Rebuild after input changes with `build`; `dev` watches automatically.                             |

Absolute input filenames also work. The nearest ancestor `go.mod` identifies the
module; without one, the existing source directory is used. For `main.go helper.go`,
the output is `dist/main` under `--dir` (`dist/main.exe` on Windows). The first Go
input determines the executable name, even when JavaScript entries appear first.
Go executables use the same asset writer as JavaScript outputs.

For example, compile TypeScript and Go together, enabling a Go build tag in
imported packages:

```sh
./target/debug/turbopack-cli build src/index.ts main.go \
  --dir path/to/project --tags special
```

Keep Go sources and embedded assets outside `dist`. Go output paths must not
overlap tracked inputs or embed patterns. Executable output paths must not contain
symlinks or Windows junctions, including a redirected `dist` directory or executable.
The shared writer validates this even when an executable's output path changes
during watch mode. Go's build cache must be outside both the source project and
module cache, and cannot contain either tree.

### Module dependencies and environment

Versioned pure-Go dependencies must already be in `GOMODCACHE`. Builds disable
downloads and use `-mod=readonly`; missing dependencies or checksums produce
Go diagnostics without modifying `go.mod` or `go.sum`.

The CLI tracks the resolved module cache as a separate filesystem root. Watch mode
observes both roots, so preparing a missing dependency can repair a running watch
session. This root is configured automatically and does not need to be inside
`--root`, which checks the source module or standalone source directory.

The CLI ignores Go environment files (`GOENV=off`), including settings written by
`go env -w`. It resolves cache paths from the process environment or the selected
toolchain's defaults. To use a custom module cache, export `GOMODCACHE` before both
preparing dependencies and running the CLI. `GOCACHE` selects the build cache.

Prepare dependencies with the same Go installation you select with `--go` (or
`go` from `PATH`). These POSIX commands use `go` from `PATH` and disable Go
configuration that the CLI does not use:

```sh
cd path/to/go-project
export GOENV=off GOTOOLCHAIN=local GOWORK=off CGO_ENABLED=0 GOFLAGS=
go mod tidy
go mod download
/path/to/turbopack-cli build main.go helper.go
```

Preparation can download dependencies and update module metadata. The CLI only
reads the resulting module configuration and cache. Its Go installation and
resolved environment must stay unchanged during a build or watch session.

### Watching

```sh
./target/debug/turbopack-cli build main.go helper.go \
  --dir path/to/go-project --watch
./target/debug/turbopack-cli dev main.go helper.go --dir path/to/go-project
```

`build --watch` and `dev` rebuild after changes to sources, imported packages,
module metadata and embedded assets. They retain the last successful executable
when Go compilation fails, and later edits can repair the build. Start and restart
your native application separately.

Mixed entrypoints also work in both modes:

```sh
./target/debug/turbopack-cli dev src/index.ts main.go --dir path/to/project
```

The dev server serves the JavaScript application while the shared compiler emits
the Go executable into `dist`. Go-only `dev` watches and compiles without starting
an HTTP server or opening a browser. JavaScript target and optimization options
control the JavaScript outputs in a mixed build.

Go commands have a 180-second deadline. Compilation timeouts print diagnostics and
keep watching for repairs. A failed single build exits with code 1 and preserves
an existing output. Ctrl-C and, on Unix, SIGTERM cancel active Go commands and stop
the watcher.

Go owns dependency discovery and compilation through `go list` and `go build`;
Turbopack watches the reported inputs. See the [Go crate README](../turbopack-go/README.md)
for the integration design.

### Current limitations

- Native host executables only, with CGO disabled. Application code and dependencies
  must be pure Go; standard-library implementations may use assembly.
- Go inputs are filenames, not package paths or patterns. All Go entries in one
  invocation must have the same parent directory and form one executable.
- Module replacements (all `replace` directives), project Go workspaces, vendoring,
  source symlinks and cross-compilation are unsupported. Symlink checks cover files
  and directory components in consumed inputs.
- Persistent Turbo Tasks caching is unsupported. Task results are memoized within
  the process; Go's build and module caches persist between CLI runs.

## Contributor verification

With Go on `PATH`, run from the repository root:

```sh
cargo test -p turbopack-go -p turbopack-cli
```

Set `TURBOPACK_GO=/path/to/go/bin/go` to select a test toolchain. The watch timeout
regression uses the real 180-second deadline, adding roughly three minutes.

See the [CLI tests](tests/go.rs), [library tests](../turbopack-go/tests/live.rs),
and the existing [Rust CI workflow](../../../.github/workflows/build_and_test.yml).
Its workspace test job installs Go and includes both crates. The
[checked-in Go fixture](../turbopack-go/tests/fixture) is also available for manual
smoke tests.
