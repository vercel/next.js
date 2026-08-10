# Next.js & Vercel Blob example app

This example shows how to create an image gallery site using Next.js, [Vercel Blob](https://vercel.com/storage/blob), and [Tailwind](https://tailwindcss.com).

Images are discovered at build time via the `@vercel/blob` SDK's `list()` API, then probed with [sharp](https://github.com/lovell/sharp) to derive dimensions and pre-generate base64 blur placeholders for `next/image`. The blob `url` is served as-is — `next/image` (Vercel's image optimizer) takes care of responsive avif/webp variants.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-vercel-blob&project-name=nextjs-image-gallery&repository-name=with-vercel-blob&env=BLOB_READ_WRITE_TOKEN&envDescription=Read%2Fwrite%20token%20for%20your%20Vercel%20Blob%20store)

Check out our [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-vercel-blob with-vercel-blob-app
```

```bash
yarn create next-app --example with-vercel-blob with-vercel-blob-app
```

```bash
pnpm create next-app --example with-vercel-blob with-vercel-blob-app
```

## Setup

1. [Create a Vercel Blob store](https://vercel.com/docs/storage/vercel-blob) and upload your images to its root.
2. Copy `.env.local.example` to `.env.local` and set `BLOB_READ_WRITE_TOKEN` to the store's read/write token. (When deploying via the button above, set it as an environment variable on the project.)
3. `npm install && npm run dev`.

## References

- Vercel Blob: https://vercel.com/docs/storage/vercel-blob
- `@vercel/blob` SDK: https://vercel.com/docs/storage/vercel-blob/using-blob-sdk
- `next/image`: https://nextjs.org/docs/api-reference/next/image
