# WebAssembly example

This example shows how to import WebAssembly files (`.wasm`) and use them inside of a React component that is server rendered. So the WebAssembly code is executed on the server too. In the case of this example we're showing Rust compiled to WebAssembly.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-webassembly)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-emotion&project-name=with-emotion&repository-name=with-emotion)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-webassembly with-webassembly-app
```

```bash
yarn create next-app --example with-webassembly with-webassembly-app
```

```bash
pnpm create next-app --example with-webassembly with-webassembly-app
```

This example uses Rust compiled to wasm, the wasm file is included in the example, but to compile your own Rust code you'll have to [install](https://www.rust-lang.org/learn/get-started) Rust.

To compile `src/add.rs` to `add.wasm` run:

```bash
npm run build-rust
# or
yarn build-rust
# or
pnpm build-rust
```
