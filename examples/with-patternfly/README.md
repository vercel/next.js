# PatternFly 4 example

This example shows how to use Next.js with the [PatternFly 4](https://www.patternfly.org/v4/) design system.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-patternfly)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-patternfly&project-name=with-patternfly&repository-name=with-patternfly)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-patternfly with-patternfly-app
```

```bash
yarn create next-app --example with-patternfly with-patternfly-app
```

```bash
pnpm create next-app --example with-patternfly with-patternfly-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

## Troubleshooting

### Global CSS cannot be imported from within node_modules

PatternFly 4 packages published on [npm](https://npm.org) use Global CSS imports for styling of React components, which is not supported by Next.js.
To workaround this issue, this example uses [next-transpile-modules](https://www.npmjs.com/package/next-transpile-modules) to transpile the packages during compilation.
As a consequence, all packages that depend on [@patternfly/react-styles](https://www.npmjs.com/package/@patternfly/react-styles) need to be transpiled as well.

If you receive this error, verify whether all packages that depend on [@patternfly/react-styles](https://www.npmjs.com/package/@patternfly/react-styles) are specified in [next.config.js](next.config.js).

### PatternFly components do not appear to be styled

If your Next.js application compiles successfully, but PatternFly components in your application do not appear to be styled, make sure you have applied the global PatternFly stylesheet in `pages/_app.js`:

```javascript
// In pages/_app.js
import App from 'next/app'
import '@patternfly/react-core/dist/styles/base.css'

...
```

### All components styles are imported when using a PatternFly component

This is expected behavior in development mode. Tree shaking will remove these imports in production builds.

## Useful Links

- [PatternFly 4 documentation](https://www.patternfly.org/v4/)
- [next-transpile-modules](https://www.npmjs.com/package/next-transpile-modules)
