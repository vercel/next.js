#!/usr/bin/env bash
# Inner build script run inside the next-swc-builder docker container.
#
# All toolchains (clang, lld, musl sysroots, node, rust, napi-cli) are
# pre-installed in the image — no runtime apt-get or downloads needed.
#
# All 4 Linux targets use the same toolchain: clang (compiler) + rust-lld
# (linker). The musl cross-toolchains provide only the sysroot; clang and
# lld handle everything else.
#
# Expected env vars (set by CI or docker-native-build-local.sh):
#   TARGET        - Rust target triple (e.g. x86_64-unknown-linux-gnu)
#   ABI           - Target ABI (gnu or musl)
#   ARCH          - Target architecture (x86_64 or aarch64)
#   VERIFY_CMD    - Command to verify the built binary (optional)
#   BUILD_TASK    - Cargo/napi build task name (default: build-native-release)
#
# RUSTFLAGS are resolved inside the container via cargo-rustflags, merging
# .cargo/config.toml with .cargo/cross-config.toml. No RUSTFLAGS env var
# needs to be passed in.

set -xeo pipefail

BUILD_TASK="${BUILD_TASK:-build-native-release}"

# Node.js is used only as a build tool (runs npm/napi-cli). The glibc-linked
# node works for all targets — the output .node file's linking is determined
# by cargo's --target, not the node binary.
export PATH="/opt/node-gnu/bin:${PATH}"

# Resolve RUSTFLAGS from cargo config + cross-config overlay.
RUSTFLAGS=$(cargo rustflags --target "$TARGET" --config .cargo/cross-config.toml)
export RUSTFLAGS

# rustc's gcc-ld/ dir has ld.lld but no 'ld' shim.
# gnu-lld-cc passes -B<gcc-ld-dir> to GCC/clang, which looks for 'ld' there.
# Create the symlink so the linker driver finds rust-lld.
SYSROOT=$(rustc --print sysroot)
GCC_LD="$SYSROOT/lib/rustlib/${TARGET}/bin/gcc-ld"
if [ -d "$GCC_LD" ] && [ ! -e "$GCC_LD/ld" ]; then
  ln -sf ../rust-lld "$GCC_LD/ld"
fi

# Set CC/CXX per target — clang with --target + --sysroot for all targets.
# napi-rs build scripts use CC_<target> / CXX_<target> / CFLAGS_<target>.
TARGET_US=$(echo "$TARGET" | tr '-' '_')
unset "CC_${TARGET_US}" "CXX_${TARGET_US}" "CFLAGS_${TARGET_US}"

# Determine host arch for native vs cross detection
HOST_ARCH=$(uname -m)

export "CC_${TARGET_US}=clang"
export "CXX_${TARGET_US}=clang++"

case "$TARGET" in
  x86_64-unknown-linux-gnu)
    # Only set --sysroot when cross-compiling (host != target arch).
    # Native builds find headers via standard multiarch paths.
    if [ "$HOST_ARCH" = "x86_64" ]; then
      export "CFLAGS_${TARGET_US}=--target=x86_64-linux-gnu"
    else
      export "CFLAGS_${TARGET_US}=--target=x86_64-linux-gnu --sysroot=/usr/x86_64-linux-gnu"
    fi
    ;;
  aarch64-unknown-linux-gnu)
    if [ "$HOST_ARCH" = "aarch64" ]; then
      export "CFLAGS_${TARGET_US}=--target=aarch64-linux-gnu"
    else
      export "CFLAGS_${TARGET_US}=--target=aarch64-linux-gnu --sysroot=/usr/aarch64-linux-gnu"
    fi
    ;;
  x86_64-unknown-linux-musl)
    export "CFLAGS_${TARGET_US}=--target=x86_64-linux-musl --sysroot=/opt/x86_64-linux-musl-cross/x86_64-linux-musl --gcc-toolchain=/opt/x86_64-linux-musl-cross"
    ;;
  aarch64-unknown-linux-musl)
    export "CFLAGS_${TARGET_US}=--target=aarch64-linux-musl --sysroot=/opt/aarch64-linux-musl-cross/aarch64-linux-musl --gcc-toolchain=/opt/aarch64-linux-musl-cross"
    ;;
esac

# For native GNU targets (host arch == target arch), strip --sysroot from
# RUSTFLAGS. The cross-config always includes --sysroot for cross-compilation,
# but for native builds the sysroot paths are wrong (Ubuntu multiarch layout
# differs from cross sysroot layout). Without --sysroot, clang and lld find
# the native multiarch paths automatically.
if [ "$ABI" = "gnu" ]; then
  case "${HOST_ARCH}-${ARCH}" in
    x86_64-x86_64|aarch64-aarch64)
      RUSTFLAGS=$(echo "$RUSTFLAGS" | sed 's/-Clink-arg=--sysroot=[^ ]*//')
      export RUSTFLAGS
      ;;
  esac
fi

# aarch64 needs larger page size for jemalloc
if [ "$ARCH" = "aarch64" ]; then
  export JEMALLOC_SYS_WITH_LG_PAGE=16
fi

echo "--- Build environment ---"
node -v
rustc --version
echo "Target: $TARGET"
echo "CC: clang --target=$(echo $TARGET)"
echo "Linker: rust-lld (via gnu-lld-cc)"
echo "-------------------------"

rustup target add "$TARGET"
cd packages/next-swc
npm run "$BUILD_TASK" -- --target "$TARGET"
llvm-strip -x native/next-swc.*.node
if [ -n "$VERIFY_CMD" ]; then
  eval "$VERIFY_CMD"
fi
