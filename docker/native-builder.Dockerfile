# Multi-stage Dockerfile for building Next.js native binaries (next-swc).
#
# Produces a single image that can cross-compile ALL 4 Linux targets
# (x86_64/aarch64 × gnu/musl) from either an x86_64 or aarch64 host.
#
# Build:
#   docker build -t next-swc-builder:latest -f docker/native-builder.Dockerfile .
#
# The image includes:
#   - Ubuntu 20.04 (glibc 2.31 — broad compatibility baseline)
#   - Clang/LLD for all compilation and linking via --target
#   - GNU cross-sysroots via crossbuild-essential (Ubuntu multiarch)
#   - musl sysroots from musl.cc (headers + libs only; clang/lld do the work)
#   - Node.js 20 (glibc-linked, used as build tool for all targets)
#   - Rust nightly toolchain (pinned to match rust-toolchain.toml)
#   - @napi-rs/cli for building native Node.js addons

# ---------------------------------------------------------------------------
# Stage 1: Extract glibc-linked Node.js binary + headers
# ---------------------------------------------------------------------------
FROM node:20-slim AS node-gnu
RUN mkdir -p /out && \
    cp -r /usr/local/bin /out/bin && \
    cp -r /usr/local/include /out/include && \
    cp -r /usr/local/lib /out/lib

# ---------------------------------------------------------------------------
# Stage 2: Builder image
# ---------------------------------------------------------------------------
FROM ubuntu:20.04 AS builder

# Avoid interactive prompts during apt-get
ENV DEBIAN_FRONTEND=noninteractive

# Enable multiarch for cross-compilation sysroots.
# On arm64 hosts, amd64 packages live on archive.ubuntu.com (not ports).
# On amd64 hosts, arm64 packages live on ports.ubuntu.com (not archive).
# We detect the host arch and add the appropriate foreign arch + mirror.
RUN HOST_ARCH=$(dpkg --print-architecture) && \
    if [ "$HOST_ARCH" = "arm64" ]; then \
      dpkg --add-architecture amd64 && \
      # Pin existing sources to arm64 so they don't try to fetch amd64 from ports
      sed -i "s|^deb |deb [arch=arm64] |" /etc/apt/sources.list && \
      # Add amd64 packages from the main Ubuntu archive
      echo "deb [arch=amd64] http://archive.ubuntu.com/ubuntu focal main universe" >> /etc/apt/sources.list && \
      echo "deb [arch=amd64] http://archive.ubuntu.com/ubuntu focal-updates main universe" >> /etc/apt/sources.list && \
      echo "deb [arch=amd64] http://archive.ubuntu.com/ubuntu focal-security main universe" >> /etc/apt/sources.list; \
    elif [ "$HOST_ARCH" = "amd64" ]; then \
      dpkg --add-architecture arm64 && \
      # Pin existing sources to amd64 so they don't try to fetch arm64 from archive
      sed -i "s|^deb |deb [arch=amd64] |" /etc/apt/sources.list && \
      # Add arm64 packages from the ports archive
      echo "deb [arch=arm64] http://ports.ubuntu.com/ubuntu-ports focal main universe" >> /etc/apt/sources.list && \
      echo "deb [arch=arm64] http://ports.ubuntu.com/ubuntu-ports focal-updates main universe" >> /etc/apt/sources.list && \
      echo "deb [arch=arm64] http://ports.ubuntu.com/ubuntu-ports focal-security main universe" >> /etc/apt/sources.list; \
    fi

# Core build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    clang \
    lld \
    llvm \
    pkg-config \
    curl \
    wget \
    git \
    ca-certificates \
    xz-utils \
    # GNU cross-compilation sysroots (headers + libs). These install the
    # proper multiarch layout that clang finds automatically via --target.
    # On arm64 hosts: crossbuild-essential-amd64 provides x86_64 sysroot.
    # On x86_64 hosts: crossbuild-essential-arm64 provides aarch64 sysroot.
    # Install both so the image works on either host architecture.
    crossbuild-essential-amd64 \
    crossbuild-essential-arm64 \
    && rm -rf /var/lib/apt/lists/*

# Download musl cross-toolchains from musl.cc for their sysroots
# (musl headers, crt files, libc, libgcc). Clang + rust-lld handle
# compilation and linking; we only need the target libraries.
# https://musl.cc/
RUN cd /opt && \
    wget -qO- "https://musl.cc/aarch64-linux-musl-cross.tgz" | tar xz && \
    wget -qO- "https://musl.cc/x86_64-linux-musl-cross.tgz" | tar xz && \
    # Copy GCC's crt files and libgcc into the sysroot lib dir.
    # clang 10 finds crti.o/crtn.o from the sysroot but doesn't search the
    # --gcc-toolchain path (lib/gcc/<triple>/<ver>/) for GCC's own files.
    # Merging them into the sysroot lib avoids this limitation.
    cp /opt/aarch64-linux-musl-cross/lib/gcc/aarch64-linux-musl/*/crt*.o \
       /opt/aarch64-linux-musl-cross/lib/gcc/aarch64-linux-musl/*/libgcc.a \
       /opt/aarch64-linux-musl-cross/aarch64-linux-musl/lib/ && \
    cp /opt/x86_64-linux-musl-cross/lib/gcc/x86_64-linux-musl/*/crt*.o \
       /opt/x86_64-linux-musl-cross/lib/gcc/x86_64-linux-musl/*/libgcc.a \
       /opt/x86_64-linux-musl-cross/x86_64-linux-musl/lib/

# Copy Node.js from multi-stage build. We use the glibc-linked node for ALL
# targets — node is just a build tool (runs npm/napi-cli), and the output
# .node shared library's linking is determined by cargo's --target, not the
# node binary. N-API is ABI-stable across glibc and musl.
COPY --from=node-gnu /out /opt/node-gnu
ENV PATH="/opt/node-gnu/bin:${PATH}"

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

# Install @napi-rs/cli and cargo-rustflags globally.
# cargo-rustflags resolves the effective RUSTFLAGS for a target by querying
# cargo's own config resolution (handles cfg() predicates, --config overlays).
RUN npm i -g @napi-rs/cli@2.18.4 && \
    cargo install cargo-rustflags

# Verify installations
RUN node --version && rustc --version && napi -h > /dev/null && cargo rustflags --help > /dev/null

WORKDIR /build
