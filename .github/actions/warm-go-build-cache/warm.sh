#!/usr/bin/env bash
# Pre-compiles what the first request to a native Go route compiles, into the
# Go build cache, so concurrent `next dev` / `next build` processes don't each
# compile the same standard-library packages from a cold cache.
#
# The environment and flags must match the ones turbopack-go uses for its own
# Go invocations (`GoBuildContext::command` in
# turbopack/crates/turbopack-go/src/lib.rs, and the parser build in
# turbopack/crates/turbopack-go/src/analysis.rs). The build cache keys every
# action by these, so anything that differs here produces entries that the
# servers never read.
set -euo pipefail

# Query the toolchain the way turbopack-go does.
export GOENV=off GOTOOLCHAIN=local GOWORK=off
GOCACHE_DIR=$1
GOROOT_DIR=$(go env GOROOT)
GOHOSTOS_VALUE=$(go env GOHOSTOS)
GOHOSTARCH_VALUE=$(go env GOHOSTARCH)
GOMODCACHE_DIR=$(go env GOMODCACHE)
GOPATH_DIR=$(go env GOPATH)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

run_go() {
  env -i \
    PATH="$GOROOT_DIR/bin:$PATH" \
    GOROOT="$GOROOT_DIR" \
    GOOS="$GOHOSTOS_VALUE" \
    GOARCH="$GOHOSTARCH_VALUE" \
    CGO_ENABLED=0 \
    GOENV=off \
    GOTOOLCHAIN=local \
    GOWORK=off \
    GOPROXY=off \
    GOSUMDB=off \
    'GOVCS=*:off' \
    GOCACHE="$GOCACHE_DIR" \
    GOMODCACHE="$GOMODCACHE_DIR" \
    GOPATH="$GOPATH_DIR" \
    GOTELEMETRY=off \
    GO111MODULE=off \
    "$@"
}

# turbopack-go's declaration parser helper, built the same way analysis.rs does.
cp "$GITHUB_WORKSPACE"/turbopack/crates/turbopack-go/src/declarations.go "$WORK/main.go"
(cd "$WORK" && run_go go build -trimpath -o parser main.go)

# The standard-library packages imported by the generated route and proxy
# programs, plus common ones user routes import. Module-mode builds reuse these
# GOPATH-mode compilations, as standard-library action IDs don't depend on it.
imports=$(
  run_go go list -e -f '{{join .Imports "\n"}}' \
    "$GITHUB_WORKSPACE"/crates/next-api/src/templates/go_*.go
)
mapfile -t packages < <(sort -u <<< "$imports" | sed '/^$/d')
if [ "${#packages[@]}" -eq 0 ]; then
  echo "No imports found in the Go route templates" >&2
  exit 1
fi
(cd "$WORK" && run_go go build -trimpath "${packages[@]}" encoding/json embed)
