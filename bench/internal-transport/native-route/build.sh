#!/bin/bash
# Builds two route.go workers from the Next.js templates, the way
# crates/next-api/src/app.rs assembles them, plus the TypeScript runtime:
#   out/tcp/server/worker   go_route_main.go from <base> (loopback TCP only)
#   out/unix/server/worker  go_route_main.go from the working tree (Unix socket)
#   out/js/                 native-route.external.ts and friends, transpiled
# Usage: build.sh <repo root> <base rev> <tsc binary>
# WORKERS=<dir> puts the two workers there instead of out/ (with GOOS/GOARCH
# set, to cross-compile them for a container).
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
repo=$1 base=$2 tsc=$3
t=$repo/crates/next-api/src/templates
workers=${WORKERS:-$here/out}
for variant in tcp unix; do
  src=$workers/$variant/src
  rm -rf "$src" && mkdir -p "$src" "$workers/$variant/server"
  cp "$here/route.go" "$src/"
  printf 'module worker\n\ngo 1.24\n' > "$src/go.mod"
  if [ $variant = tcp ]; then
    git -C "$repo" show "$base:crates/next-api/src/templates/go_route_main.go" > "$src/zz_next_route_main.go"
  else
    cp "$t/go_route_main.go" "$src/zz_next_route_main.go"
  fi
  sed 's|"__NEXT_GO_ROUTE_PATTERN__"|"/api/hello"|' "$t/go_route_handler.go" > "$src/zz_next_route_handler.go"
  sed 's|	// __NEXT_GO_ROUTE_METHODS__|	"GET": GET,|' "$t/go_route_dispatch.go" > "$src/zz_next_route_dispatch.go"
  (cd "$src" && go build -o ../server/worker .)
  goos=$(go env GOOS) goarch=$(go env GOARCH)
  printf '{"version":1,"executable":"worker","goos":"%s","goarch":"%s"}\n' "$goos" "$goarch" > "$workers/$variant/server/route.native.json"
done
rm -rf "$here/out/js"
"$tsc" --module commonjs --target es2022 --esModuleInterop --skipLibCheck --ignoreConfig --rootDir "$repo/packages/next/src/server/lib" --outDir "$here/out/js" \
  "$repo/packages/next/src/server/lib/native-route.external.ts" >/dev/null 2>&1 || true
ls "$here/out/js"
