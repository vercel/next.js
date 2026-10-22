# Turbopack CLI

`turbopack-cli` builds JavaScript/TypeScript entrypoints and, experimentally,
native executables from `.go` files. The `build` command selects the language from
the input filenames.

Build the CLI from the repository root:

```sh
cargo xtask prepare-go-toolchain --target "$(rustc -vV | sed -n 's/^host: //p')"
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

The CLI embeds the complete official Go 1.27.2 toolchain. Go does not need to be
installed or downloaded at runtime. The first Go command extracts and verifies
the toolchain in a private user cache. Save this as `main.go` in
`path/to/go-project`:

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

All named files must share one directory and form `package main` with a `main`
function. Unlisted sibling files are excluded. Explicitly named entries are
compiled regardless of their filename platform suffixes or `//go:build` tags;
imported packages use Go's normal host-platform and build-tag selection. Filenames
have no special application conventions.

### Options and paths

| Option       | Behavior and default                                                                                      |
| ------------ | --------------------------------------------------------------------------------------------------------- |
| `--dir`      | Directory used to resolve input filenames; defaults to the current directory.                             |
| `--root`     | Optional containment check for the module or standalone source directory.                                 |
| `--output`   | Executable path, relative to the current directory; defaults to `<dir>/dist/<first-input-stem>[.exe]`.    |
| `--go`       | Go executable, resolved from `PATH` or a path relative to the current directory; defaults to the embedded toolchain.        |
| `--go-cache` | Build-cache directory, relative to the current directory; defaults to the selected toolchain's `GOCACHE`. |
| `--tags`     | Build tags passed to discovery and compilation; defaults to no additional tags.                           |
| `--watch`    | Rebuild after input changes; defaults to a single build.                                                  |

Absolute input filenames also work. The nearest ancestor `go.mod` identifies the
module; without one, the existing source directory is used. For `main.go helper.go`,
the default output is `dist/main` under `--dir` (`dist/main.exe` on Windows).

For example, enable a build tag in imported packages and choose the output:

```sh
./target/debug/turbopack-cli build main.go --dir path/to/go-project \
  --tags special --output ./bin/my-app
```

Outputs cannot overwrite source or module files, match an embed pattern, or have
a `.go` extension. Default outputs stay inside `--dir`. Symlinked `dist` directories
or output files are unsupported, including symlinks introduced during watch mode.
Use `--output` to explicitly select an external destination. Choose an output
outside embedded asset directories.

The build cache must be outside both the source project and module cache, and cannot contain
either tree. Use a separate directory such as a sibling of the project.

### Module dependencies and environment

Versioned pure-Go dependencies must already be in `GOMODCACHE`. Builds disable
downloads and use `-mod=readonly`; missing dependencies or checksums produce
Go diagnostics without modifying `go.mod` or `go.sum`.

The CLI ignores Go environment files (`GOENV=off`), including settings written by
`go env -w`. It resolves cache paths from the process environment or the selected
toolchain's defaults. To use a custom module cache, export `GOMODCACHE` before both
preparing dependencies and running the CLI. `GOCACHE` selects the build cache;
`--go-cache` overrides it.

Prepare dependencies with the same selected toolchain. `toolchain path` extracts
and verifies the embedded toolchain and prints its absolute Go executable path.
These POSIX commands use that driver and disable Go configuration the CLI does
not use:

```sh
GO_BIN="$(/path/to/turbopack-cli toolchain path)"
cd path/to/go-project
export GOENV=off GOTOOLCHAIN=local GOWORK=off CGO_ENABLED=0 GOFLAGS=
"$GO_BIN" mod tidy
"$GO_BIN" mod download
/path/to/turbopack-cli build main.go helper.go
```

Preparation can download dependencies and update module metadata. The CLI only
reads the resulting module configuration and cache. Its Go installation and
resolved environment must stay unchanged during a build or watch session.

### Toolchain selection and cache

The CLI keeps its macOS 11 deployment target for JavaScript/TypeScript commands.
Go is bundled as data and prepared only by Go commands. On macOS 11/12, embedded
Go preparation reports that Go 1.27 requires macOS 13+, includes the detected OS
version, and leaves the toolchain cache untouched. A compatible external `--go`
toolchain is still usable on these systems.

The embedded toolchain supports macOS 13+ on amd64/arm64, Windows on amd64/arm64,
and GNU/musl Linux on amd64/arm64. Cross-built CLI binaries embed their Rust
TARGET's Go distribution. Application builds support only the host platform with CGO disabled.

`--go /path/to/go` selects an immutable external installation (Go 1.24+). Explicit
`--go go` searches PATH. The default does not search PATH or fall back to another
compiler. The CLI controls GOROOT, sets GOTOOLCHAIN=local, and ignores inherited
Go compiler/target flags. A module requiring a newer compiler receives an error;
no replacement toolchain is downloaded.

The toolchain cache defaults to `~/Library/Caches/turbopack/go-toolchains` on
macOS, `$LOCALAPPDATA/Turbopack/go-toolchains` on Windows, and
`$XDG_CACHE_HOME/turbopack/go-toolchains` or `~/.cache/turbopack/go-toolchains` on
Linux. Set `TURBOPACK_GO_TOOLCHAIN_CACHE` to override it. Keep it outside source,
output, Go build-cache and module-cache trees. It requires a private local
filesystem supporting locks and atomic renames; an executable filesystem is
required for the extracted tools.

Each Go session verifies cached file contents and holds an installation lease.
Corrupt/missing caches are rebuilt from the binary. If a damaged installation is
still leased, stop other Go sessions and retry. Older versions stay cached;
remove unused installations when no sessions use them. Complete archives add
approximately 64–76 MiB to the CLI and require hundreds of MB of cache storage,
plus Go's separate build cache. JavaScript builds do not prepare the toolchain.

### Watching

```sh
./target/debug/turbopack-cli build main.go helper.go \
  --dir path/to/go-project --watch
```

Watch mode rebuilds after changes to sources, imported packages, module metadata
and embedded assets. It publishes a complete executable atomically and retains
the last successful output when a build fails. Later edits can repair the build.
Deleted outputs are recreated. On Windows, watch mode retries publication while
a running application or open file handle locks the output. `--watch` compiles the
executable; start and restart your application separately.

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
- Inputs are filenames, not package paths or patterns. Go and JavaScript inputs
  cannot be mixed in one invocation.
- Module replacements (all `replace` directives), project Go workspaces, vendoring,
  source symlinks and cross-compilation are unsupported. Symlink checks cover files
  and directory components in consumed inputs.
- Use `build` or `build --watch`; `dev` does not run Go executables. JavaScript
  target, optimization, issue-filtering and full-statistics options do not apply.
- Persistent Turbo Tasks caching is unsupported. Task results are memoized within
  the process; Go's build and module caches persist between CLI runs.

## Contributor verification

Prepare the archive for the Rust host target, then run from the repository root:

```sh
cargo xtask prepare-go-toolchain --target "$(rustc -vV | sed -n 's/^host: //p')"
cargo test -p turbopack-go-toolchain -p turbopack-go -p turbopack-cli
```

Set `TURBOPACK_GO=/path/to/go/bin/go` to select an external test toolchain.
Without it, tests use the embedded installation. For a development binary without
a payload, use `cargo build -p turbopack-cli --no-default-features`; supply `--go`
for Go builds. Cargo never downloads toolchains; `--offline` preparation reuses a
verified archive. `TURBOPACK_GO_ARCHIVE_DIR` selects the build-time archive cache. The watch timeout
regression uses the real 180-second deadline, adding roughly three minutes.

See the [CLI tests](tests/go.rs), [library tests](../turbopack-go/tests/live.rs),
and [CI workflow](../../../.github/workflows/turbopack_go.yml). The
[checked-in Go fixture](../turbopack-go/tests/fixture) is also available for manual
smoke tests.
