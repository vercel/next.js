# node-file-trace

Node file trace (nft) is a binary / library that can be used to precisely determine
which files (including those in `node_modules`) are needed for a given application at
run time.

## Usage

There are a few commands available (accessed via the `Args` struct if consuming as a
library). You can see these by running the binary. The binary should be self-documenting.

```bash
cargo run
```

## Externals

Tracing externals is not currently supported, though support will be added soon.
