# A statically generated blog example using Next.js and Storyblok

This example showcases Next.js's [Static Generation](https://nextjs.org/docs/basic-features/pages) feature using [Storyblok](https://www.storyblok.com/) as the data source.

## Demo

[https://next-blog-storyblok.vercel.app/](https://next-blog-storyblok.vercel.app/)

## Deploy your own

Once you have access to [the environment variables you'll need](#step-6-set-up-environment-variables), deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/cms-storyblok&project-name=cms-storyblok&repository-name=cms-storyblok&env=STORYBLOK_PREVIEW_SECRET,STORYBLOK_API_KEY&envDescription=Required%20to%20connect%20the%20app%20with%20Storyblok&envLink=https://vercel.link/cms-storyblok-env)

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
npx create-next-app --example cms-storyblok cms-storyblok-app
```

```bash
yarn create next-app --example cms-storyblok cms-storyblok-app
```

```bash
pnpm create next-app --example cms-storyblok cms-storyblok-app
```

## Configuration

### Step 1. Create an account on Storyblok

[Create an account on Storyblok](https://app.storyblok.com/).

When signing up, select **Create a new space**. Its name can be anything.

### Step 2. Create the `Authors` folder

From the dashboard, create a new folder called `Authors`.

- For **Default content type**, select **Add new**.
- Name of content type should be `author`.
- Choose **Blank** as the content type blueprint.

### Step 3. Create an `author` entry

In the `Authors` folder, create a new entry.

- **Name** can be anything, such as `Test Author`.

After creating the entry, click **Define schema**.

- Add a key called `picture`. Then click `picture` and set the **Type** as **Asset** and select **Images**.

Then upload an image to `picture`. You can use an [image from Unsplash](https://unsplash.com/).

Finally, after uploading, click **Publish**.

### Step 4. Create the `Posts` folder

After publishing the author, go back to the dashboard by clicking **Content** on the sidebar.

This time, create a new folder called `Posts`.

- For **Default content type**, select **Add new**.
- Name of content type should be `post`.
- Choose **Post** as the content type blueprint.

### Step 5. Create a `post` entry

In the `Posts` folder, create a new entry.

- **Name** can be anything.

Now, populate each field.

- **Title** can be any text.
- **Image** can be an [image from Unsplash](https://unsplash.com/).
- **Intro** can be any text.
- **Long Text** can be any text.
- **Author** should be the author created earlier.

Finally, click **Publish**.

You can create more posts under the `Posts` folder. Make sure to publish each one.

### Step 6. Set up environment variables

Go to the **Settings** menu for your space, and click **API-Keys**.

Then copy the **preview** token on the page.

Next, copy the `.env.local.example` file in this directory to `.env.local` (which will be ignored by Git):

```bash
cp .env.local.example .env.local
```

Then set each variable on `.env.local`:

- `STORYBLOK_API_KEY` should be the API key you just copied.
- `STORYBLOK_PREVIEW_SECRET` can be any random string (but avoid spaces), like `MY_SECRET` - this is used for [the Preview Mode](https://nextjs.org/docs/advanced-features/preview-mode).

### Step 7. Run Next.js in development mode

```bash
npm install
npm run dev

# or

yarn install
yarn dev
```

Your blog should be up and running on [http://localhost:3000](http://localhost:3000)! If it doesn't work, you can post on [GitHub discussions](https://github.com/vercel/next.js/discussions).

### Step 8. Try preview mode

To try preview mode, create another post like before (you can try duplicating), but **do not publish it - just save it**:

Now, if you go to the post page on localhost, you won't see this post because it’s not published. However, if you use the **Preview Mode**, you'll be able to see the change ([Documentation](https://nextjs.org/docs/advanced-features/preview-mode)).

To enable the Preview Mode, go to this URL:

```
http://localhost:3000/api/preview?secret=<secret>&slug=<slug>
```

- `<secret>` should be the string you entered for `STORYBLOK_PREVIEW_SECRET`.
- `<slug>` should be the post's `slug` (which can be seen on the **Config** section).

You should now be able to see the draft post. To exit the preview mode, you can click **Click here to exit preview mode** at the top.

### Step 9. Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

#### Deploy Your Local Project

To deploy your local project to Vercel, push it to GitHub/GitLab/Bitbucket and [import to Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example).

**Important**: When you import your project on Vercel, make sure to click on **Environment Variables** and set them to match your `.env.local` file.

#### Deploy from Our Template

Alternatively, you can deploy using our template by clicking on the Deploy button below.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/cms-storyblok&project-name=cms-storyblok&repository-name=cms-storyblok&env=STORYBLOK_PREVIEW_SECRET,STORYBLOK_API_KEY&envDescription=Required%20to%20connect%20the%20app%20with%20Storyblok&envLink=https://vercel.link/cms-storyblok-env)
