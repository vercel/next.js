#!/bin/sh
set -eu
# Run in a minimal Linux container with --network=none and only the CLI/fixture mounted.
test -z "$(command -v go || true)"
test -z "$(command -v cc || true)"
test ! -d /usr/local/go
mkdir -p /project /cache
cp -R /fixture/. /project/
cd /project
export HOME=/cache GOCACHE=/cache/build GOMODCACHE=/cache/modules
export TURBOPACK_GO_TOOLCHAIN_CACHE=/cache/toolchains
export GOROOT=/no-installed-go GOTOOLCHAIN=go1.999.0+auto
export GOENV=/missing-go-env GOFLAGS=--invalid-inherited-flag GOOS=invalid GOARCH=invalid CGO_ENABLED=1
for attempt in first reextracted; do
  /turbopack-cli build main.go
  test "$(./dist/main)" = 'embedded 9289140b1ac28dbda1437b283e6ca608e33186654e7d3a995da268c35906cd4c Asia/Tokyo asset'
  /turbopack-cli toolchain path
  rm -rf /cache/toolchains
done
