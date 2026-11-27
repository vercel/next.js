#!/usr/bin/env bash

# Source this after resolving the existing target RUSTFLAGS and C/C++ flags.
# It enables cross-language ThinLTO only for primary production release targets.

native_lto_is_enabled() {
  [[ "${BUILD_TASK:-}" == "build-native-release" ]] || return 1
  case "${TARGET:-}" in
    x86_64-unknown-linux-gnu | aarch64-unknown-linux-gnu | aarch64-apple-darwin)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

native_lto_append_flag() {
  local variable=$1
  local flag=$2
  local current=${!variable:-}
  if [[ " ${current} " != *" ${flag} "* ]]; then
    printf -v "${variable}" '%s%s%s' "${current}" "${current:+ }" "${flag}"
  fi
  export "${variable}"
}

native_lto_configure() {
  native_lto_is_enabled || return 0

  : "${LLVM_BIN_DIR:?LLVM_BIN_DIR must point to the pinned LLVM bin directory}"
  local clang_major
  local rust_llvm_major
  clang_major=$("${LLVM_BIN_DIR}/clang" --version | sed -n 's/^.*clang version \([0-9][0-9]*\).*$/\1/p' | head -1)
  rust_llvm_major=$("${RUSTC:-rustc}" -vV | sed -n 's/^LLVM version: \([0-9][0-9]*\).*$/\1/p')

  if [[ "${clang_major}" != "18" ]]; then
    echo "Cross-language LTO requires Clang 18, found ${clang_major:-unknown}" >&2
    return 1
  fi
  if [[ -z "${rust_llvm_major}" || "${rust_llvm_major}" -lt "${clang_major}" ]]; then
    echo "rustc LLVM ${rust_llvm_major:-unknown} cannot read Clang ${clang_major} bitcode" >&2
    return 1
  fi

  local target_us=${TARGET//-/_}
  export "CC_${target_us}=${LLVM_BIN_DIR}/clang"
  export "CXX_${target_us}=${LLVM_BIN_DIR}/clang++"
  export "AR_${target_us}=${LLVM_BIN_DIR}/llvm-ar"
  export "RANLIB_${target_us}=${LLVM_BIN_DIR}/llvm-ranlib"

  native_lto_append_flag RUSTFLAGS -Clinker-plugin-lto
  local cflags_variable="CFLAGS_${target_us}"
  local cxxflags_variable="CXXFLAGS_${target_us}"
  if [[ -z "${!cxxflags_variable:-}" && -n "${!cflags_variable:-}" ]]; then
    printf -v "${cxxflags_variable}" '%s' "${!cflags_variable}"
    export "${cxxflags_variable}"
  fi
  native_lto_append_flag "${cflags_variable}" -flto=thin
  native_lto_append_flag "${cxxflags_variable}" -flto=thin

  if [[ "${TARGET}" == "aarch64-apple-darwin" ]]; then
    : "${MACOSX_DEPLOYMENT_TARGET:?MACOSX_DEPLOYMENT_TARGET must be set for macOS builds}"
    native_lto_append_flag "CFLAGS_${target_us}" "-mmacosx-version-min=${MACOSX_DEPLOYMENT_TARGET}"
    native_lto_append_flag "CXXFLAGS_${target_us}" "-mmacosx-version-min=${MACOSX_DEPLOYMENT_TARGET}"
  fi
}

if [[ "${NATIVE_LTO_DETECT_ONLY:-}" != "1" ]]; then
  native_lto_configure
fi
