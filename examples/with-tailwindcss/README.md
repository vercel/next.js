# Tailwind CSS example

This example is a basic starting point for using [Tailwind CSS](https://tailwindcss.com) with Next.js.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-tailwindcss&project-name=with-tailwindcss&repository-name=with-tailwindcss)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-tailwindcss with-tailwindcss-app
# or
yarn create next-app --example with-tailwindcss with-tailwindcss-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

## Notes

This example includes the following [PostCSS](https://github.com/postcss/postcss) plugins:

- [tailwindcss](https://tailwindcss.com) - utility-first CSS framework
- [autoprefixer](https://github.com/postcss/autoprefixer) - plugin to parse CSS and add vendor prefixes to CSS rules using values from [Can I Use](https://caniuse.com).

To control the generated stylesheet's filesize, this example uses Tailwind CSS' [`purge` option](https://tailwindcss.com/docs/controlling-file-size/#removing-unused-css) to remove unused CSS.
