---
name: next-rspack
description: >
  Maintain @next/rspack-core and @next/rspack-binding packages. Use when editing
  rspack/package.json, rspack/crates/binding/Cargo.toml, rspack/rust-toolchain.toml,
  or packages/next-rspack/package.json. Covers upgrading @rspack/core npm version,
  rspack_* crate versions, Rust toolchain version, building and linking for local
  testing, and NEXT_RSPACK environment variable usage. Does NOT apply to root
  rust-toolchain.toml (that's for Turbopack).
---

# Next.js with Rspack

## When to Use

Use this skill when you need to:

- Upgrade `@rspack/core` npm package version
- Upgrade rspack crate dependency versions
- Upgrade Rust version in `rspack/rust-toolchain.toml` (rspack directory only)
- Fix Rspack-related compilation issues
- Develop Rspack-specific features in Next.js

> **⚠️ Scope Limitation**: This skill only applies to code and configuration under the `rspack/` directory. The `rust-toolchain.toml` in the repository root is for Turbopack and is outside the scope of this skill.

## Architecture Overview

### Package Structure

```
rspack/                          # Independent workspace (separate rust toolchain and npm releases)
├── Cargo.toml                   # Rust workspace configuration
├── rust-toolchain.toml          # Rust version configuration
├── package.json                 # @next/rspack-core package definition
├── lib/
│   ├── index.js                 # Exports @rspack/core + custom plugins
│   └── index.d.ts               # Type definitions
└── crates/
    └── binding/
        ├── Cargo.toml           # Rust crate dependencies (rspack_* crates)
        └── package.json         # @next/rspack-binding package definition

packages/
└── next-rspack/
    └── package.json             # References @next/rspack-core
```

### Dependency Graph

```
packages/next-rspack
    └── @next/rspack-core (rspack/package.json)
            ├── @rspack/core (npm dependency)
            └── @next/rspack-binding (rspack/crates/binding)
                    └── rspack_* crates (Cargo.toml dependencies)
```

### Version Mapping Rules

| @rspack/core npm version | rspack crate version | Notes                                             |
| ------------------------ | -------------------- | ------------------------------------------------- |
| `2.0.0-rc.0`             | `0.100.0-rc.0`       | npm major.minor maps to crate 0.(major\*50+minor) |
| `1.3.x`                  | `0.53.x`             | e.g., 1.3 → 0.53                                  |
| `1.2.x`                  | `0.52.x`             | e.g., 1.2 → 0.52                                  |

## Upgrade Process

### Step 1: Get Upstream Version Information

Query https://github.com/web-infra-dev/rspack to obtain:

- Target `@rspack/core` npm version
- Corresponding rspack crate version
- Rust channel version from `rust-toolchain.toml`

### Step 2: Update npm Dependencies

Edit `rspack/package.json`:

```json
{
  "dependencies": {
    "@rspack/core": "<new version>",
    "@next/rspack-binding": "workspace:*"
  }
}
```

### Step 3: Update Cargo.toml

Edit `rspack/crates/binding/Cargo.toml`, update all rspack crate versions:

```toml
[dependencies]
rspack_binding_builder        = { version = "=<new crate version>" }
rspack_binding_builder_macros = { version = "=<new crate version>" }
rspack_core                   = { version = "=<new crate version>" }
rspack_error                  = { version = "=<new crate version>" }
rspack_hook                   = { version = "=<new crate version>" }
rspack_plugin_externals       = { version = "=<new crate version>" }
rspack_regex                  = { version = "=<new crate version>" }
# rspack_sources version is managed separately, may not follow the main version

[target.'cfg(...)'.dependencies]
rspack_binding_builder = { version = "=<new crate version>", features = ["plugin"] }

[build-dependencies]
rspack_binding_build = { version = "=<new crate version>" }
```

### Step 4: Update Rust Toolchain

Edit `rspack/rust-toolchain.toml`:

```toml
[toolchain]
profile = "default"
components = ["rust-src"]
channel = "<nightly version matching upstream rspack>"
```

### Step 5: Verify Build

```bash
# Execute in rspack directory
cd rspack

# Check Rust code
cargo check

# Build binding (requires Rust installed)
pnpm build
```

### Step 6: Link to packages/next-rspack

`rspack/` is an independent workspace not included in the root pnpm-workspace, manual linking is required:

```bash
# Execute from repository root
cd packages/next-rspack

# Link locally built @next/rspack-core
pnpm link ../../rspack
```

Or modify `packages/next-rspack/package.json` to use local path (for local testing only, do not commit):

```json
{
  "dependencies": {
    "@next/rspack-core": "link:../../rspack"
  }
}
```

> **Important**: After linking, run `pnpm install` in the root directory to update dependency relationships.

### Step 7: Run Tests

```bash
# Execute from repository root
pnpm test-rspack
```

## Key Files Checklist

Files to check/modify during upgrade:

| File Path                            | Modification                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------- |
| `rspack/package.json`                | `@rspack/core` version, package version                                               |
| `rspack/crates/binding/Cargo.toml`   | rspack\_\* crate versions                                                             |
| `rspack/crates/binding/package.json` | binding package version                                                               |
| `rspack/rust-toolchain.toml`         | Rust nightly version                                                                  |
| `packages/next-rspack/package.json`  | `@next/rspack-core` version reference (update on release, use link for local testing) |

## Pre-requisites for Local Testing

Before running `pnpm test-rspack`, you must build and link `@next/rspack-core`:

```bash
# 1. Build @next/rspack-core
cd rspack
pnpm install
pnpm build

# 2. Link to packages/next-rspack
cd ../packages/next-rspack
pnpm link ../../rspack

# 3. Return to root and update dependencies
cd ../..
pnpm install

# 4. Run tests
pnpm test-rspack
```

> **Note**: After modifying Rust code under `rspack/`, you need to re-run `pnpm build` from step 1.

## Test Commands

```bash
# Full test suite (using Rspack compiler)
pnpm test-rspack

# Development mode tests
pnpm test-dev-rspack

# Production mode tests
pnpm test-start-rspack

# Run specific tests only
pnpm run with-rspack pnpm testonly -- <test-pattern>
```

All test commands set environment variables via `with-rspack`:

```bash
cross-env NEXT_RSPACK=1 NEXT_TEST_USE_RSPACK=1
```

## Development Notes

### Environment Variable Differentiation

Use the `NEXT_RSPACK` environment variable to differentiate compilers in `packages/next/` code:

```typescript
// Check if using Rspack
const isRspack = Boolean(process.env.NEXT_RSPACK)

if (process.env.NEXT_RSPACK) {
  // Rspack-specific logic
} else {
  // Webpack logic
}
```

### Common Code Locations

- Compiler selection logic: `packages/next/src/lib/bundler.ts`
- Webpack configuration: `packages/next/src/build/webpack-config.ts`
- Loader adaptations: `packages/next/src/build/webpack/loaders/`

### Custom Plugins

`@next/rspack-core` exports = `@rspack/core` + custom plugins:

- `NextExternalsPlugin` - externals handling plugin implemented in Rust

## Release Process

Release via GitHub Actions workflow:

- Workflow: `.github/workflows/release-next-rspack.yml`
- Supports dry-run mode
- Supports multiple npm tags (latest, alpha, beta, canary)

## References

- Upstream Rspack repository: https://github.com/web-infra-dev/rspack
- Rspack documentation: https://rspack.rs
- Next.js with Rspack example: `examples/with-rspack/`
