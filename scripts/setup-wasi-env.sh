#!/usr/bin/env bash
# Provisions the toolchain needed to build `next-napi-bindings` for `wasm32-wasip1-threads`.
#
# This script must be SOURCED, not executed — it exports environment variables into the calling
# shell, which a subprocess cannot do:
#
#     source scripts/setup-wasi-env.sh
#     cargo check -p next-napi-bindings --target wasm32-wasip1-threads
#
# See contributing/core/building-wasm.md for the full workflow, including running tests.
#
# Downloads are cached in $WASI_SETUP_CACHE_DIR (defaults to $RUNNER_TEMP on CI, otherwise
# ~/.cache/next-wasi-toolchain), so re-sourcing is cheap. The cache deliberately lives outside the
# repository: the emnapi install would otherwise be picked up as a pnpm workspace project and dirty
# pnpm-lock.yaml.

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  echo "error: setup-wasi-env.sh must be sourced, not executed:" >&2
  echo "         source scripts/setup-wasi-env.sh" >&2
  exit 1
fi

setup_wasi_env() {
  # No `set -e` here: this function runs in the caller's shell, and changing its shell options (or
  # exiting on error) would affect an interactive session. Each step is checked explicitly instead.

  local repo_root
  repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)" || return 1

  local cache_dir="${WASI_SETUP_CACHE_DIR:-${RUNNER_TEMP:-${XDG_CACHE_HOME:-$HOME/.cache}/next-wasi-toolchain}}"
  mkdir -p "$cache_dir" || return 1

  rustup target add wasm32-wasip1-threads || return 1

  # `lzzzz` (LZ4, via turbo-persistence) and `zstd-sys` have C build scripts, so a WASI clang and
  # sysroot are required on top of the Rust target. The SDK build must match the host running the
  # compiler; an x86_64 clang on arm64 fails with "Exec format error".
  local wasi_sdk_version=33.0 wasi_sdk_arch wasi_sdk_sha256
  case "$(uname -m)" in
    x86_64 | amd64)
      wasi_sdk_arch=x86_64
      wasi_sdk_sha256=0ba8b5bfaeb2adf3f29bab5841d76cf5318ab8e1642ea195f88baba1abd47bce
      ;;
    arm64 | aarch64)
      wasi_sdk_arch=arm64
      wasi_sdk_sha256=4f98ee738c7abb45c81a94d1461fc53cc569d1cd01498951c8184d841a027844
      ;;
    *)
      echo "error: unsupported host architecture for the WASI SDK: $(uname -m)" >&2
      return 1
      ;;
  esac

  local sdk_dir="$cache_dir/wasi-sdk-${wasi_sdk_version}-${wasi_sdk_arch}-linux"
  if [ ! -x "$sdk_dir/bin/clang" ]; then
    local tar="wasi-sdk-${wasi_sdk_version}-${wasi_sdk_arch}-linux.tar.gz"
    curl --retry 3 --fail --location --silent --show-error --output "$cache_dir/$tar" \
      "https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-${wasi_sdk_version%%.*}/${tar}" || return 1
    echo "${wasi_sdk_sha256}  $cache_dir/${tar}" | sha256sum --check --strict || return 1
    tar xzf "$cache_dir/$tar" -C "$cache_dir" || return 1
  fi

  export WASI_SDK_PATH="$sdk_dir"
  export CC_wasm32_wasip1_threads="$sdk_dir/bin/clang"
  export CXX_wasm32_wasip1_threads="$sdk_dir/bin/clang++"
  export AR_wasm32_wasip1_threads="$sdk_dir/bin/llvm-ar"
  export CFLAGS_wasm32_wasip1_threads="--target=wasm32-wasip1-threads --sysroot=$sdk_dir/share/wasi-sysroot"
  export CXXFLAGS_wasm32_wasip1_threads="$CFLAGS_wasm32_wasip1_threads"

  # next-napi-bindings' build script calls napi_build::setup(), whose wasi path links against
  # emnapi and panics without EMNAPI_LINK_DIR — needed even for `cargo check`.
  #
  # The archive must define emnapi_create_env / emnapi_delete_env, which only exist in emnapi v2.
  # That is still a prerelease, hence the exact alpha pin; move to the stable release once it ships.
  # The archives are wasm objects, so they are arch-independent.
  local emnapi_version=2.0.0-alpha.4
  local emnapi_dir="$cache_dir/emnapi"
  if [ ! -d "$emnapi_dir/node_modules/emnapi/lib/wasm32-wasip1-threads" ]; then
    mkdir -p "$emnapi_dir" || return 1
    printf '{\n  "name": "emnapi-scratch",\n  "private": true\n}\n' > "$emnapi_dir/package.json" || return 1
    # pnpm is invoked from the repository root with --dir rather than by cd'ing into the scratch
    # directory: corepack resolves the pnpm version from the nearest package.json, and outside the
    # repo there is none, so it would pick the latest pnpm (11.x), which cannot run on the pinned
    # Node 20 (ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING).
    (cd "$repo_root" && pnpm --dir "$emnapi_dir" add "emnapi@${emnapi_version}") || return 1
  fi
  export EMNAPI_LINK_DIR="$emnapi_dir/node_modules/emnapi/lib/wasm32-wasip1-threads"

  # Runs wasm test binaries under the Node WASI host, which supplies the `env.read_custom_section`
  # import that turbo-tasks' link-time registries need.
  if [ -f "$repo_root/scripts/wasi-test-host/run.mjs" ]; then
    export CARGO_TARGET_WASM32_WASIP1_THREADS_RUNNER="node $repo_root/scripts/wasi-test-host/run.mjs"
  fi
}

setup_wasi_env
setup_wasi_env_status=$?
unset -f setup_wasi_env
if [ "$setup_wasi_env_status" -ne 0 ]; then
  echo "error: setup-wasi-env.sh failed" >&2
fi
unset setup_wasi_env_status
