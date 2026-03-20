#!/usr/bin/env bash
# Local wrapper for running native docker builds using the same matrix as CI.
#
# Usage: ./scripts/docker-native-build-local.sh [--quick] [--host-target] [--rebuild] [target-filter]
# Examples:
#   ./scripts/docker-native-build-local.sh x86_64-unknown-linux-gnu
#   ./scripts/docker-native-build-local.sh musl    # matches all musl targets
#   ./scripts/docker-native-build-local.sh          # builds all docker targets
#   ./scripts/docker-native-build-local.sh --quick x86_64-unknown-linux-gnu  # fast build (no LTO)
#   ./scripts/docker-native-build-local.sh --host-target gnu  # share host target/ dir for caching
#   ./scripts/docker-native-build-local.sh --rebuild gnu      # force Docker image rebuild
#
# --quick:       Use the release-with-assertions profile (no LTO, 64 codegen units)
#                for faster iteration. Not suitable for benchmarking.
# --host-target: Share the host's target/ directory with the container for
#                incremental build caching. Off by default: an anonymous Docker
#                volume overlays target/ so the container gets its own isolated
#                copy (avoids lock conflicts and cross-arch artifact issues).
# --rebuild:     Force rebuild of the Docker builder image even if it already exists.

set -eo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
QUICK=0
HOST_TARGET=0
REBUILD=0
DOCKER_IMAGE="next-swc-builder:latest"

# Parse flags
while [[ "$1" == --* ]]; do
  case "$1" in
    --quick) QUICK=1; shift ;;
    --host-target) HOST_TARGET=1; shift ;;
    --rebuild) REBUILD=1; shift ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

FILTER="${1:-}"

# Build Docker image if it doesn't exist or --rebuild was passed
if [ "$REBUILD" -eq 1 ] || ! docker image inspect "$DOCKER_IMAGE" &>/dev/null; then
  echo "Building Docker image: $DOCKER_IMAGE"
  # Use a minimal context (just rust-toolchain.toml) to avoid sending the
  # entire 30GB repo to the Docker daemon.
  DOCKER_CTX=$(mktemp -d)
  cp "$REPO_ROOT/rust-toolchain.toml" "$DOCKER_CTX/"
  docker build -t "$DOCKER_IMAGE" -f "$REPO_ROOT/docker/native-builder.Dockerfile" "$DOCKER_CTX"
  rm -rf "$DOCKER_CTX"
  echo ""
fi

# Evaluate the matrix using mmm-matrix
MATRIX=$(npx mmm-matrix "$REPO_ROOT/.github/build-matrix.yml" \
  --config '{"deployTarget":"staging"}' \
  --output-format json)

# Filter to only docker entries (linux builds) and optionally by target name
ENTRIES=$(echo "$MATRIX" | jq -c '[.[] | select(.docker != null)]')

if [ -n "$FILTER" ]; then
  ENTRIES=$(echo "$ENTRIES" | jq -c "[.[] | select(.target | contains(\"$FILTER\"))]")
fi

COUNT=$(echo "$ENTRIES" | jq 'length')
if [ "$COUNT" -eq 0 ]; then
  echo "No matching docker targets found for filter: '$FILTER'"
  echo "Available docker targets:"
  echo "$MATRIX" | jq -r '.[] | select(.docker != null) | .target'
  exit 1
fi

if [ "$QUICK" -eq 1 ]; then
  echo "Quick mode: using release-with-assertions profile (no LTO, 64 codegen units)"
fi
if [ "$HOST_TARGET" -eq 1 ]; then
  echo "Host target mode: mounting host target/ directory into container"
fi
echo "Building $COUNT target(s):"
echo "$ENTRIES" | jq -r '.[].target'
echo ""

for i in $(seq 0 $((COUNT - 1))); do
  ENTRY=$(echo "$ENTRIES" | jq -c ".[$i]")

  TARGET=$(echo "$ENTRY" | jq -r '.target')
  ABI=$(echo "$ENTRY" | jq -r '.abi // empty')
  ARCH=$(echo "$ENTRY" | jq -r '.arch // empty')
  BUILD_TASK=$(echo "$ENTRY" | jq -r '.build_task // "build-native-release"')
  VERIFY_CMD=$(echo "$ENTRY" | jq -r '.verify_cmd // empty')

  # In quick mode, override the build task to use release-with-assertions
  if [ "$QUICK" -eq 1 ]; then
    BUILD_TASK="build-native-release-with-assertions"
  fi

  echo "=========================================="
  echo "Building: $TARGET"
  echo "Docker:   $DOCKER_IMAGE"
  echo "Task:     $BUILD_TASK"
  echo "=========================================="

  # Compute RUSTFLAGS from cargo xtask, including cross-config
  RUSTFLAGS=$(cargo xtask print-rustflags --target "$TARGET" --cross-config .cargo/cross-config.toml)

  # By default, overlay target/ with an anonymous volume so the container
  # gets its own isolated build dir (no lock conflicts with the host).
  # --host-target skips the overlay so the host's target/ is shared.
  TARGET_VOLUME_ARGS=()
  if [ "$HOST_TARGET" -eq 0 ]; then
    TARGET_VOLUME_ARGS=(-v /build/target)
  fi

  docker run --rm \
    -e CI=1 \
    -e RUST_BACKTRACE=1 \
    -e RUSTFLAGS="$RUSTFLAGS" \
    -e CARGO_TERM_COLOR=always \
    -e CARGO_INCREMENTAL=0 \
    -e TARGET="$TARGET" \
    -e ABI="$ABI" \
    -e ARCH="$ARCH" \
    -e BUILD_TASK="$BUILD_TASK" \
    -e VERIFY_CMD="$VERIFY_CMD" \
    -v "$HOME/.cargo/git:/root/.cargo/git" \
    -v "$HOME/.cargo/registry:/root/.cargo/registry" \
    -v "$REPO_ROOT:/build" \
    "${TARGET_VOLUME_ARGS[@]}" \
    -w /build \
    --entrypoint bash \
    "$DOCKER_IMAGE" \
    -xeo pipefail scripts/docker-native-build.sh

  echo ""
  echo "Successfully built: $TARGET"
  echo ""
done

echo "All targets built successfully!"
