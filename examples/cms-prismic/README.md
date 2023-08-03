# A statically generated blog example using Next.js and Prismic

This example showcases Next.js's [Static Generation](https://nextjs.org/docs/basic-features/pages) feature using [Prismic](https://prismic.io/) as the data source.

## Demo

### [https://next-blog-prismic.vercel.app/](https://next-blog-prismic.vercel.app/)

## Deploy your own

Once you have access to [the environment variables you'll need](#step-5-set-up-environment-variables), deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/cms-prismic&project-name=cms-prismic&repository-name=cms-prismic&env=PRISMIC_API_TOKEN,PRISMIC_REPOSITORY_NAME&envDescription=Required%20to%20connect%20the%20app%20with%20Prismic&envLink=https://vercel.link/cms-prismic-env)

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
- [Kontent](/examples/cms-kontent-ai)
- [Prepr](/examples/cms-prepr)
- [Prismic](/examples/cms-prismic)
- [Sanity](/examples/cms-sanity)
- [Sitefinity](/examples/cms-sitefinity)
- [Storyblok](/examples/cms-storyblok)
- [TakeShape](/examples/cms-takeshape)
- [Umbraco heartcore](/examples/cms-umbraco-heartcore)
- [Webiny](/examples/cms-webiny)
- [Blog Starter](/examples/blog-starter)
- [WordPress](/examples/cms-wordpress)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example cms-prismic cms-prismic-app
```

```bash
yarn create next-app --example cms-prismic cms-prismic-app
```

```bash
pnpm create next-app --example cms-prismic cms-prismic-app
```

## Configuration

### Step 1. Create an account and repository on Prismic

First, create a Prismic account and repository with the following command:

```sh
npx @slicemachine/init
```

This command will:

1. Ask you to log in to Prismic or create an account.
2. Create a new Prismic repository with premade Author and Post content models.
3. Connect the Prismic repository to your app.

**Optional**: To see the premade content models, start the [Slice Machine](https://prismic.io/docs/technologies/slice-machine) app.

```sh
npm run slicemachine
```

Slice Machine should be available on <http://localhost:9999> once started.

### Step 2. Populate Content

Go to the [Prismic dashboard](https://prismic.io/dashboard) and select your Prismic repository.

Once in, click on **Create new** and select the **Author** type:

- You just need **1 author document**.
- Use dummy data for the text.
- For the image, you can download one from [Unsplash](https://unsplash.com/).

Save and publish the document.

Next, go back to the documents list, click on **Create new** and select the **Post** type:

- We recommend creating at least **2 Post documents**.
- Use dummy data for the text.
- You can use the Text and Image Slices to create content.
- For images, you can download them from [Unsplash](https://unsplash.com/).
- Pick the **author** you created earlier.

**Important:** For each document, you need to click **Publish** after saving. If not, the document will be in the draft state.

### Step 3. Run Next.js in development mode

```bash
npm run dev

# or

yarn dev
```

Your blog should be up and running on [http://localhost:3000](http://localhost:3000)! If it doesn't work, post on [GitHub discussions](https://github.com/vercel/next.js/discussions).

### Step 4. Try preview mode

On your repository page, go to **Settings**, click on **Previews**, and then **Create a New Preview**. Fill the form like so for development previews:

- **Site Name**: may be anything, like "Development"
- **Domain of Your Application**: `http://localhost:3000`
- **Link Resolver**: `/api/preview`

Once saved, go to one of the posts you created and:

- **Update the title**. For example, you can add `[Draft]` in front of the title.
- Click **Save**, but **DO NOT** click **Publish**. By doing this, the post will be in draft state.
- Right next to the **Publish** button, you should see the **Preview** button, displayed with an eye icon. Click on it!

You should now be able to see the updated title. To exit preview mode, click on the "x" icon in the purple Prismic toolbar in the bottom left corner of the page.

### Step 5. Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

#### Deploy Your Local Project

To deploy your local project to Vercel, push it to GitHub/GitLab/Bitbucket and [import to Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example).

#### Deploy from Our Template

Alternatively, you can deploy using our template by clicking on the Deploy button below.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/cms-prismic&project-name=cms-prismic)
