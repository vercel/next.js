# A statically generated blog example using Next.js and Ghost

This example showcases Next.js's [Static Generation](https://nextjs.org/docs/basic-features/pages) feature using [Ghost](https://ghost.org/) as the data source.

> This boilerplate demonstrates simple usage and best practices. If you are looking for a more feature rich Next.js generator for Ghost including the Casper theme,
> check out [next-cms-ghost](https://github.com/styxlab/next-cms-ghost).

## Deploy your own

Once you have access to [the environment variables you'll need](#step-2-set-up-environment-variables), deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/git?c=1&s=https://github.com/vercel/next.js/tree/canary/examples/cms-ghost&env=ghost_BUCKET_SLUG,ghost_READ_KEY,ghost_PREVIEW_SECRET&envDescription=Required%20to%20connect%20the%20app%20with%20ghost&envLink=https://vercel.link/cms-ghost-env)

### Related examples

- [WordPress](/examples/cms-wordpress)
- [DatoCMS](/examples/cms-datocms)
- [Sanity](/examples/cms-sanity)
- [TakeShape](/examples/cms-takeshape)
- [Prismic](/examples/cms-prismic)
- [Contentful](/examples/cms-contentful)
- [Strapi](/examples/cms-strapi)
- [Agility CMS](/examples/cms-agilitycms)
- [ButterCMS](/examples/cms-buttercms)
- [Storyblok](/examples/cms-storyblok)
- [GraphCMS](/examples/cms-graphcms)
- [Kontent](/examples/cms-kontent)
- [Blog Starter](/examples/blog-starter)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example cms-ghost cms-ghost-app
# or
yarn create next-app --example cms-ghost cms-ghost-app
```

### Setp 1. Run Next.js in development mode

To get started, no configuration is needed as this example sources the content from a demo Ghost CMS.

```bash
npm install
npm run dev

# or

yarn install
yarn dev
```

Your blog should be up and running on [http://localhost:3000](http://localhost:3000)! If it doesn't work, post on [GitHub discussions](https://github.com/vercel/next.js/discussions).

### Step 2. Set up environment variables

If you already have a Ghost CMS running, you should create new Content API keys in the Ghost Admin panel under Integrations -> Add custom integration.
Once your keys are generated, copy them into the environment variables as follows. Your `.env.local` file should look like this:

```bash
GHOST_API_URL=...
GHOST_API_KEY=...
```

Make sure to use the Content API Key.

### Step 3. Set up Headless Ghost CMS

If you do not have access to a Ghost CMS, you need to create one for your own content. The demo Ghost CMS is running on Hetzner Cloud, which is described in [Ghost CMS on Hetzner Cloud](https://www.jamify.org/2020/04/07/ghost-cms-on-hetzner-cloud/). Note that a Ghost install on localhost is not sufficient for public deploys, as the images on your local computer are not accessible from outside.

### Step 4. Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

#### Deploy Your Local Project

To deploy your local project to Vercel, push it to GitHub/GitLab/Bitbucket and [import to Vercel](https://vercel.com/import/git?utm_source=github&utm_medium=readme&utm_campaign=next-example).

**Important**: When you import your project on Vercel, make sure to click on **Environment Variables** and set them to match your `.env.local` file.

#### Deploy from Our Template

Alternatively, you can deploy using our template by clicking on the Deploy button below.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/git?c=1&s=https://github.com/vercel/next.js/tree/canary/examples/cms-ghost&env=GHOST_API_URL,GHOST_API_KEY&envDescription=Required%20to%20connect%20the%20app%20with%20ghost&envLink=https://vercel.link/cms-ghost-env)
