# A fully-functional, drop-in proof-of-concept Next.js app using ButterCMS

This Next.js starter project fully integrates with dynamic sample content from your ButterCMS account, including main menu, pages, blog posts, categories, and tags, all with a beautiful, custom theme with already-implemented search functionality. All of the included sample content is automatically created in your account dashboard when you sign up for a free trial of ButterCMS.

A copy of this starter project can be easily and quickly deployed to Vercel with the click of a button.

This example showcases Next.js's [Static Generation](https://nextjs.org/docs/basic-features/pages) feature using [ButterCMS](https://buttercms.com/) as the data source.

## Demo

Check out our live demo: [https://nextjs-starter-buttercms.vercel.app/](https://nextjs-starter-buttercms.vercel.app/)

## Deploy your own

Once you have access to your Butter API token, you can deploy your Butterized proof-of-concept app to Vercel, the creators of Next.js, and spread your love of Butter. By clicking the button below, you'll create a copy of our starter project in your Git provider account, instantly deploy it, and institute a full content workflow connected to your ButterCMS account. Smooth.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FButterCMS%2Fnextjs-starter-buttercms&env=NEXT_PUBLIC_BUTTER_CMS_API_KEY&envDescription=Your%20ButterCMS%20API%20Token&envLink=https%3A%2F%2Fbuttercms.com%2Fsettings%2F&project-name=nextjs-starter-buttercms&repo-name=nextjs-starter-buttercms&redirect-url=https%3A%2F%2Fbuttercms.com%2Fonboarding%2Fvercel-starter-deploy-callback%2F&production-deploy-hook=Deploy%20Triggered%20from%20ButterCMS&demo-title=ButterCMS%20Next.js%20Starter&demo-description=Fully%20integrated%20with%20your%20ButterCMS%20account&demo-url=https%3A%2F%2Fnextjs-starter-buttercms.vercel.app%2F&demo-image=https://cdn.buttercms.com/r0tGK8xFRti2iRKBJ0eY&repository-name=nextjs-starter-buttercms)

### Related examples

- [AgilityCMS](/examples/cms-agilitycms)
- [Builder.io](/examples/cms-builder-io)
- [ButterCMS](/examples/cms-buttercms)
- [Contentful](/examples/cms-contentful)
- [Cosmic](/examples/cms-cosmic)
- [DatoCMS](/examples/cms-datocms)
- [DotCMS](/examples/cms-dotcms)
- [Drupal](/examples/cms-drupal)
- [Enterspeed](/examples/cms-enterspeed)
- [Ghost](/examples/cms-ghost)
- [GraphCMS](/examples/cms-graphcms)
- [Kontent.ai](/examples/cms-kontent-ai)
- [MakeSwift](/examples/cms-makeswift)
- [Payload](/examples/cms-payload)
- [Plasmic](/examples/cms-plasmic)
- [Prepr](/examples/cms-prepr)
- [Prismic](/examples/cms-prismic)
- [Sanity](/examples/cms-sanity)
- [Sitecore XM Cloud](/examples/cms-sitecore-xmcloud)
- [Sitefinity](/examples/cms-sitefinity)
- [Storyblok](/examples/cms-storyblok)
- [TakeShape](/examples/cms-takeshape)
- [Tina](/examples/cms-tina)
- [Umbraco](/examples/cms-umbraco)
- [Umbraco heartcore](/examples/cms-umbraco-heartcore)
- [Webiny](/examples/cms-webiny)
- [WordPress](/examples/cms-wordpress)
- [Blog Starter](/examples/blog-starter)

## How to use

### Option 1. Install via Github and NPM or Yarn

First, install the dependencies by cloning the repo and running one of the following commands, depending on your current setup:

```bash
git clone https://github.com/ButterCMS/nextjs-starter-buttercms.git
cd nextjs-starter-buttercms
npm install # or yarn install
```

### Option 2. Install via Create-Next-App

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example cms-buttercms cms-buttercms-app
```

```bash
yarn create next-app --example cms-buttercms cms-buttercms-app
```

```bash
pnpm create next-app --example cms-buttercms cms-buttercms-app
```

## Configuration

### Step 1. Create an account on ButterCMS

First, [create an account on ButterCMS](https://buttercms.com/).

After signing up, you’ll be presented with your free API token. We’ll use this in the next step.

### Step 2. Set up environment variables

Copy the `.env.local.example` file in this directory to `.env.local` (which will be ignored by Git):

```bash
cp .env.local.example .env.local
```

Then set each variable on `.env.local`:

- `NEXT_PUBLIC_BUTTER_CMS_API_KEY` should be set as the API key.

### Step 3. Run Next.js in development mode

When you sign up for ButterCMS, it creates all of the example content used by this starter project. You can run Next.js in development mode to view your fully-functional starter project, including landing page with
API-based components, API-based menu, and a blog.

```bash
npm install
npm run dev

# or

yarn install
yarn dev
```

Your starter project should be up and running on [http://localhost:3000](http://localhost:3000)! If it doesn't work, post on [GitHub discussions](https://github.com/vercel/next.js/discussions).

### Step 4. Try preview mode

Your starter project is automatically configured to show draft changes saved in your Butter account when run locally or deploy to a hosting provider. To disable this behavior, set the following value in your `.env.local` file: `PREVIEW=false`.

To try preview mode, [create a blog post](https://buttercms.com/post/):

- Set the **Title** as `Draft Post Test`.
- Fill the content and summary with dummy text.

Most importantly, **do not publish** the blog post. Instead, click **Save Draft**.

If you have not already, set `PREVIEW=false` in your `.env.local` file and restart your local
development server.

Now, if you go to the your blog list view page on localhost: [http://localhost:3000/#blog](http://localhost:3000/#blog), you won't see this post, as its status has not yet been updated to `published`. However, if you use **Preview Mode** by deleting `PREVIEW=false` from your `.env.local` file, your new post will appear ([Documentation](https://nextjs.org/docs/advanced-features/preview-mode)).

**Tip**: [You can set a preview URL on ButterCMS](https://buttercms.com/kb/preview-urls) for pages
deployed to Vercel, allowing you to live-preview changes on the web from within your Butter account! Sweet!

### Step 5. Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

#### Deploy from our template

If you want to deploy a copy of our starter to Vercel without any changes, you can just click this button:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FButterCMS%2Fnextjs-starter-buttercms&env=NEXT_PUBLIC_BUTTER_CMS_API_KEY&envDescription=Your%20ButterCMS%20API%20Token&envLink=https%3A%2F%2Fbuttercms.com%2Fsettings%2F&project-name=nextjs-starter-buttercms&repo-name=nextjs-starter-buttercms&redirect-url=https%3A%2F%2Fbuttercms.com%2Fonboarding%2Fvercel-starter-deploy-callback%2F&production-deploy-hook=Deploy%20Triggered%20from%20ButterCMS&demo-title=ButterCMS%20Next.js%20Starter&demo-description=Fully%20integrated%20with%20your%20ButterCMS%20account&demo-url=https%3A%2F%2Fnextjs-starter-buttercms.vercel.app%2F&demo-image=https://cdn.buttercms.com/r0tGK8xFRti2iRKBJ0eY&repository-name=nextjs-starter-buttercms)

#### Deploy your local project

To deploy your local project to Vercel (one in which you've made changes), push it to GitHub/GitLab/Bitbucket and [import to Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example).

**Important**: When you import your project on Vercel, make sure to click on **Environment Variables** and set them to match your `.env.local` file.
