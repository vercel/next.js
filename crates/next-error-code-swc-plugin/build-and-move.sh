#!/usr/bin/env bash
set -eu -o pipefail

echo "Building next-error-code-swc-plugin..." >&2

# assumes this script sits in the root of the plugin directory
plugin_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"

repo_root="$(realpath "${plugin_dir}/../..")"

nextjs_dir="$repo_root/packages/next"
if ! [ -d "$nextjs_dir" ]; then
  echo "Expected to find next.js directory at '$nextjs_dir'" >&2
  echo "(based on computed repository root '$repo_root')" >&2
  exit 1
fi

BUILD_TARGET='wasm32-wasip1'

cd "$plugin_dir"
rustup target add "$BUILD_TARGET"
CARGO_PROFILE_RELEASE_STRIP=true CARGO_PROFILE_RELEASE_LTO=true cargo build --target "$BUILD_TARGET" --release
output_file="$nextjs_dir/next_error_code_swc_plugin.wasm"
mv "$plugin_dir/target/$BUILD_TARGET/release/next_error_code_swc_plugin.wasm" "$output_file"

echo "✨ Plugin built successfully 🚀" >&2
echo "   (Don't forget to commit the generated .wasm file!)" >&2
echo "$output_file"
