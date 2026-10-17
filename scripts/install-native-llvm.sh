#!/usr/bin/env bash

# Installs the small subset of upstream LLVM used to compile native dependencies.
# The target libc/SDK still comes from the existing GNU sysroot or Apple SDK.

set -euo pipefail

readonly LLVM_VERSION=18.1.8
readonly DESTINATION=${1:?usage: install-native-llvm.sh <destination>}

readonly BUILD_HOST=${NATIVE_LLVM_HOST:-"$(uname -s)-$(uname -m)"}

case "${BUILD_HOST}" in
  Linux-x86_64)
    readonly ARCHIVE_NAME="clang+llvm-${LLVM_VERSION}-x86_64-linux-gnu-ubuntu-18.04.tar.xz"
    readonly ARCHIVE_SHA256=54ec30358afcc9fb8aa74307db3046f5187f9fb89fb37064cdde906e062ebf36
    readonly RESOURCE_LIB=""
    ;;
  Linux-aarch64 | Linux-arm64)
    readonly ARCHIVE_NAME="clang+llvm-${LLVM_VERSION}-aarch64-linux-gnu.tar.xz"
    readonly ARCHIVE_SHA256=dcaa1bebbfbb86953fdfbdc7f938800229f75ad26c5c9375ef242edad737d999
    readonly RESOURCE_LIB=""
    ;;
  Darwin-arm64)
    readonly ARCHIVE_NAME="clang+llvm-${LLVM_VERSION}-arm64-apple-macos11.tar.xz"
    readonly ARCHIVE_SHA256=4573b7f25f46d2a9c8882993f091c52f416c83271db6f5b213c93f0bd0346a10
    readonly RESOURCE_LIB="clang+llvm-${LLVM_VERSION}-arm64-apple-macos11/lib/clang/18/lib/darwin"
    ;;
  *)
    echo "Unsupported LLVM build host: ${BUILD_HOST}" >&2
    exit 1
    ;;
esac

if [[ "${NATIVE_LLVM_PRINT_CONFIG:-}" == "1" ]]; then
  printf 'archive=%s\nsha256=%s\n' "${ARCHIVE_NAME}" "${ARCHIVE_SHA256}"
  exit 0
fi

if [[ -x "${DESTINATION}/bin/clang" ]]; then
  installed_version=$("${DESTINATION}/bin/clang" --version | sed -n 's/^.*clang version \([0-9][0-9.]*\).*$/\1/p' | head -1)
  if [[ "${installed_version}" == "${LLVM_VERSION}" ]]; then
    exit 0
  fi
  echo "Unexpected Clang version in ${DESTINATION}: ${installed_version:-unknown}" >&2
  exit 1
fi

readonly DOWNLOAD_URL="https://github.com/llvm/llvm-project/releases/download/llvmorg-${LLVM_VERSION}/${ARCHIVE_NAME//+/%2B}"
readonly ARCHIVE_PATH=${LLVM_ARCHIVE_PATH:-"$(mktemp -t llvm-${LLVM_VERSION}.XXXXXX.tar.xz)"}
readonly ARCHIVE_ROOT=${ARCHIVE_NAME%.tar.xz}

cleanup() {
  if [[ -z "${LLVM_ARCHIVE_PATH:-}" ]]; then
    rm -f "${ARCHIVE_PATH}"
  fi
}
trap cleanup EXIT

if [[ -z "${LLVM_ARCHIVE_PATH:-}" ]]; then
  curl --retry 3 --fail --location "${DOWNLOAD_URL}" --output "${ARCHIVE_PATH}"
fi

if command -v sha256sum >/dev/null 2>&1; then
  echo "${ARCHIVE_SHA256}  ${ARCHIVE_PATH}" | sha256sum --check --status
else
  actual_sha=$(shasum -a 256 "${ARCHIVE_PATH}" | awk '{print $1}')
  [[ "${actual_sha}" == "${ARCHIVE_SHA256}" ]]
fi

mkdir -p "${DESTINATION}"
paths=(
  "${ARCHIVE_ROOT}/bin/clang"
  "${ARCHIVE_ROOT}/bin/clang++"
  "${ARCHIVE_ROOT}/bin/clang-18"
  "${ARCHIVE_ROOT}/bin/llvm-ar"
  "${ARCHIVE_ROOT}/bin/llvm-objcopy"
  "${ARCHIVE_ROOT}/bin/llvm-ranlib"
  "${ARCHIVE_ROOT}/bin/llvm-strip"
  "${ARCHIVE_ROOT}/lib/clang/18/include"
)
if [[ -n "${RESOURCE_LIB}" ]]; then
  paths+=("${RESOURCE_LIB}")
fi

tar -xJf "${ARCHIVE_PATH}" -C "${DESTINATION}" --strip-components=1 "${paths[@]}"

if [[ "${NATIVE_LLVM_SKIP_EXECUTION_CHECK:-}" != "1" ]]; then
  "${DESTINATION}/bin/clang" --version
  "${DESTINATION}/bin/llvm-ar" --version | head -1
fi
