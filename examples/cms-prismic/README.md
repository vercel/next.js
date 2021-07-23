# A statically generated blog example using Next.js and Prismic

This example showcases Next.js's [Static Generation](https://nextjs.org/docs/basic-features/pages) feature using [Prismic](https://prismic.io/) as the data source.

## Demo

### [https://next-blog-prismic.vercel.app/](https://next-blog-prismic.vercel.app/)

## Deploy your own

Once you have access to [the environment variables you'll need](#step-5-set-up-environment-variables), deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/cms-prismic&project-name=cms-prismic&repository-name=cms-prismic&env=PRISMIC_API_TOKEN,PRISMIC_REPOSITORY_NAME&envDescription=Required%20to%20connect%20the%20app%20with%20Prismic&envLink=https://vercel.link/cms-prismic-env)

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
npx create-next-app --example cms-prismic cms-prismic-app
# or
yarn create next-app --example cms-prismic cms-prismic-app
```

## Configuration

### Step 1. Create an account and a repository on Prismic

First, [create an account on Prismic](https://prismic.io/).

After creating an account, create a **repository** from the [dashboard](https://prismic.io/dashboard/) and assign to it any name of your liking.

### Step 2. Create an `author` type

From the repository page, create a new **custom type**:

- The name should be `author`.

Next, add these fields (you don't have to modify the settings):

- `name` - **Key Text** field
- `picture` - **Image** field

Alternatively, you can copy the JSON in [`types/author.json`](types/author.json), then click on **JSON editor** and paste it there.

Save the type and continue.

### Step 3. Create a `post` type

From the repository page, create a new **custom type**:

- The name should be `post`.

Next, add these fields (you don't have to modify the settings unless specified):

- `title` - **Title** field
- `content` - **Rich Text** field
- `excerpt` - **Key Text** field
- `coverimage` - **Image** field
- `date` - **Date** field
- `author` - **Content relationship** field, you may also add `author` to the **Constraint to custom type** option to only accept documents from the `author` type.
- `slug` - **UID** field.

Alternatively, you can copy the JSON in [`types/post.json`](types/post.json), then click on **JSON editor** and paste it there.

Save the type and continue.

### Step 4. Populate Content

Go to the **Content** page, it's in the menu at the top left, then click on **Create new** and select the **author** type:

- You just need **1 author document**.
- Use dummy data for the text.
- For the image, you can download one from [Unsplash](https://unsplash.com/).

Next, select **Post** and create a new document.

- We recommend creating at least **2 Post documents**.
- Use dummy data for the text.
- You can write markdown for the **content** field.
- For images, you can download them from [Unsplash](https://unsplash.com/).
- Pick the **author** you created earlier.

**Important:** For each document, you need to click **Publish** after saving. If not, the document will be in the draft state.

### Step 5. Set up environment variables

Follow the instructions in [this post](https://intercom.help/prismicio/en/articles/1036153-generating-an-access-token) to generate a new access token.

Next, copy the `.env.local.example` file in this directory to `.env.local` (which will be ignored by Git):

```bash
cp .env.local.example .env.local
```

Then set each variable on `.env.local`:

- `PRISMIC_API_TOKEN` should be the **Permanent access token** you just created
- `PRISMIC_REPOSITORY_NAME` is the name of your repository (the one in the URL)
- `PRISMIC_REPOSITORY_LOCALE` is the locale of your repository. Defaults to `en-us`

Your `.env.local` file should look like this:

```bash
PRISMIC_API_TOKEN=...
PRISMIC_REPOSITORY_NAME=...
PRISMIC_REPOSITORY_LOCALE=...
```

Make sure the locale matches your settings in the Prismic dashboard.

### Step 6. Run Next.js in development mode

```bash
npm install
npm run dev

# or

yarn install
yarn dev
```

Your blog should be up and running on [http://localhost:3000](http://localhost:3000)! If it doesn't work, post on [GitHub discussions](https://github.com/vercel/next.js/discussions).

### Step 7. Try preview mode

On your repository page, go to **Settings**, click on **Previews** and then **Create a New Preview** for development, fill the form like so:

- **Site Name**: may be anything, like `development`
- **Domain of Your Application**: `http://localhost:3000`
- **Link Resolver**: `/api/preview`

Once saved, go to one of the posts you've created and:

- **Update the title**. For example, you can add `[Draft]` in front of the title.
- Click **Save**, but **DO NOT** click **Publish**. By doing this, the post will be in draft state.
- Right next to the **Publish** button you should see the **Preview** button, displayed with an eye icon. Click on it!

You should now be able to see the updated title. To exit preview mode, you can click on **Click here to exit preview mode** at the top of the page.

### Step 8. Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

#### Deploy Your Local Project

To deploy your local project to Vercel, push it to GitHub/GitLab/Bitbucket and [import to Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example).

**Important**: When you import your project on Vercel, make sure to click on **Environment Variables** and set them to match your `.env.local` file.

#### Deploy from Our Template

Alternatively, you can deploy using our template by clicking on the Deploy button below.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/cms-prismic&project-name=cms-prismic&repository-name=cms-prismic&env=PRISMIC_API_TOKEN,PRISMIC_REPOSITORY_NAME&envDescription=Required%20to%20connect%20the%20app%20with%20Prismic&envLink=https://vercel.link/cms-prismic-env)
