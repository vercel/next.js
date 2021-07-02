# A statically generated blog example using Next.js and Notion

This example showcases Next.js's [Static Generation](https://nextjs.org/docs/basic-features/pages) feature using [Notion](https://www.notion.so/) as the data source.

** Disclaimer: ** Notion can't be considered a CMS, as it's missing many more advanced features, typical CMS are offering. For more full featured CMS look at the [related examples](#related-examples).

In the meantime, if you love Notion and want a basic integration and syncronasiation of Notion content to your blog feel free to gice a try. 🏅

## Demo

### [https://next-blog-prismic.vercel.app/](https://next-blog-prismic.vercel.app/)

## Deploy your own

Once you have access to [the environment variables you'll need](#step-5-set-up-environment-variables), deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-notion&project-name=with-notion&repository-name=with-notion&env=NOTION_API_TOKEN,NOTION_DATABASE_ID&envDescription=Required%20to%20connect%20the%20app%20with%20Prismic&envLink=https://vercel.link/with-prismic-env)

### Related examples

- [WordPress](/examples/cms-wordpress)
- [DatoCMS](/examples/cms-datocms)
- [Sanity](/examples/cms-sanity)
- [TakeShape](/examples/cms-takeshape)
- [Contentful](/examples/cms-contentful)
- [Strapi](/examples/cms-strapi)
- [Agility CMS](/examples/cms-agilitycms)
- [Cosmic](/examples/cms-cosmic)
- [ButterCMS](/examples/cms-buttercms)
- [Storyblok](/examples/cms-storyblok)
- [Kontent](/examples/cms-kontent)
- [Ghost](/examples/cms-ghost)
- [Blog Starter](/examples/blog-starter)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-notion notion-app
# or
yarn create next-app --example with-notion notion-app
```

## Configuration

### Step 1. Create an account and a repository on Prismic

First, [create an account on Notion](https://notion.io/).

After creating an account, create a new \*page** and then a database as **full page table\*\* from the left panel.

### Step 2. Create database columns

These columns will be used as blog post meta information, in order to be able to access the posts information from Notion.

For the full page table database, create the new **column**:

- Create a column with the name `Slug`, and the type `Text`

- Create a column with the name `Category`, and the type `Multi-select`

  - Then create a new `Category` select option with the name `home`

- Create a column with the name `Author`, and the type `Person`

- Create a column with the name `Date`, and the type `Text`

### Step 3. Create a Blog Post

The rows will be used as your collection of blog posts.

To create a new blog post populate the row with the information for each of the columns previously added.

- Add a `Name` e.g. Learn How to Pre-render Pages Using Static Generation with Next.js
- Add a `Slug` e.g. learn-how-to-pre-render-pages-using-static-generation
- Select a `Category` named `home`
- Select an `Author` from the list
- Add a `Date` e.g. June 6, 2021

### Step 4. Populate Blog Post Content

Open the the blog post page previously added, there is an **Open** button when you hover over the **Name** column

- Use dummy data for the text.
- For the image, you can set one by clicking on `Add Cover` button that appears when you hover over above the page name. You can change the image by clicking on `Change Cover` button when hover over the image set.

Next, select **Post** and create a new document.

- We recommend creating at least **2 Post documents**.
- Use dummy data for the text.

### Step 5. Set up environment variables

Follow the instructions in [this post](https://developers.notion.com/docs/getting-started) to generate a new API Token, and find the Database ID needed for the integration.

Next, copy the `.env.local.example` file in this directory to `.env.local` (which will be ignored by Git):

```bash
cp .env.local.example .env.local
```

Then set each variable on `.env.local`:

- `NOTION_API_TOKEN` should be the **Permanent access token** you just created
- `NOTION_DATABASE_ID` is the id of your repository (the one in the URL)

Your `.env.local` file should look like this:

```bash
NOTION_API_TOKEN=...
NOTION_DATABASE_ID=...
```

### Step 6. Run Next.js in development mode

```bash
npm install
npm run dev

# or

yarn install
yarn dev
```

Your blog should be up and running on [http://localhost:3000](http://localhost:3000)! If it doesn't work, post on [GitHub discussions](https://github.com/vercel/next.js/discussions).

### Step 7. Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

#### Deploy Your Local Project

To deploy your local project to Vercel, push it to GitHub/GitLab/Bitbucket and [import to Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example).

**Important**: When you import your project on Vercel, make sure to click on **Environment Variables** and set them to match your `.env.local` file.
