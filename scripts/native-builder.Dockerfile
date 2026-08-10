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
#   - musl sysroots from GHCR-hosted rust-musl-cross images
#   - Node.js 20 (glibc-linked, used as build tool for all targets)
#   - Rust nightly toolchain (pinned to match rust-toolchain.toml)
#   - @napi-rs/cli for building native Node.js addons

FROM ghcr.io/rust-cross/rust-musl-cross:x86_64-musl@sha256:bcf6a66615f9d5bae659e38ab4311260e0488d1c34ad0ab9f9147f4cd5ef64ed AS musl_x86_64
FROM ghcr.io/rust-cross/rust-musl-cross:aarch64-musl@sha256:eab6a58ff66eaa33fa87fc31ed11403596719ca3f23aa51626fb993d77c1200b AS musl_aarch64

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
  
# Every download below retries with a backoff. Fetches from CI runners fail
# intermittently at the connection level (the canary.10 build got "OpenSSL
# SSL_connect: Connection reset by peer" from sh.rustup.rs), and a single lost
# download costs a whole canary release. curl's own --retry does not cover
# connection-level errors, and --retry-all-errors needs curl 7.71 while Ubuntu
# 20.04 ships 7.68, so the retry is an explicit loop.

# Core build tools + GNU cross-compilation sysroots.
# crossbuild-essential installs headers + libs in the multiarch layout
# that clang finds via --target. Both archs installed so the image
# works on either host architecture.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates \
    clang lld llvm pkg-config wget git xz-utils libssl-dev \
    crossbuild-essential-amd64 crossbuild-essential-arm64 \
    && rm -rf /var/lib/apt/lists/*

# Node.js 20 (glibc-linked, used as a build tool for all targets).
# Installed from the official nodejs.org static tarball rather than via
# NodeSource: the tarball bundles npm and corepack and does not depend on
# NodeSource's apt repo or GPG key server, which has intermittently returned
# HTTP 403 from CI runners. When the key import failed, the NodeSource setup
# script exited 0, so `apt-get install nodejs` silently fell back to Ubuntu's
# stock nodejs package (which does not bundle npm), breaking later npm steps.
ARG NODE_VERSION=20.20.2
RUN case "$(dpkg --print-architecture)" in \
      amd64) NODE_ARCH=x64 ;; \
      arm64) NODE_ARCH=arm64 ;; \
      *) echo "unsupported host architecture: $(dpkg --print-architecture)" >&2; exit 1 ;; \
    esac && \
    for attempt in 1 2 3 4 5; do \
      curl -fsSLo /tmp/node.tar.xz \
        "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" && break; \
      if [ "$attempt" = 5 ]; then echo "node: download failed after 5 attempts" >&2; exit 1; fi; \
      sleep $((attempt * 3)); \
    done && \
    tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 \
      --exclude CHANGELOG.md --exclude LICENSE --exclude README.md && \
    rm /tmp/node.tar.xz && \
    node --version && npm --version

# Import prebuilt musl sysroots from the rust-musl-cross images and stage them
# under /opt/*-cross for docker-native-build.sh. The symlinks provide the
# target names that our clang --sysroot flags use, and libgcc/crt objects are
# copied into the sysroot lib dir so clang/rust-lld can find them while linking.
COPY --from=musl_x86_64 /usr/local/musl /opt/x86_64-linux-musl-cross
COPY --from=musl_aarch64 /usr/local/musl /opt/aarch64-linux-musl-cross
RUN ln -s x86_64-unknown-linux-musl /opt/x86_64-linux-musl-cross/x86_64-linux-musl && \
    ln -s aarch64-unknown-linux-musl /opt/aarch64-linux-musl-cross/aarch64-linux-musl && \
    cp /opt/x86_64-linux-musl-cross/lib/gcc/x86_64-unknown-linux-musl/*/crt*.o \
       /opt/x86_64-linux-musl-cross/lib/gcc/x86_64-unknown-linux-musl/*/libgcc.a \
       /opt/x86_64-linux-musl-cross/x86_64-linux-musl/lib/ && \
    cp /opt/aarch64-linux-musl-cross/lib/gcc/aarch64-unknown-linux-musl/*/crt*.o \
       /opt/aarch64-linux-musl-cross/lib/gcc/aarch64-unknown-linux-musl/*/libgcc.a \
       /opt/aarch64-linux-musl-cross/aarch64-linux-musl/lib/

# Install Rust — pinned nightly from rust-toolchain.toml
# The COPY of rust-toolchain.toml ensures the image rebuilds when the toolchain changes.
# The installer is downloaded to a file and then run, rather than piped straight
# into sh. A pipeline reports the exit status of its last command, so when the
# download failed the layer still succeeded and produced an image with no Rust
# toolchain; the build then failed one layer later on `rustup target add` with a
# misleading "rustup: not found". That is what broke the v16.3.1-canary.10
# publish. `rustup --version` below asserts the install actually happened.
COPY rust-toolchain.toml /tmp/rust-toolchain.toml
RUN TOOLCHAIN=$(grep 'channel' /tmp/rust-toolchain.toml | sed 's/.*"\(.*\)".*/\1/') && \
    for attempt in 1 2 3 4 5; do \
      curl --proto '=https' --tlsv1.2 -fsSL -o /tmp/rustup-init.sh https://sh.rustup.rs && break; \
      if [ "$attempt" = 5 ]; then echo "rustup: download failed after 5 attempts" >&2; exit 1; fi; \
      sleep $((attempt * 3)); \
    done && \
    sh /tmp/rustup-init.sh -y --default-toolchain "$TOOLCHAIN" --profile minimal && \
    /root/.cargo/bin/rustup --version && \
    rm /tmp/rustup-init.sh /tmp/rust-toolchain.toml

ENV PATH="/root/.cargo/bin:${PATH}"

# Add all 4 Linux rustup targets
RUN rustup target add \
    x86_64-unknown-linux-gnu \
    aarch64-unknown-linux-gnu \
    x86_64-unknown-linux-musl \
    aarch64-unknown-linux-musl

# Install cargo-binstall, then use it for Rust tools.
ARG CARGO_BINSTALL_VERSION=1.18.1
RUN ARCH=$(uname -m) && \
    for attempt in 1 2 3 4 5; do \
      curl -fsSL -o /tmp/cargo-binstall.tgz \
        "https://github.com/cargo-bins/cargo-binstall/releases/download/v${CARGO_BINSTALL_VERSION}/cargo-binstall-${ARCH}-unknown-linux-musl.tgz" && break; \
      if [ "$attempt" = 5 ]; then echo "cargo-binstall: download failed after 5 attempts" >&2; exit 1; fi; \
      sleep $((attempt * 3)); \
    done && \
    tar xzf /tmp/cargo-binstall.tgz -C /root/.cargo/bin && \
    rm /tmp/cargo-binstall.tgz && \
    npm i -g @napi-rs/cli@2.18.4 && \
    cargo binstall --no-confirm --targets "${ARCH}-unknown-linux-musl" cargo-rustflags@0.4.0 && \
    cargo binstall --no-confirm --git https://github.com/vercel/sccache sccache && \
    node --version && rustc --version && napi -h > /dev/null && cargo rustflags --help > /dev/null && sccache --version

WORKDIR /build
