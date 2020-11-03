# Internationalized Routing with react-i18next

This example shows how to create internationalized pages using Next.js and the i18n routing feature, and how to translate their content with react-i18next.

For further documentation on this feature see the documentation of the i18n-routing feature [here](https://nextjs.org/docs/advanced-features/i18n-routing)

You can find the documentation for react-18next [here](https://react.i18next.com/)

## Deploy your own

Deploy the example using [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/vercel/next.js/tree/canary/examples/i18n-routing-with-i18next)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example i18n-routing-with-i18next i18next-app
# or
yarn create next-app --example i18n-routing-with-i18next i18next-app
```

## How to extract translations

Run the `extract` script with npm or Yarn to scan the project for translatable strings and add them to `/locales/{lang}.json`.
After the extraction is done, you can edit the files to do the actual translation.

```bash
npm run extract
# or
yarn extract
```

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
