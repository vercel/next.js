# Multi-stage Dockerfile for building Next.js native binaries (next-swc).
#
# Two final images share a common base:
#   - next-swc-builder:latest       — Linux targets (x86_64/aarch64 × gnu/musl)
#   - next-swc-builder-win:latest   — Windows targets (x86_64/aarch64 × msvc)
#
# Build:
#   docker build --target linux -t next-swc-builder:latest ...
#   docker build --target windows -t next-swc-builder-win:latest ...
#
# The base image includes:
#   - Ubuntu 22.04 (build host only — output binaries target older glibc/CRT)
#   - Clang/LLD for compilation and linking
#   - Node.js 20 (build tool for npm/napi-cli)
#   - Rust nightly toolchain (pinned to match rust-toolchain.toml)
#   - @napi-rs/cli and cargo-rustflags

# ============================================================
# Stage: base — shared toolchain for all targets
# ============================================================
FROM ubuntu:22.04 AS base

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates \
    clang lld llvm pkg-config wget git xz-utils libssl-dev \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Rust — pinned nightly from rust-toolchain.toml
COPY rust-toolchain.toml /tmp/rust-toolchain.toml
RUN TOOLCHAIN=$(grep 'channel' /tmp/rust-toolchain.toml | sed 's/.*"\(.*\)".*/\1/') && \
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | \
      sh -s -- -y --default-toolchain "$TOOLCHAIN" --profile minimal && \
    rm /tmp/rust-toolchain.toml

ENV PATH="/root/.cargo/bin:${PATH}"

# Install cargo-binstall, then use it for Rust tools.
ARG CARGO_BINSTALL_VERSION=1.18.1
RUN ARCH=$(uname -m) && \
    curl -fsSL "https://github.com/cargo-bins/cargo-binstall/releases/download/v${CARGO_BINSTALL_VERSION}/cargo-binstall-${ARCH}-unknown-linux-musl.tgz" \
      | tar xz -C /root/.cargo/bin && \
    npm i -g @napi-rs/cli@2.18.4 && \
    cargo binstall --no-confirm --targets "${ARCH}-unknown-linux-musl" cargo-rustflags@0.4.0 && \
    cargo binstall --no-confirm --git https://github.com/vercel/sccache sccache && \
    node --version && rustc --version && napi -h > /dev/null && cargo rustflags --help > /dev/null && sccache --version

WORKDIR /build

# ============================================================
# Stage: linux — GNU and musl cross-compilation sysroots
# ============================================================
FROM base AS linux

# If the host provides an apt mirror URL (e.g. Hetzner), use it for the
# native architecture. The suite names come from the container's own OS.
ARG APT_MIRROR=

# Enable multiarch for cross-compilation sysroots.
RUN HOST_ARCH=$(dpkg --print-architecture) && \
    if [ "$HOST_ARCH" = "arm64" ]; then \
      NATIVE_MIRROR="${APT_MIRROR:-http://ports.ubuntu.com/ubuntu-ports}"; FOREIGN_ARCH=amd64; \
      FOREIGN_MIRROR="http://archive.ubuntu.com/ubuntu"; \
    else \
      NATIVE_MIRROR="${APT_MIRROR:-http://archive.ubuntu.com/ubuntu}"; FOREIGN_ARCH=arm64; \
      FOREIGN_MIRROR="http://ports.ubuntu.com/ubuntu-ports"; \
    fi && \
    dpkg --add-architecture "$FOREIGN_ARCH" && \
    printf '%s\n' \
      "deb [arch=${HOST_ARCH}] ${NATIVE_MIRROR} jammy main universe" \
      "deb [arch=${HOST_ARCH}] ${NATIVE_MIRROR} jammy-updates main universe" \
      "deb [arch=${HOST_ARCH}] ${NATIVE_MIRROR} jammy-security main universe" \
      "deb [arch=${FOREIGN_ARCH}] ${FOREIGN_MIRROR} jammy main universe" \
      "deb [arch=${FOREIGN_ARCH}] ${FOREIGN_MIRROR} jammy-updates main universe" \
      "deb [arch=${FOREIGN_ARCH}] ${FOREIGN_MIRROR} jammy-security main universe" \
      > /etc/apt/sources.list && \
    apt-get update && apt-get install -y --no-install-recommends \
      crossbuild-essential-amd64 crossbuild-essential-arm64 \
    && rm -rf /var/lib/apt/lists/*

# Download musl cross-toolchains from musl.cc for their sysroots.
# https://musl.cc/
RUN cd /opt && \
    for TRIPLE in aarch64-linux-musl x86_64-linux-musl; do \
      wget -qO- "https://musl.cc/${TRIPLE}-cross.tgz" | tar xz && \
      cp /opt/${TRIPLE}-cross/lib/gcc/${TRIPLE}/*/crt*.o \
         /opt/${TRIPLE}-cross/lib/gcc/${TRIPLE}/*/libgcc.a \
         /opt/${TRIPLE}-cross/${TRIPLE}/lib/; \
    done

RUN rustup target add \
    x86_64-unknown-linux-gnu \
    aarch64-unknown-linux-gnu \
    x86_64-unknown-linux-musl \
    aarch64-unknown-linux-musl

# ============================================================
# Stage: windows — MSVC cross-compilation via cargo-xwin
# ============================================================
FROM base AS windows

RUN cargo binstall --no-confirm cargo-xwin@0.21.5

RUN rustup target add \
    x86_64-pc-windows-msvc \
    aarch64-pc-windows-msvc

# Use Rust's bundled LLD (v22+) for lld-link — it supports /guard:ehcont
# which the xwin CRT's loadcfg.obj requires. Ubuntu's system LLD is too old.
# rust-lld auto-detects flavor from argv[0] "lld-link".
# clang-cl is clang in MSVC-compatible mode (same binary, different argv[0]).
RUN SYSROOT=$(rustc --print sysroot) && \
    HOST=$(rustc -vV | grep host | cut -d' ' -f2) && \
    ln -sf "$SYSROOT/lib/rustlib/$HOST/bin/rust-lld" /usr/local/bin/lld-link && \
    ln -sf llvm-ar /usr/bin/llvm-lib && \
    ln -sf clang /usr/bin/clang-cl

# Pre-cache MSVC SDK for cargo-xwin so it doesn't re-download on every build.
RUN mkdir -p /tmp/_xwin_seed/src && \
    echo "fn main(){}" > /tmp/_xwin_seed/src/main.rs && \
    printf '[package]\nname="d"\nversion="0.0.0"\nedition="2021"\n' > /tmp/_xwin_seed/Cargo.toml && \
    cd /tmp/_xwin_seed && \
    cargo xwin check --target x86_64-pc-windows-msvc && \
    cargo xwin check --target aarch64-pc-windows-msvc && \
    rm -rf /tmp/_xwin_seed
