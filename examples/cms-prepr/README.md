# A statically generated blog example using Next.js and Prepr

This example showcases Next.js's [Static Generation](https://nextjs.org/docs/basic-features/pages) feature using [Prepr](https://prepr.io/) as the data source.

## Demo

- **Live**: [https://next-blog-prepr.now.sh/](https://next-blog-prepr.now.sh/)
- **Preview Mode**: [https://next-blog-prepr.now.sh/api/preview...](https://next-blog-prepr.now.sh/api/preview?secret=237864ihasdhj283768&slug=discover-enjoy-amsterdam)

### [https://next-blog-prepr.now.sh/](https://next-blog-prepr.now.sh/)

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
- [GraphCMS](/examples/cms-graphcms)
- [Blog Starter](/examples/blog-starter)

## Getting Started

Once you have access to [the environment variables you'll need](#step-3-set-up-environment-variables), deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/cms-prepr&project-name=cms-prepr&repository-name=cms-prepr&env=PREPRIO_API,PREPRIO_PRODUCTION_TOKEN,PREPRIO_PREVIEW_TOKEN,PREPRIO_PREVIEW_KEY&envDescription=Required%20to%20connect%20the%20app%20with%20Prepr&envLink=https://vercel.link/cms-prepr-env)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example cms-prepr cms-prepr-app
# or
yarn create next-app --example cms-prepr cms-prepr-app
```

## Configuration

### Step 1. Create an account and a environment in Prepr

First, [create an account in Prepr](https://prepr.io).

### Step 2. Create Author model

From your Prepr dashboard, click **Settings** -> **Models**

Click on the arrow next to **Add model** and select **Import**.

Import the [`models/author.json`](models/author.json) file.

After that

Import the [`models/post.json`](models/post.json) file.

Click on the Author field and select `Author` at the option `Publication model` and click **Save**.

### Step 3. Set up environment variables

Copy the `.env.local.example` file in this directory to `.env.local` (which will be ignored by Git):

```bash
cp .env.local.example .env.local
```

Inside your environment, navigate to **Settings > Development > Access Tokens**.

Click **Add access token**, enter the name `Next.js Preview` and add the scope `graphql_preview` and click **Save**.

Copy the generated access token and set the variable `PREPRIO_PREVIEW_TOKEN` in `.env.local`.

Go back to the Access token overview and click **Add access token**.

Enter the name `Next.js Production` and add the scope `graphql_published` and click **Save**.

Copy the generated access token and set the variable `PREPRIO_PRODUCTION_TOKEN` in `.env.local`.

The `PREPRIO_PREVIEW_KEY` can be any random string (but avoid spaces), like a UUID`, this is used
for [Preview Mode](https://nextjs.org/docs/advanced-features/preview-mode).

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

In Prepr, go to one of the posts in your environment and:

- **Update the title**. For example, you can add `[REVIEW]` in front of the title.
- After you edit the publication save the post with a review state.

To view the preview, transform the url to the following format: `http://localhost:3000/api/preview?secret=<YOUR_SECRET_TOKEN>&slug=<SLUG_TO_PREVIEW>` where `<YOUR_SECRET_TOKEN>` is
the same secret you defined in the `.env.local` file and `<SLUG_TO_PREVIEW>` is the slug of one of the posts you want to preview.

You should now be able to see post that are in Review and Done state. To exit the preview mode, you can click on _"Click here to exit preview mode"_ at the top.

### Step 6. Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

#### Deploy Your Local Project

To deploy your local project to Vercel, push it to GitHub/GitLab/Bitbucket and [import to Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example).

**Important**: When you import your project on Vercel, make sure to click on **Environment Variables** and set them to match your `.env.local` file.

#### Deploy from Our Template

Alternatively, you can deploy using our template by clicking on the Deploy button below.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/cms-prepr&project-name=cms-prepr&repository-name=cms-prepr&env=PREPRIO_API,PREPRIO_PRODUCTION_TOKEN,PREPRIO_PREVIEW_TOKEN,PREPRIO_PREVIEW_KEY&envDescription=Required%20to%20connect%20the%20app%20with%20Prepr&envLink=https://vercel.link/cms-prepr-env)
