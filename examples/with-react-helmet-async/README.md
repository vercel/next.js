# react-helmet-async example

This an minimalistic example of how to combine next.js and [react-helmet-async](https://github.com/staylor/react-helmet-async).

## Preview

Preview the example live on [StackBlitz](http://stackblitz.com/):

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-react-helmet-async)

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-react-helmet-async&project-name=with-react-helmet-async&repository-name=with-react-helmet-async)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-react-helmet with-react-helmet-app
# or
yarn create next-app --example with-react-helmet with-react-helmet-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

## Notes

When attempting to access the development server for the first time (without specifying `(helmetContext.helmet || helmetContext.helmet) &&` before `helmetContext.helmet.xxx.toComponent()` in `pages/_document.js`) you may receive an error like the following:

```
TypeError: Cannot read properties of undefined (reading 'helmet')
```

This is currently a known issue. In the meantime, you can specify some specific code before calling `helmetContext.helmet.xxx.toComponent()` in `pages/_document.js`, like:

```jsx
const { helmetContext } = this.props
const htmlAttributes =
  (helmetContext.helmet || helmetContext.helmet) &&
  helmetContext.helmet.htmlAttributes.toComponent()
const bodyAttributes =
  (helmetContext.helmet || helmetContext.helmet) &&
  helmetContext.helmet.bodyAttributes.toComponent()
return (
  <Html {...htmlAttributes}>
    <Head>
      {(helmetContext.helmet || helmetContext.helmet) &&
        helmetContext.helmet.title.toComponent()}
      {(helmetContext.helmet || helmetContext.helmet) &&
        helmetContext.helmet.meta.toComponent()}
      {(helmetContext.helmet || helmetContext.helmet) &&
        helmetContext.helmet.link.toComponent()}
    </Head>
    <body {...bodyAttributes}>
      <Main />
      <NextScript />
    </body>
  </Html>
)
```
