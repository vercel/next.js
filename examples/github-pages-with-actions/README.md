# Deploying Next.js Application to GitHub Pages with GitHub Actions

This example supports deploying a statically exported Next.js application to GitHub Pages eliminating the need to run a script for deployment after making changes. It also omits the need for a separate branch.

The Actions workflow is a modified version of [Next.js starters-workflow](https://github.com/actions/starter-workflows/blob/main/pages/nextjs.yml). It automatically injects basePath in your Next.js configuration file.

It has added support for the following package managers:

- npm
- yarn
- pnpm

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example github-pages-with-actions github-pages-with-actions-app
```

```bash
yarn create next-app --example github-pages-with-actions github-pages-with-actions-app
```

```bash
pnpm create next-app --example github-pages-with-actions github-pages-with-actions-app
```

### Deploy to GitHub Pages

1.  Create a new public GitHub repository.
2.  Push the starter code to the `main` branch.
3.  On GitHub, go to **Settings** > **Pages** > **Build and Deployment**, and choose `GitHub Actions` as the Source.
4.  Make a change.

The workflow will be triggered each time you make any changes and your site will be deployed to the URL:

```bash
https://<github-user-name>.github.io/<github-project-name>/
```
