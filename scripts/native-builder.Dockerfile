# Multi-stage Dockerfile for building Next.js native binaries (next-swc).
#
# Produces a single image that can cross-compile ALL 4 Linux targets
# (x86_64/aarch64 × gnu/musl) from either an x86_64 or aarch64 host.
#
# Build:
#   docker build -t next-swc-builder:latest -f scripts/native-builder.Dockerfile .
#
# The image includes:
#   - Ubuntu 20.04 (glibc 2.31 — broad compatibility baseline)
#   - Clang/LLD for all compilation and linking via --target
#   - GNU cross-sysroots via crossbuild-essential (Ubuntu multiarch)
#   - musl sysroots from musl.cc (headers + libs only; clang/lld do the work)
#   - Node.js 20 (glibc-linked, used as build tool for all targets)
#   - Rust nightly toolchain (pinned to match rust-toolchain.toml)
#   - @napi-rs/cli for building native Node.js addons

FROM ubuntu:20.04 AS builder

# Avoid interactive prompts during apt-get
ENV DEBIAN_FRONTEND=noninteractive

# Enable multiarch for cross-compilation sysroots.
# Write sources.list from scratch with explicit [arch=...] tags.
# On arm64 hosts: native packages from ports, foreign amd64 from archive.
# On amd64 hosts: native packages from archive, foreign arm64 from ports.
RUN HOST_ARCH=$(dpkg --print-architecture) && \
    if [ "$HOST_ARCH" = "arm64" ]; then \
      NATIVE_MIRROR="http://ports.ubuntu.com/ubuntu-ports"; FOREIGN_ARCH=amd64; \
      FOREIGN_MIRROR="http://archive.ubuntu.com/ubuntu"; \
    else \
      NATIVE_MIRROR="http://archive.ubuntu.com/ubuntu"; FOREIGN_ARCH=arm64; \
      FOREIGN_MIRROR="http://ports.ubuntu.com/ubuntu-ports"; \
    fi && \
    dpkg --add-architecture "$FOREIGN_ARCH" && \
    printf '%s\n' \
      "deb [arch=${HOST_ARCH}] ${NATIVE_MIRROR} focal main universe" \
      "deb [arch=${HOST_ARCH}] ${NATIVE_MIRROR} focal-updates main universe" \
      "deb [arch=${HOST_ARCH}] ${NATIVE_MIRROR} focal-security main universe" \
      "deb [arch=${FOREIGN_ARCH}] ${FOREIGN_MIRROR} focal main universe" \
      "deb [arch=${FOREIGN_ARCH}] ${FOREIGN_MIRROR} focal-updates main universe" \
      "deb [arch=${FOREIGN_ARCH}] ${FOREIGN_MIRROR} focal-security main universe" \
      > /etc/apt/sources.list
  
# Core build tools + GNU cross-compilation sysroots + Node.js 20 via nodesource.
# crossbuild-essential installs headers + libs in the multiarch layout
# that clang finds via --target. Both archs installed so the image
# works on either host architecture.
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y --no-install-recommends \
    nodejs \
    clang lld llvm pkg-config wget git xz-utils libssl-dev \
    crossbuild-essential-amd64 crossbuild-essential-arm64 \
    && rm -rf /var/lib/apt/lists/*

# Download musl cross-toolchains from musl.cc for their sysroots
# (headers, crt files, libc, libgcc). Clang + rust-lld handle compilation
# and linking; we only need the target libraries.
# Also copy GCC's crt files and libgcc into the sysroot lib dir — clang 10
# doesn't search the --gcc-toolchain path for these files.
# https://musl.cc/
RUN cd /opt && \
    for TRIPLE in aarch64-linux-musl x86_64-linux-musl; do \
      wget -qO- "https://musl.cc/${TRIPLE}-cross.tgz" | tar xz && \
      cp /opt/${TRIPLE}-cross/lib/gcc/${TRIPLE}/*/crt*.o \
         /opt/${TRIPLE}-cross/lib/gcc/${TRIPLE}/*/libgcc.a \
         /opt/${TRIPLE}-cross/${TRIPLE}/lib/; \
    done

# Install Rust — pinned nightly from rust-toolchain.toml
# The COPY of rust-toolchain.toml ensures the image rebuilds when the toolchain changes.
COPY rust-toolchain.toml /tmp/rust-toolchain.toml
RUN TOOLCHAIN=$(grep 'channel' /tmp/rust-toolchain.toml | sed 's/.*"\(.*\)".*/\1/') && \
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | \
      sh -s -- -y --default-toolchain "$TOOLCHAIN" --profile minimal && \
    rm /tmp/rust-toolchain.toml

ENV PATH="/root/.cargo/bin:${PATH}"

# Add all 4 Linux rustup targets
RUN rustup target add \
    x86_64-unknown-linux-gnu \
    aarch64-unknown-linux-gnu \
    x86_64-unknown-linux-musl \
    aarch64-unknown-linux-musl

# Install @napi-rs/cli, cargo-rustflags, and sccache.
# Use cargo-binstall for sccache (pre-built binary, much faster than compiling).
RUN npm i -g @napi-rs/cli@2.18.4 && \
    cargo install cargo-rustflags && \
    BINSTALL_ARCH=$(uname -m) && \
    curl -fsSL "https://github.com/cargo-bins/cargo-binstall/releases/latest/download/cargo-binstall-${BINSTALL_ARCH}-unknown-linux-musl.tgz" | tar xz -C /root/.cargo/bin && \
    cargo binstall sccache@0.14.0 --no-confirm

# Verify installations
RUN node --version && rustc --version && napi -h > /dev/null && cargo rustflags --help > /dev/null && sccache --version

WORKDIR /build
