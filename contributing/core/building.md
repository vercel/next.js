# Building

You can build Next.js, including all type definitions and packages, with:

```bash
pnpm build
```

By default, the latest canary of the `next-swc` binaries will be installed and used. If you are actively working on Rust code or you need to test out the most recent Rust code that hasn't been published as a canary yet, you can [install Rust](https://www.rust-lang.org/tools/install) and run `pnpm --filter=@next/swc build-native`.

If you want to test out the wasm build locally, you will need to [install wasm-pack](https://rustwasm.github.io/wasm-pack/installer/). Run `pnpm --filter=@next/swc build-wasm --target <wasm_target>` to build and `node ./scripts/setup-wasm.mjs` to copy it into your `node_modules`. Run next with `NODE_OPTIONS='--no-addons'` to force it to use the wasm binary.

If you need to clean the project for any reason, use `pnpm clean`.
