# Linux environment for building and testing Next.js' wasm32-wasip1-threads bindings from any host
# that can run Docker.
#
# Build from the repository root:
#   docker build -t next-wasi-builder -f scripts/wasi-builder.Dockerfile .
#
# Run with the repository mounted at /workspace:
#   docker run --rm -it -v "$PWD:/workspace" -w /workspace next-wasi-builder

FROM node:20-trixie

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    git \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && \
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --no-update-default-toolchain

ENV PATH="/root/.cargo/bin:${PATH}"
WORKDIR /workspace

CMD ["bash"]
