# A statically generated blog example using Next.js and ButterCMS

This example showcases Next.js's [Static Generation](https://nextjs.org/docs/basic-features/pages) feature using [ButterCMS](https://buttercms.com/) as the data source.

## Demo

[https://next-blog-buttercms.vercel.app/](https://next-blog-buttercms.vercel.app/)

## Deploy your own

Once you have access to [the environment variables you'll need](#step-2-set-up-environment-variables), deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/cms-buttercms&project-name=cms-buttercms&repository-name=cms-buttercms&env=BUTTERCMS_API_KEY,BUTTERCMS_PREVIEW_SECRET&envDescription=Required%20to%20connect%20the%20app%20with%20ButterCMS&envLink=https://vercel.link/buttercms-env)

### Related examples

- [WordPress](/examples/cms-wordpress)
- [DatoCMS](/examples/cms-datocms)
- [Sanity](/examples/cms-sanity)
- [TakeShape](/examples/cms-takeshape)
- [Prismic](/examples/cms-prismic)
- [Contentful](/examples/cms-contentful)
- [Agility CMS](/examples/cms-agilitycms)
- [Cosmic](/examples/cms-cosmic)
- [Strapi](/examples/cms-strapi)
- [Storyblok](/examples/cms-storyblok)
- [GraphCMS](/examples/cms-graphcms)
- [Kontent](/examples/cms-kontent)
- [Ghost](/examples/cms-ghost)
- [Blog Starter](/examples/blog-starter)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example cms-buttercms cms-buttercms-app
# or
yarn create next-app --example cms-buttercms cms-buttercms-app
```

## Configuration

### Step 1. Create an account on ButterCMS

First, [create an account on ButterCMS](https://buttercms.com/).

After signing up, you’ll be presented with the API key. We’ll use this in the next step.

### Step 2. Set up environment variables

Copy the `.env.local.example` file in this directory to `.env.local` (which will be ignored by Git):

```bash
cp .env.local.example .env.local
```

Then set each variable on `.env.local`:

- `BUTTERCMS_API_KEY` should be set as the API key.
- `BUTTERCMS_PREVIEW_SECRET` can be any random string (but avoid spaces), like `MY_SECRET` - this is used for [Preview Mode](https://nextjs.org/docs/advanced-features/preview-mode).

### Step 3. Run Next.js in development mode

When you sign up to ButterCMS, it creates an example blog post automatically. You can run Next.js in development mode to view a blog containing this example post.

```bash
npm install
npm run dev

# or

yarn install
yarn dev
```

Your blog should be up and running on [http://localhost:3000](http://localhost:3000)! If it doesn't work, post on [GitHub discussions](https://github.com/vercel/next.js/discussions).

### Step 4. Try preview mode

To try preview mode, [create a blog post](https://buttercms.com/post/):

- Set the **Title** as `Draft Post Test`.
- Fill the content and summary with dummy text.
- Set the **Featured Image** by downloading some image from [Unsplash](https://unsplash.com/).

Most importantly, **do not publish** the blog post. Instead, click **Save Draft**.

Now, if you go to the post page on localhost, you won't see this post because it’s not published. However, if you use the **Preview Mode**, you'll be able to see the change ([Documentation](https://nextjs.org/docs/advanced-features/preview-mode)).

To enable the Preview Mode, go to this URL:

```
http://localhost:3000/api/preview?secret=<secret>&slug=draft-post-test
```

- `<secret>` should be the string you entered for `BUTTERCMS_PREVIEW_SECRET`.

You should now be able to see the draft post. To exit the preview mode, you can click **Click here to exit preview mode** at the top.

**Tip**: [You can set the preview URL on ButterCMS](https://buttercms.com/kb/preview-urls).

### Step 5. Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

#### Deploy Your Local Project

To deploy your local project to Vercel, push it to GitHub/GitLab/Bitbucket and [import to Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example).

**Important**: When you import your project on Vercel, make sure to click on **Environment Variables** and set them to match your `.env.local` file.

#### Deploy from Our Template

Alternatively, you can deploy using our template by clicking on the Deploy button below.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/cms-buttercms&project-name=cms-buttercms&repository-name=cms-buttercms&env=BUTTERCMS_API_KEY,BUTTERCMS_PREVIEW_SECRET&envDescription=Required%20to%20connect%20the%20app%20with%20ButterCMS&envLink=https://vercel.link/buttercms-env)
