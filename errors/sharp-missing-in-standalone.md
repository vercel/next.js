# Missing sharp in standalone mode

#### Why This Error Occurred

You have enabled `output: "standalone"`, but forgot to install `sharp` as a dependency while depending on it due to [Image Optimization](https://nextjs.org/docs/basic-features/image-optimization). For the image optimization to function correctly, `sharp` needs to be installed.

#### Possible Ways to Fix It

Install `sharp` as a dependency before running `next build`:

```bash
npm i sharp
```

```bash
yarn add sharp
```

```bash
pnpm add sharp
```

### Useful Links

- [Output File Tracing](/docs/advanced-features/output-file-tracing)
- [Image Optimization Documentation](/docs/basic-features/image-optimization)
- [`next/image` Documentation](/docs/api-reference/next/image)
