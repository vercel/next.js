# MDX Remote Example

This example shows how a simple blog might be built using the [next-mdx-remote](https://github.com/hashicorp/next-mdx-remote) library, which allows mdx content to be loaded via [`generateStaticParams`](https://nextjs.org/docs/app/api-reference/functions/generate-static-params). The mdx content is loaded from a local folder, but it could be loaded from a database or anywhere else.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/mdx-remote)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/mdx-remote&project-name=mdx-remote&repository-name=mdx-remote)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), [pnpm](https://pnpm.io), or [Bun](https://bun.sh/docs/cli/bunx) to bootstrap the example:

```bash
npx create-next-app --example mdx-remote mdx-remote-app
```

```bash
yarn create next-app --example mdx-remote mdx-remote-app
```

```bash
pnpm create next-app --example mdx-remote mdx-remote-app
```

```bash
bunx create-next-app --example mdx-remote mdx-remote-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/app/building-your-application/deploying)).

## Notes

### Conditional custom components

When using `next-mdx-remote`, you can pass custom components to the MDX renderer. However, some pages/MDX files might use components that are used infrequently, or only on a single page. To avoid loading those components on every MDX page, you can use [`next/dynamic`](https://nextjs.org/docs/app/building-your-application/optimizing/lazy-loading#nextdynamic) to conditionally load them.

```typescript
import dynamic from "next/dynamic";
import Test from "@/components/test";
import { MDXRemote, type MDXRemoteProps } from 'next-mdx-remote/rsc'

const SomeHeavyComponent = dynamic(() => import("../component/SomeHeavyComponent"));

const defaultComponents = { Test };

export function CustomMDX(props: MDXRemoteProps) {
  const componentNames = [
    /<SomeHeavyComponent/.test(props.source as string) ? "SomeHeavyComponent" : "",
  ].filter(Boolean);

  const components = {
    ...defaultComponents,
    SomeHeavyComponent: componentNames.includes("SomeHeavyComponent")
      ? SomeHeavyComponent
      : () => null,
  };

  return <MDXRemote {...props} components={components} />;
}
```
