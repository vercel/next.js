# Styled-JSX with Content Security Policy

This example showcases how you can use `nonce` for `style-src` directive in `Content Security Policy` with `styled-jsx`.

Checkout the [demo](https://styled-jsx-with-csp.vercel.app/) and notice the following,

- `style-src` directive in `Content-Security-Policy` response header.
- `meta` tag to pass on the `nonce` to styled-jsx for client-side rendering.
- `style` tags with `nonce` attributes.

## Preview

Preview the example live on [StackBlitz](http://stackblitz.com/):

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/styled-jsx-with-csp)

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/styled-jsx-with-csp&project-name=styled-jsx-with-csp&repository-name=styled-jsx-with-csp)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example styled-jsx-with-csp styled-jsx-with-csp-app
# or
yarn create next-app --example styled-jsx-with-csp styled-jsx-with-csp-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
