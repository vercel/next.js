# A statically generated blog example using Next.js and GraphCMS

This example showcases Next.js's [Static Generation](https://nextjs.org/docs/basic-features/pages) feature using [GraphCMS](https://www.graphcms.com/) as the data source.

## Demo

- **Live**: [https://next-blog-graphcms.vercel.app/](https://next-blog-graphcms.vercel.app/)
- **Preview Mode**: [https://next-blog-graphcms.vercel.app/api/preview...](https://next-blog-graphcms.vercel.app/api/preview?secret=PHHsT9YmZjHxjxuzt8Jie2XkieME&slug=technical-seo-with-graphcms)

### [https://next-blog-graphcms.vercel.app/](https://next-blog-graphcms.vercel.app/)

### Related examples

- [WordPress](/examples/cms-wordpress)
- [DatoCMS](/examples/cms-datocms)
- [Sanity](/examples/cms-sanity)
- [TakeShape](/examples/cms-takeshape)
- [Prismic](/examples/cms-prismic)
- [Contentful](/examples/cms-contentful)
- [Strapi](/examples/cms-strapi)
- [Agility CMS](/examples/cms-agilitycms)
- [Cosmic](/examples/cms-cosmic)
- [ButterCMS](/examples/cms-buttercms)
- [Storyblok](/examples/cms-storyblok)
- [Kontent](/examples/cms-kontent)
- [Ghost](/examples/cms-ghost)
- [Umbraco Heartcore](/examples/cms-umbraco-heartcore)
- [Blog Starter](/examples/blog-starter)
- [Builder.io](/examples/cms-builder-io)

## Deploy your own

Once you have access to [the environment variables you'll need](#step-3-set-up-environment-variables), deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/cms-graphcms&project-name=cms-graphcms&repository-name=cms-graphcms&env=GRAPHCMS_PROJECT_API,GRAPHCMS_PROD_AUTH_TOKEN,GRAPHCMS_DEV_AUTH_TOKEN,GRAPHCMS_PREVIEW_SECRET&envDescription=Required%20to%20connect%20the%20app%20with%20GraphCMS&envLink=https://vercel.link/cms-graphcms-env)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example cms-graphcms cms-graphcms-app
```

```bash
yarn create next-app --example cms-graphcms cms-graphcms-app
```

```bash
pnpm create next-app --example cms-graphcms cms-graphcms-app
```

## Configuration

### Step 1. Create an account and a project in GraphCMS

First, [create an account in GraphCMS](https://app.graphcms.com).

### Step 2. Create a new GraphCMS project

After creating an account, create a new project from the **Blog Starter template** - be sure to include the example content.

### Step 3. Set up environment variables

Copy the `.env.local.example` file in this directory to `.env.local` (which will be ignored by Git):

```bash
cp .env.local.example .env.local
```

Inside your project dashboard, navigate to **Settings > API Access page**.

Then set each variable in `.env.local`:

- `GRAPHCMS_PROJECT_API`: Set it to the API endpoint under **Endpoints**, at the top of the page.
- `GRAPHCMS_PROD_AUTH_TOKEN`: Copy the `NEXT_EXAMPLE_CMS_GCMS_PROD_AUTH_TOKEN` token under **Existing tokens**, at the bottom of the page. This will only query content that is published.
- `GRAPHCMS_DEV_AUTH_TOKEN`: Copy the `NEXT_EXAMPLE_CMS_GCMS_DEV_AUTH_TOKEN` token under **Existing tokens**, at the bottom of the page. This will only query content that is in draft.
- `GRAPHCMS_PREVIEW_SECRET` can be any random string (but avoid spaces), like `MY_SECRET` - this is used for [Preview Mode](https://nextjs.org/docs/advanced-features/preview-mode).

### Step 4. Run Next.js in development mode

```bash
npm install
npm run dev

# or

yarn install
yarn dev
```

Your blog should be up and running on [http://localhost:3000](http://localhost:3000)! If it doesn't work, post on [GitHub discussions](https://github.com/vercel/next.js/discussions).

### Step 5. Try preview mode

In GraphCMS, go to one of the posts in your project and:

- **Update the title**. For example, you can add `[Draft]` in front of the title.
- After you edit the document save the article as a draft, but **DO NOT** click **Publish**. By doing this, the post will be in the draft stage.

Now, if you go to the post page on localhost, you won't see the updated title. However, if you use **Preview Mode**, you'll be able to see the change ([Documentation](/docs/advanced-features/preview-mode.md)).

To view the preview, transform the url to the following format: `http://localhost:3000/api/preview?secret=<YOUR_SECRET_TOKEN>&slug=<SLUG_TO_PREVIEW>` where `<YOUR_SECRET_TOKEN>` is the same secret you defined in the `.env.local` file and `<SLUG_TO_PREVIEW>` is the slug of one of the posts you want to preview.

You should now be able to see the updated title. To exit the preview mode, you can click on _"Click here to exit preview mode"_ at the top.

### Step 6. Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

#### Deploy Your Local Project

To deploy your local project to Vercel, push it to GitHub/GitLab/Bitbucket and [import to Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example).

**Important**: When you import your project on Vercel, make sure to click on **Environment Variables** and set them to match your `.env.local` file.

#### Deploy from Our Template

Alternatively, you can deploy using our template by clicking on the Deploy button below.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/cms-graphcms&project-name=cms-graphcms&repository-name=cms-graphcms&env=GRAPHCMS_PROJECT_API,GRAPHCMS_PROD_AUTH_TOKEN,GRAPHCMS_DEV_AUTH_TOKEN,GRAPHCMS_PREVIEW_SECRET&envDescription=Required%20to%20connect%20the%20app%20with%20GraphCMS&envLink=https://vercel.link/cms-graphcms-env)
