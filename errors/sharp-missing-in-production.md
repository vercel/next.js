# Sharp Missing In Production

#### Why This Error Occurred

The `next/image` component's default loader uses [`squoosh`](https://www.npmjs.com/package/@squoosh/lib) because it is quick to install and suitable for a development environment.

- For a production environment using `next start`, it is strongly recommended you install [`sharp`](https://www.npmjs.com/package/sharp).

You are seeing this error because Image Optimization in production mode (`next start`) was detected.

- For a production environment using `output: "standalone"`, you must install [`sharp`](https://www.npmjs.com/package/sharp).

You are seeing this error because Image Optimization in standalone mode (`output: "standalone"`) was detected.

#### Possible Ways to Fix It

- Install `sharp` by running one of the following commands in your project directory:

```bash
npm i sharp
```

```bash
yarn add sharp
```

```bash
pnpm add sharp
```

Then, build your project with `next build`. Finally, restart the server with either `next start` for production mode or `node server.js` for standalone mode.

- If `sharp` is already installed but can't be resolved, set the `NEXT_SHARP_PATH` environment variable such as `export NEXT_SHARP_PATH=/tmp/node_modules/sharp`. Then, build your project with `next build`. Finally, restart the server with either `next start` for production mode or `node server.js` for standalone mode.

> Note: This is not necessary for Vercel deployments, since `sharp` is installed automatically for you.

### Useful Links

- [Image Optimization Documentation](https://nextjs.org/docs/basic-features/image-optimization)
- [`next/image` Documentation](https://nextjs.org/docs/api-reference/next/image)
- [Output File Tracing](/docs/advanced-features/output-file-tracing)
