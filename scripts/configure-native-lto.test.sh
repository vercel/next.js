#!/usr/bin/env bash

set -euo pipefail

readonly REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
readonly TMP=$(mktemp -d)
trap 'rm -rf "${TMP}"' EXIT

mkdir -p "${TMP}/llvm/bin"
cat > "${TMP}/llvm/bin/clang" <<'EOF'
#!/usr/bin/env bash
echo 'clang version 18.1.8'
EOF
cat > "${TMP}/rustc" <<'EOF'
#!/usr/bin/env bash
cat <<'VERSION'
rustc 1.99.0-nightly
LLVM version: 22.1.8
VERSION
EOF
chmod +x "${TMP}/llvm/bin/clang" "${TMP}/rustc"
for tool in clang++ llvm-ar llvm-ranlib; do
  ln -s clang "${TMP}/llvm/bin/${tool}"
done

primary_targets=(
  x86_64-unknown-linux-gnu
  aarch64-unknown-linux-gnu
  aarch64-apple-darwin
)
excluded_targets=(
  x86_64-unknown-linux-musl
  aarch64-unknown-linux-musl
  x86_64-apple-darwin
  x86_64-pc-windows-msvc
  aarch64-pc-windows-msvc
)

assert_primary() (
  set -euo pipefail
  export TARGET=$1
  export BUILD_TASK=build-native-release
  export LLVM_BIN_DIR="${TMP}/llvm/bin"
  export RUSTC="${TMP}/rustc"
  export MACOSX_DEPLOYMENT_TARGET=11.0
  export RUSTFLAGS='--cfg=tokio_unstable -Clink-arg=--icf=all'
  target_us=${TARGET//-/_}
  export "CFLAGS_${target_us}=--existing-c-flag"
  export "CXXFLAGS_${target_us}=--existing-cxx-flag"

  source "${REPO_ROOT}/scripts/configure-native-lto.sh"

  [[ " ${RUSTFLAGS} " == *' -Clinker-plugin-lto '* ]]
  cc_var="CC_${target_us}"
  cxx_var="CXX_${target_us}"
  ar_var="AR_${target_us}"
  ranlib_var="RANLIB_${target_us}"
  cflags_var="CFLAGS_${target_us}"
  cxxflags_var="CXXFLAGS_${target_us}"
  [[ "${!cc_var}" == "${LLVM_BIN_DIR}/clang" ]]
  [[ "${!cxx_var}" == "${LLVM_BIN_DIR}/clang++" ]]
  [[ "${!ar_var}" == "${LLVM_BIN_DIR}/llvm-ar" ]]
  [[ "${!ranlib_var}" == "${LLVM_BIN_DIR}/llvm-ranlib" ]]
  [[ " ${!cflags_var} " == *' --existing-c-flag '* ]]
  [[ " ${!cflags_var} " == *' -flto=thin '* ]]
  [[ " ${!cxxflags_var} " == *' --existing-cxx-flag '* ]]
  [[ " ${!cxxflags_var} " == *' -flto=thin '* ]]
  if [[ "${TARGET}" == "aarch64-apple-darwin" ]]; then
    [[ " ${!cflags_var} " == *' -mmacosx-version-min=11.0 '* ]]
    [[ " ${!cxxflags_var} " == *' -mmacosx-version-min=11.0 '* ]]
  fi
)

assert_excluded() (
  set -euo pipefail
  export TARGET=$1
  export BUILD_TASK=${2:-build-native-release}
  export LLVM_BIN_DIR="${TMP}/llvm/bin"
  export RUSTC="${TMP}/rustc"
  export RUSTFLAGS='--cfg=tokio_unstable'

  source "${REPO_ROOT}/scripts/configure-native-lto.sh"

  [[ " ${RUSTFLAGS} " != *' -Clinker-plugin-lto '* ]]
  target_us=${TARGET//-/_}
  cc_var="CC_${target_us}"
  cflags_var="CFLAGS_${target_us}"
  [[ -z "${!cc_var:-}" ]]
  [[ " ${!cflags_var:-} " != *' -flto=thin '* ]]
)

for target in "${primary_targets[@]}"; do
  assert_primary "${target}"
done

(
  set -euo pipefail
  export TARGET=x86_64-unknown-linux-gnu
  export BUILD_TASK=build-native-release
  export NATIVE_LTO_DETECT_ONLY=1
  source "${REPO_ROOT}/scripts/configure-native-lto.sh"
  native_lto_is_enabled
  [[ -z "${RUSTFLAGS:-}" ]]
)
for target in "${excluded_targets[@]}"; do
  assert_excluded "${target}"
done
for target in "${primary_targets[@]}"; do
  assert_excluded "${target}" build-native-release-with-assertions
  assert_excluded "${target}" build-native
done

mkdir -p "${TMP}/llvm-newer/bin"
cat > "${TMP}/llvm-newer/bin/clang" <<'EOF'
#!/usr/bin/env bash
echo 'clang version 23.0.0'
EOF
chmod +x "${TMP}/llvm-newer/bin/clang"
if (
  export TARGET=x86_64-unknown-linux-gnu
  export BUILD_TASK=build-native-release
  export LLVM_BIN_DIR="${TMP}/llvm-newer/bin"
  export RUSTC="${TMP}/rustc"
  source "${REPO_ROOT}/scripts/configure-native-lto.sh"
) 2>/dev/null; then
  echo 'Expected an unpinned Clang version to fail' >&2
  exit 1
fi

cat > "${TMP}/rustc-older" <<'EOF'
#!/usr/bin/env bash
cat <<'VERSION'
rustc 1.80.0
LLVM version: 17.0.0
VERSION
EOF
chmod +x "${TMP}/rustc-older"
if (
  export TARGET=x86_64-unknown-linux-gnu
  export BUILD_TASK=build-native-release
  export LLVM_BIN_DIR="${TMP}/llvm/bin"
  export RUSTC="${TMP}/rustc-older"
  source "${REPO_ROOT}/scripts/configure-native-lto.sh"
) 2>/dev/null; then
  echo 'Expected an older rustc LLVM reader to fail' >&2
  exit 1
fi

assert_installer_config() {
  local host=$1
  local expected_archive=$2
  local expected_sha=$3
  local output
  output=$(NATIVE_LLVM_HOST="${host}" NATIVE_LLVM_PRINT_CONFIG=1 \
    "${REPO_ROOT}/scripts/install-native-llvm.sh" /unused)
  [[ "${output}" == *"archive=${expected_archive}"* ]]
  [[ "${output}" == *"sha256=${expected_sha}"* ]]
}

assert_installer_config \
  Linux-x86_64 \
  clang+llvm-18.1.8-x86_64-linux-gnu-ubuntu-18.04.tar.xz \
  54ec30358afcc9fb8aa74307db3046f5187f9fb89fb37064cdde906e062ebf36
assert_installer_config \
  Linux-aarch64 \
  clang+llvm-18.1.8-aarch64-linux-gnu.tar.xz \
  dcaa1bebbfbb86953fdfbdc7f938800229f75ad26c5c9375ef242edad737d999
assert_installer_config \
  Darwin-arm64 \
  clang+llvm-18.1.8-arm64-apple-macos11.tar.xz \
  4573b7f25f46d2a9c8882993f091c52f416c83271db6f5b213c93f0bd0346a10

if NATIVE_LLVM_HOST=Linux-ppc64le NATIVE_LLVM_PRINT_CONFIG=1 \
  "${REPO_ROOT}/scripts/install-native-llvm.sh" /unused >/dev/null 2>&1; then
  echo 'Expected unsupported LLVM build host to fail' >&2
  exit 1
fi

echo 'native LTO target and installer matrix passed'
