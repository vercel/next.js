# Example app using Netlify CMS

[Netlify CMS](https://www.netlifycms.org/) is an open source content management system for your Git workflow that enables you to provide editors with a friendly UI and intuitive workflows. You can use it with any static site generator to create faster, more flexible web projects. Content is stored in your Git repository alongside your code for easier versioning, multi-channel publishing, and the option to handle content updates directly in Git.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-netlify-cms)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-netlify-cms)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-netlify-cms with-netlify-cms-app
```

```bash
yarn create next-app --example with-netlify-cms with-netlify-cms-app
```

```bash
pnpm create next-app --example with-netlify-cms with-netlify-cms-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

## How it works

Sites take its content from markdown files in `/content`. Two of pages (`home` and `about`) are referencing directly their respective markdown files.

Blog component loads all posts (during build!) and lists them out [How to load multiple md files](https://medium.com/@shawnstern/importing-multiple-markdown-files-into-a-react-component-with-webpack-7548559fce6f)

Updated to take advantange of the new `getStaticPaths` and `getStaticProps` data-fetching functions.
