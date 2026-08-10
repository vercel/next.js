# React 19 + Zod + useActionState

A minimal Next.js example showing typed field errors, server-side
validation, and framework-safe redirects using
[`zod-form-action`](https://www.npmjs.com/package/zod-form-action).

## Preview

Preview the example live on [StackBlitz](http://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-zod-form-action):

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](http://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-zod-form-action)

## Deploy your own

Deploy the example using [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-zod-form-action)

## How to use

Execute [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app) with npm, Yarn, or pnpm to bootstrap the example:

```bash
npx create-next-app --example with-zod-form-action with-zod-form-action-app
```

```bash
yarn create next-app --example with-zod-form-action with-zod-form-action-app
```

```bash
pnpm create next-app --example with-zod-form-action with-zod-form-action-app
```

## What this demonstrates

- React 19 `useActionState`
- Next.js Server Actions
- Zod schema validation with typed field-level errors
- Form-level (cross-field) validation errors
- Consistent server-side error handling
- Safe handling of Next.js `redirect()` inside a validated action
- React 19 pending state