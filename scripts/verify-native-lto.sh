#!/usr/bin/env bash

set -euo pipefail

: "${TARGET:?TARGET must be set}"
: "${LLVM_BIN_DIR:?LLVM_BIN_DIR must be set}"

readonly PROFILE_DIR="${CARGO_TARGET_DIR:-target}/${TARGET}/release"
readonly BUILD_DIR="${PROFILE_DIR}/build"
readonly LLVM_AR="${LLVM_BIN_DIR}/llvm-ar"

if [[ ! -d "${BUILD_DIR}" ]]; then
  echo "Native build output not found: ${BUILD_DIR}" >&2
  exit 1
fi

verify_archive() {
  local label=$1
  local package_glob=$2
  local archive_name=$3
  local allowed_native_regex=$4
  local required=$5
  local matches=()
  local found_archives
  found_archives=$(find "${BUILD_DIR}" -path "*/${package_glob}/out/${archive_name}" -type f -print)
  if [[ -n "${found_archives}" ]]; then
    while IFS= read -r archive; do
      matches+=("${archive}")
    done <<< "${found_archives}"
  fi

  if [[ ${#matches[@]} -eq 0 ]]; then
    if [[ "${required}" == true ]]; then
      echo "Required ${label} archive was not found under ${BUILD_DIR}" >&2
      return 1
    fi
    echo "Skipping ${label}: not present for ${TARGET}"
    return 0
  fi

  local archive
  for archive in "${matches[@]}"; do
    local bitcode_count=0
    local native_count=0
    local member
    local members
    members=$("${LLVM_AR}" t "${archive}")
    while IFS= read -r member; do
      [[ -n "${member}" ]] || continue
      local description
      description=$("${LLVM_AR}" p "${archive}" "${member}" | file -b -)
      if [[ "${description}" == *"LLVM IR bitcode"* || "${description}" == *"LLVM bitcode"* ]]; then
        ((bitcode_count += 1))
      else
        ((native_count += 1))
        if [[ -z "${allowed_native_regex}" || ! "${member}" =~ ${allowed_native_regex} ]]; then
          echo "${label} member is not LLVM bitcode or an allowed assembly object: ${archive}(${member}): ${description}" >&2
          return 1
        fi
        echo "Allowed ${label} assembly member: ${member}: ${description}"
      fi
    done <<< "${members}"

    if [[ ${bitcode_count} -eq 0 ]]; then
      echo "${label} archive contains no LLVM bitcode: ${archive}" >&2
      return 1
    fi
    echo "Verified ${label}: ${bitcode_count} bitcode member(s), ${native_count} allowed native member(s)"
  done
}

verify_archive mimalloc 'libmimalloc-sys-*' libmimalloc.a '' true
verify_archive lz4 'lzzzz-*' liblz4.a '' true
verify_archive zstd 'zstd-sys-*' libzstd.a '(^|-)huf_decompress_amd64\.o$' true

# ring combines Clang-built C bitcode with checked-in/generated assembly objects
# whose names vary by architecture. Requiring at least one bitcode member still
# catches a missing -flto=thin while allowing those architecture-specific files.
if [[ "${TARGET}" == *-linux-gnu ]]; then
  verify_archive ring 'ring-*' 'libring_core_*.a' '.*' true
else
  verify_archive ring 'ring-*' 'libring_core_*.a' '.*' false
fi
