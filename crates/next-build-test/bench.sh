#!/bin/bash

# run a benchmark against this binary
# using heaptrack to extract memory
# usage numbers at g-max

set -e

COMMIT=${1:-13d9693808badd4b92811abac5e18dc1cddf2384} # the sha of the commit to benchmark
PAGES=${2:-"/sink,/examples/forms/appearance,/examples/cards,/examples/dashboard,/api/components,/examples/forms/notifications,/sink/new-york,/examples/forms/display,/blocks,/docs/[[...slug]]"} # the list of pages to build

SCRIPTPATH="$( cd -- "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )"

# build the binary
cargo build --profile release-with-debug --manifest-path "$SCRIPTPATH/Cargo.toml"

# create a temp dir and clone shadcn-ui into it
TMPDIR=$(mktemp -d)
git clone https://github.com/shadcn-ui/ui.git "$TMPDIR"
cd "$TMPDIR/apps/www"
git checkout "$COMMIT"

# install the dependencies and change dir
pnpm install

# heaptrack the binary with the project options in raw mode
heaptrack --record-only "$SCRIPTPATH/../../../../target/release-with-debug/next-build-test" concurrent 12 "$PAGES"
"$SCRIPTPATH/../../../../target/release-with-debug/next-build-test" run concurrent 12 999 "$PAGES"

# get most recently created heaptrack profile and run it via heaptrack_print
PROFILE=$(ls -t "$TMPDIR/heaptrack.*" | head -n1)
heaptrack_print "$PROFILE" > "$SCRIPTPATH/result.log"
