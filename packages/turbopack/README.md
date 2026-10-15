# `turbopack`

The standalone Turbopack bundler CLI, intended for benchmarking the bundler
against generic JavaScript codebases.

The package has two halves that build independently:

- the native addon, built from the `turbopack-napi` crate in
  `turbopack/crates/turbopack-napi` into `native/`
- the TypeScript CLI in `src/`, compiled into `dist/`

### Building

Build both halves:

```sh
pnpm --filter turbopack build
```

Build just one half. While iterating on `src/`, there is no need to rebuild the
native addon:

```sh
pnpm --filter turbopack build-native
pnpm --filter turbopack build-ts
```

Run the result:

```sh
node packages/turbopack/dist/cli.js help
```

### Scripts

| Script                 | Description                                                       |
| ---------------------- | ----------------------------------------------------------------- |
| `build`                | Builds the native addon and then the TypeScript CLI.              |
| `build-native`         | Builds the `turbopack-napi` crate into `native/` (debug profile). |
| `build-native-release` | Same as above, but with the release profile.                      |
| `build-ts`             | Compiles `src/` into `dist/` with `tsc`.                          |
| `typescript`           | Type-checks `src/` without emitting.                              |
| `clean`                | Removes `native/` and `dist/`.                                    |
