# A statically generated blog example using Next.js and Sanity

This example showcases Next.js's [Static Generation](https://nextjs.org/docs/basic-features/pages) feature using [Sanity](https://www.sanity.io/) as the data source.

## Demo

### [https://next-blog-sanity.vercel.app/](https://next-blog-sanity.vercel.app/)

## Deploy your own

Once you have access to [the environment variables you'll need](#step-4-set-up-environment-variables), deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/cms-sanity&project-name=cms-sanity&repository-name=cms-sanity&env=NEXT_PUBLIC_SANITY_PROJECT_ID,SANITY_API_TOKEN,SANITY_PREVIEW_SECRET&envDescription=Required%20to%20connect%20the%20app%20with%20Sanity&envLink=https://vercel.link/cms-sanity-env)

### Related examples

- [WordPress](/examples/cms-wordpress)
- [DatoCMS](/examples/cms-datocms)
- [TakeShape](/examples/cms-takeshape)
- [Prismic](/examples/cms-prismic)
- [Contentful](/examples/cms-contentful)
- [Strapi](/examples/cms-strapi)
- [Agility CMS](/examples/cms-agilitycms)
- [Cosmic](/examples/cms-cosmic)
- [ButterCMS](/examples/cms-buttercms)
- [Storyblok](/examples/cms-storyblok)
- [GraphCMS](/examples/cms-graphcms)
- [Kontent](/examples/cms-kontent)
- [Ghost](/examples/cms-ghost)
- [Blog Starter](/examples/blog-starter)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example cms-sanity cms-sanity-app
# or
yarn create next-app --example cms-sanity cms-sanity-app
```

## Configuration

### Step 1. Create an account and a project on Sanity

First, [create an account on Sanity](https://sanity.io).

After creating an account, install the Sanity cli from npm `npm i -g @sanity/cli`.

### Step 2. Create a new Sanity project

In a separate folder run `sanity init` to initialize a new studio project.

This will be where we manage our data.

When going through the init phase make sure to select **Yes** to the **Use the default dataset configuration** step and select **Clean project with no predefined schemas** for the **Select project template** step.

### Step 3. Generate an API token

Log into https://manage.sanity.io/ and choose the project you just created. Then from **Settings**, select **API**, then click **Add New Token** and create a token with the **Read** permission.

### Step 4. Set up environment variables

Copy the `.env.local.example` file in this directory to `.env.local` (which will be ignored by Git):

```bash
cp .env.local.example .env.local
```

Then set each variable on `.env.local`:

- `NEXT_PUBLIC_SANITY_PROJECT_ID` should be the `projectId` value from the `sanity.json` file created in step 2.
- `NEXT_PUBLIC_SANITY_DATASET` should be the `dataset` value from the `sanity.json` file created in step 2 - defaults to `production` if not set.
- `SANITY_API_TOKEN` should be the API token generated in the previous step.
- `SANITY_PREVIEW_SECRET` can be any random string (but avoid spaces), like `MY_SECRET` - this is used for [Preview Mode](https://nextjs.org/docs/advanced-features/preview-mode).

Your `.env.local` file should look like this:

```bash
NEXT_PUBLIC_SANITY_PROJECT_ID=...
NEXT_PUBLIC_SANITY_DATASET=...
SANITY_API_TOKEN=...
SANITY_PREVIEW_SECRET=...
```

### Step 5. Prepare project for previewing

Go to https://www.sanity.io/docs/preview-content-on-site and follow the three steps on that page. It should be done inside the studio project generated in Step 2.

When you get to the second step about creating a file called `resolveProductionUrl.js`, copy the following instead:

```js
const previewSecret = 'MY_SECRET' // Copy the string you used for SANITY_PREVIEW_SECRET
const projectUrl = 'http://localhost:3000'

export default function resolveProductionUrl(document) {
  return `${projectUrl}/api/preview?secret=${previewSecret}&slug=${document.slug.current}`
}
```

### Step 6. Copy the schema file

After initializing your Sanity studio project there should be a `schemas` folder.

Replace the contents of `schema.js` in the Sanity studio project directory with [`./schemas/schema.js`](./schemas/schema.js) in this example directory. This will set up the schema we’ll use this for this example.

### Step 7. Populate Content

To add some content go to your Sanity studio project directory and run `sanity start`.

After the project has started and you have navigated to the URL given in the terminal, select **Author** and create a new record.

- You just need **1 Author record**.
- Use dummy data for the text.
- For the image, you can download one from [Unsplash](https://unsplash.com/).

Next, select **Post** and create a new record.

- We recommend creating at least **2 Post records**.
- Use dummy data for the text.
- You can write markdown for the **Content** field.
- For the images, you can download ones from [Unsplash](https://unsplash.com/).
- Pick the **Author** you created earlier.

**Important:** For each post record, you need to click **Publish** after saving. If not, the post will be in the draft state.

### Step 8. Run Next.js in development mode

```bash
npm install
npm run dev

# or

yarn install
yarn dev
```

Your blog should be up and running on [http://localhost:3000](http://localhost:3000)! If it doesn't work, post on [GitHub discussions](https://github.com/vercel/next.js/discussions).

### Step 9. Try preview mode

On Sanity, go to one of the posts you've created and:

- **Update the title**. For example, you can add `[Draft]` in front of the title.
- As you edit the document it will be saved as a draft, but **DO NOT** click **Publish**. By doing this, the post will be in the draft state.

Now, if you go to the post page on localhost, you won't see the updated title. However, if you use the **Preview Mode**, you'll be able to see the change ([Documentation](https://nextjs.org/docs/advanced-features/preview-mode)).

To view the preview, go to the post edit page on Sanity, click the three dots above the document and select **Open preview** ([see the instruction here](https://www.sanity.io/docs/preview-content-on-site))

You should now be able to see the updated title. To exit Preview Mode, you can click on _"Click here to exit preview mode"_ at the top.

### Step 10. Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

#### Deploy Your Local Project

To deploy your local project to Vercel, push it to GitHub/GitLab/Bitbucket and [import to Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example).

**Important**: When you import your project on Vercel, make sure to click on **Environment Variables** and set them to match your `.env.local` file.

#### Deploy from Our Template

Alternatively, you can deploy using our template by clicking on the Deploy button below.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/cms-sanity&project-name=cms-sanity&repository-name=cms-sanity&env=NEXT_PUBLIC_SANITY_PROJECT_ID,SANITY_API_TOKEN,SANITY_PREVIEW_SECRET&envDescription=Required%20to%20connect%20the%20app%20with%20Sanity&envLink=https://vercel.link/cms-sanity-env)
