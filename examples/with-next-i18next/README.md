# next-i18next example

This example shows how to internationalize a Next.js App Router application with [next-i18next](https://github.com/i18next/next-i18next) — the Next.js integration of [i18next](https://www.i18next.com) and [react-i18next](https://react.i18next.com). Since v16, next-i18next supports both the App Router (Server Components, Client Components, and proxy-based locale routing — shown in this example) and the Pages Router approach.

The example demonstrates:

- Locale-prefixed routing (`/en`, `/de`) and language detection (cookie → `Accept-Language` → fallback), handled by `proxy.ts`
- Translations in Server Components via `getT` — including translated metadata in `generateMetadata`
- Translations in Client Components via `useT`, including i18next pluralization
- The `Trans` component for translations with inline markup
- A language switcher that swaps the locale segment while keeping the current page
- `generateStaticParams` wiring for the `[lng]` segment via `generateI18nStaticParams`
- Serverless-safe translation loading (`resourceLoader` with bundler-traceable dynamic imports), so the example works on Vercel out of the box

next-i18next also supports cookie-based language selection without locale prefixes (no-locale-path mode), hiding the default locale prefix, the Pages Router, and mixed App Router + Pages Router setups — see the [next-i18next README](https://github.com/i18next/next-i18next) for those variants.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-next-i18next&project-name=with-next-i18next&repository-name=with-next-i18next)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-next-i18next with-next-i18next-app
```

```bash
yarn create next-app --example with-next-i18next with-next-i18next-app
```

```bash
pnpm create next-app --example with-next-i18next with-next-i18next-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
