# Building

You can build Next.js, including all type definitions and packages, with:

```bash
pnpm build
```

> [!TIP]
> Next.js uses [taskr](https://www.npmjs.com/package/taskr) to parallelize the build tasks.
> The tasks can be found in the [`taskfile.js`](../../packages/next/taskfile.js) file, and each task name refers to the name of the function to execute.
> For example, `taskr release` will execute the `release()` function in the `taskfile.js` file.

The build process consists of the three main tasks:

- [Compile the TypeScript sources with SWC](#compile-the-typescript-sources-with-swc)
- [Bundle the project with Webpack](#bundle-the-project-with-webpack)
- [Generate the type definitions](#generate-the-type-definitions)

### Compile the TypeScript Sources with SWC

By default, the latest canary of the `next-swc` binaries will be installed and used to compile the TypeScript sources of the project. These sources are meant to be built inside the `packages/next/dist/...` directory. The outputs will include compiled JavaScript files and source maps.

### Bundle the Project with Webpack

Based on the outputs of the compilation, the project is then bundled with Webpack. The configuration can be found in the [`next-runtime.webpack-config.js`](../../packages/next/next-runtime.webpack-config.js) file.

### Generate the Type Definitions

The type definitions are generated using the TypeScript [`tsc`](https://www.typescriptlang.org/docs/handbook/compiler-options.html) compiler. You can build them separately with `pnpm types`. The [`tsconfig.build.json`](../../packages/next/tsconfig.build.json) is used which extends the base [`tsconfig.json`](../../packages/next/tsconfig.json) but excludes test files and other unneeded type definitions.

## Working on Turbopack, WASM, and other Rust code

If you are actively working on Rust code or you need to test out the most recent Rust code that hasn't been published as a canary yet, you can [install Rust](https://www.rust-lang.org/tools/install) and run `pnpm swc-build-native`.

If you want to test out the wasm build locally, you will need to [install wasm-pack](https://rustwasm.github.io/wasm-pack/installer/). Run `pnpm --filter=@next/swc build-wasm --target <wasm_target>` to build and `node ./scripts/setup-wasm.mjs` to copy it into your `node_modules`. Run next with `NODE_OPTIONS='--no-addons'` to force it to use the wasm binary.

If you need to clean the project for any reason, use `pnpm clean`.
