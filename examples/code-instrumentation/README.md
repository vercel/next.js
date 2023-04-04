# Code Instrumentation

This example shows how to instrument your code with [babel-plugin-istanbul](https://github.com/istanbuljs/babel-plugin-istanbul) and [Next.js](https://nextjs.org/).

Furthermore, this demonstrates a potential method for instrumentation through the use of [swc-plugin-coverage-instrument](https://github.com/kwonoj/swc-plugin-coverage-instrument), a [swc](https://swc.rs/) plugin designed for code coverage instrumentation. Although this approach is currently incompatible with the latest Next.js version due to newly introduced features, the example remains as a reference for achieving this functionality. Refer to the `next.config.js` file for more information.

This example includes Next.js' built-in support for Global CSS, CSS Modules and TypeScript.

## How to Use

Quickly get started using [Create Next App](https://github.com/vercel/next.js/tree/canary/packages/create-next-app#readme)!

In your terminal, run the following command:

```bash
npx create-next-app --example code-intrumentation code-intrumentation-app
```

```bash
yarn create next-app --example code-intrumentation code-intrumentation-app
```

```bash
pnpm create next-app --example code-intrumentation code-intrumentation-app
```

## Notes

### Run Instrumentation Mode

```bash
npm run dev:instrument
```

In the current setup using the `babel-plugin-istanbul`, coverage information can be accessed via the `/api/__coverage__` endpoint. See the `src/app/api/__coverage__/route.ts` file for more information.
