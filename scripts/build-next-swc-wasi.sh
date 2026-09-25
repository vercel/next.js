#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
source scripts/setup-wasi-env.sh

output="${1:-$repo_root/packages/next-swc-wasm-wasi/next-swc.wasm32-wasi.wasm}"
input="$repo_root/target/wasm32-wasip1-threads/release/next_napi_bindings.wasm"
mkdir -p "$(dirname "$output")"

export CARGO_INCREMENTAL=0
cargo --config 'target."cfg(all())".rustflags=["-Dwarnings","-Dlinker-messages"]' \
  build --release -p next-napi-bindings --target wasm32-wasip1-threads

mapfile -t link_sections < <(
  "$WASI_SDK_PATH/bin/llvm-objdump" -h "$input" |
    awk '$2 ~ /^\.data\.link_section\./ { print $2 }'
)
if [ "${#link_sections[@]}" -eq 0 ]; then
  echo "error: the WASI binding has no turbo-tasks link sections" >&2
  exit 1
fi

keep_section_args=()
for section in "${link_sections[@]}"; do
  keep_section_args+=("--keep-section=$section")
done
"$WASI_SDK_PATH/bin/llvm-strip" --strip-all "${keep_section_args[@]}" \
  "$input" -o "$output"

mapfile -t stripped_link_sections < <(
  "$WASI_SDK_PATH/bin/llvm-objdump" -h "$output" |
    awk '$2 ~ /^\.data\.link_section\./ { print $2 }'
)
if [ "${link_sections[*]}" != "${stripped_link_sections[*]}" ]; then
  echo "error: stripping removed a turbo-tasks link section" >&2
  exit 1
fi

output_dir="$(dirname "$output")"
cp "$EMNAPI_NODE_MODULES/@emnapi/core/LICENSE" "$output_dir/LICENSE.emnapi"
cp "$EMNAPI_NODE_MODULES/@emnapi/core/dist/emnapi-core.full.js" \
  "$output_dir/emnapi-core.mjs"
cp "$EMNAPI_NODE_MODULES/@emnapi/runtime/dist/emnapi.js" \
  "$output_dir/emnapi-runtime.mjs"
cp "$EMNAPI_NODE_MODULES/@emnapi/wasi-threads/dist/wasi-threads.js" \
  "$output_dir/wasi-threads.mjs"

printf 'Built %s (%s bytes)\n' "$output" "$(wc -c < "$output" | xargs)"
