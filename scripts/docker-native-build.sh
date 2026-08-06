#!/usr/bin/env bash
# Inner build script run inside the next-swc-builder docker container.
#
# All toolchains (clang, lld, musl sysroots, node, rust, napi-cli,
# cargo-rustflags) are pre-installed in the image.
#
# RUSTFLAGS are resolved via `cargo rustflags` which merges .cargo/config.toml
# (mounted from the repo) with target-specific --config overrides for cross-
# compilation paths. This avoids duplicating config.toml flags in this script.
#
# Expected env vars (set by CI or docker-native-build.js):
#   TARGET     - Rust target triple (e.g. x86_64-unknown-linux-gnu)
#   ABI        - Target ABI (gnu or musl)
#   ARCH       - Target architecture (x86_64 or aarch64)
#   BUILD_TASK - Cargo/napi build task name (default: build-native-release)

set -xeo pipefail

# /build is bind-mounted from the host with a uid that differs from the
# container's root user; mark it safe so vergen's `git rev-parse` works.
git config --global --add safe.directory /build

BUILD_TASK="${BUILD_TASK:-build-native-release}"

# Node.js (installed via nodesource) is used only as a build tool (runs
# npm/napi-cli). The output .node shared library's linking is determined
# by cargo's --target, not the node binary.

# --- RUSTFLAGS via cargo-rustflags ---
# We use `linker=clang` + `linker-flavor=gnu-lld-cc` rather than
# `linker=rust-lld` directly. The actual linker is rust-lld in both
# cases, but clang acts as the driver: it handles finding crt files
# (crti.o, crtbeginS.o), libc, and libgcc, and translates --target /
# --sysroot into the correct library search paths.
#
# cargo-rustflags merges these with .cargo/config.toml (cfg(true) base flags,
# musl crt-static, etc.) so we don't duplicate them here.
CROSS_FLAGS="-Clinker=clang -Clinker-flavor=gnu-lld-cc -Clink-arg=-Wl,--icf=all"
HOST_ARCH=$(uname -m)

# Determine if we need --sysroot. Native GNU targets (host == target arch)
# don't need it — clang finds native multiarch headers automatically.
# Cross GNU targets and all musl targets need explicit sysroot paths.
IS_NATIVE_GNU=0
if [ "$ABI" = "gnu" ]; then
  case "${HOST_ARCH}-${ARCH}" in
    x86_64-x86_64|aarch64-aarch64) IS_NATIVE_GNU=1 ;;
  esac
fi

case "$TARGET" in
  x86_64-unknown-linux-gnu)
    CROSS_FLAGS="$CROSS_FLAGS -Clink-arg=--target=x86_64-linux-gnu"
    # For cross builds, DON'T pass --sysroot to the linker — lld can't
    # resolve absolute paths inside libc.so linker scripts when --sysroot
    # is set (it double-prepends the sysroot). Instead, pass -L to point
    # at the cross libs directly. --sysroot is passed via CFLAGS for C
    # compilation (build scripts like jemalloc).
    if [ "$IS_NATIVE_GNU" = "0" ]; then
      CROSS_FLAGS="$CROSS_FLAGS -Clink-arg=-L/usr/x86_64-linux-gnu/lib"
    fi
    ;;
  aarch64-unknown-linux-gnu)
    CROSS_FLAGS="$CROSS_FLAGS -Clink-arg=--target=aarch64-linux-gnu"
    if [ "$IS_NATIVE_GNU" = "0" ]; then
      CROSS_FLAGS="$CROSS_FLAGS -Clink-arg=-L/usr/aarch64-linux-gnu/lib"
    fi
    ;;
  x86_64-unknown-linux-musl)
    CROSS_FLAGS="$CROSS_FLAGS -Clink-arg=--target=x86_64-linux-musl -Clink-arg=--sysroot=/opt/x86_64-linux-musl-cross/x86_64-linux-musl -Clink-arg=--gcc-toolchain=/opt/x86_64-linux-musl-cross" ;;
  aarch64-unknown-linux-musl)
    CROSS_FLAGS="$CROSS_FLAGS -Clink-arg=--target=aarch64-linux-musl -Clink-arg=--sysroot=/opt/aarch64-linux-musl-cross/aarch64-linux-musl -Clink-arg=--gcc-toolchain=/opt/aarch64-linux-musl-cross" ;;
  *) echo "Unknown target: $TARGET"; exit 1 ;;
esac

# Build the --config argument as a TOML inline value
CROSS_CONFIG="target.${TARGET}.rustflags=[$(echo "$CROSS_FLAGS" | sed 's/\([^ ]*\)/"\1"/g; s/ /, /g')]"

# Resolve merged RUSTFLAGS (config.toml base + cross overrides)
RUSTFLAGS=$(cargo rustflags --target "$TARGET" --config "$CROSS_CONFIG")
export RUSTFLAGS

# --- rust-lld symlink ---
# rustc's gcc-ld/ dir has ld.lld but no 'ld' shim. gnu-lld-cc passes
# -B<gcc-ld-dir> to clang, which looks for 'ld' there.
SYSROOT=$(rustc --print sysroot)
GCC_LD="$SYSROOT/lib/rustlib/${TARGET}/bin/gcc-ld"
if [ -d "$GCC_LD" ] && [ ! -e "$GCC_LD/ld" ]; then
  ln -sf ../rust-lld "$GCC_LD/ld"
fi

# --- CC/CXX for build scripts (jemalloc, ring, etc.) ---
TARGET_US=$(echo "$TARGET" | tr '-' '_')
unset "CC_${TARGET_US}" "CXX_${TARGET_US}" "CFLAGS_${TARGET_US}"

export "CC_${TARGET_US}=clang"
export "CXX_${TARGET_US}=clang++"

case "$TARGET" in
  x86_64-unknown-linux-gnu)
    if [ "$HOST_ARCH" = "x86_64" ]; then
      export "CFLAGS_${TARGET_US}=--target=x86_64-linux-gnu"
    else
      export "CFLAGS_${TARGET_US}=--target=x86_64-linux-gnu --sysroot=/usr/x86_64-linux-gnu"
    fi ;;
  aarch64-unknown-linux-gnu)
    if [ "$HOST_ARCH" = "aarch64" ]; then
      export "CFLAGS_${TARGET_US}=--target=aarch64-linux-gnu"
    else
      export "CFLAGS_${TARGET_US}=--target=aarch64-linux-gnu --sysroot=/usr/aarch64-linux-gnu"
    fi ;;
  x86_64-unknown-linux-musl)
    export "CFLAGS_${TARGET_US}=--target=x86_64-linux-musl --sysroot=/opt/x86_64-linux-musl-cross/x86_64-linux-musl --gcc-toolchain=/opt/x86_64-linux-musl-cross" ;;
  aarch64-unknown-linux-musl)
    export "CFLAGS_${TARGET_US}=--target=aarch64-linux-musl --sysroot=/opt/aarch64-linux-musl-cross/aarch64-linux-musl --gcc-toolchain=/opt/aarch64-linux-musl-cross" ;;
esac

# aarch64 needs larger page size for jemalloc
if [ "$ARCH" = "aarch64" ]; then
  export JEMALLOC_SYS_WITH_LG_PAGE=16
fi

# Verify sccache is available if RUSTC_WRAPPER is set to it.
# Cached docker images may not have sccache installed yet.
if [ "${RUSTC_WRAPPER:-}" = "sccache" ] && ! command -v sccache &>/dev/null; then
  echo "WARNING: RUSTC_WRAPPER=sccache but sccache not found — disabling"
  unset RUSTC_WRAPPER
fi

echo "--- Build environment ---"
node -v
rustc --version
echo "Target: $TARGET"
echo "RUSTFLAGS: $RUSTFLAGS"
echo "RUSTC_WRAPPER: ${RUSTC_WRAPPER:-<unset>}"
echo "-------------------------"

rustup target add "$TARGET"
cd packages/next-swc
npm run "$BUILD_TASK" -- --target "$TARGET"
llvm-strip -x native/next-swc.*.node

# Show sccache stats if available
if command -v sccache &>/dev/null; then
  echo "--- sccache stats ---"
  sccache --show-stats || true
fi

# Post-build verification
echo "--- Dynamic libraries ---"
readelf -d native/next-swc.*.node | grep NEEDED

case "$ABI" in
  gnu)
    echo "--- GLIBC symbols by version ---"
    objdump -T native/next-swc.*.node \
      | grep 'GLIBC_' \
      | sed 's/.*\(GLIBC_[^ ]*\) \+/\1 /' \
      | sort -t. -k2,2n -k3,3n \
      | awk '{vers[$1] = vers[$1] ? vers[$1] ", " $2 : $2} END {for (v in vers) print v ": " vers[v]}' \
      | sort -t. -k2,2n -k3,3n
    ;;
esac
