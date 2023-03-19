# Using multiple zones

With Next.js you can use multiple apps as a single app using its [multi-zones feature](https://nextjs.org/docs/advanced-features/multi-zones). This is an example showing how to use it.

- All pages should be unique across zones. For example, the `home` app should not have a `pages/blog/index.js` page.
- The `home` app is the main app and therefore it includes the rewrites that map to the `blog` app in [next.config.js](home/next.config.js)
- The `blog` app sets [`basePath`](https://nextjs.org/docs/api-reference/next.config.js/basepath) to `/blog` so that generated pages, Next.js assets and public assets are within the `/blog` subfolder.

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-zones with-zones-app
```

```bash
yarn create next-app --example with-zones with-zones-app
```

```bash
pnpm create next-app --example with-zones with-zones-app
```

With multi zones you have multiple Next.js apps over a single app, therefore every app has its own dependencies and it runs independently.

To start the `/home` run the following commands from the root directory:

```bash
cd home
npm install && npm run dev
# or
cd home
yarn && yarn dev
```

The `/home` app should be up and running in [http://localhost:3000](http://localhost:3000)!

Starting the `/blog` app follows a very similar process. In a new terminal, run the following commands from the root directory :

```bash
cd blog
npm install && npm run dev
# or
cd blog
yarn && yarn dev
```

The `blog` app should be up and running in [http://localhost:4000](http://localhost:4000)!

## Preview

Preview the example live on [StackBlitz](http://stackblitz.com/):

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-zones)

### Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

#### Deploy Your Local Project

To deploy the apps to Vercel, we'll use [monorepos support](https://vercel.com/blog/monorepos) to create a new project for each app.

To get started, push the example to GitHub/GitLab/Bitbucket and [import your repo to Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example). We're not interested in the root directory, so make sure to select the `blog` directory (do not start with `home`):

![Import flow for blog app](docs/import-blog.jpg)

Click continue and finish the import process. After that's done copy the domain URL that was assigned to your project, paste it on `home/.env`, and push the change to your repo:

```bash
# Replace this URL with the URL of your blog app
BLOG_URL="https://with-zones-blog.vercel.app"
```

Now we'll go over the [import flow](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) again using the same repo but this time select the `home` directory instead:

![Import flow for home app](docs/import-home.jpg)

With the `home` app deployed you should now be able to see both apps running under the same domain!

Any future commits to the repo will trigger a deployment to the connected Vercel projects. See the [blog post about monorepos](https://vercel.com/blog/monorepos) to learn more.
