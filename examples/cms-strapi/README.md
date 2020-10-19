# A statically generated blog example using Next.js and Strapi

This example showcases Next.js's [Static Generation](https://nextjs.org/docs/basic-features/pages) feature using [Strapi](https://strapi.io/) as the data source.

## Demo

[https://next-blog-strapi.now.sh/](https://next-blog-strapi.now.sh/)

## Deploy your own

Once you have access to [the environment variables you'll need](#step-7-set-up-environment-variables), deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/git?c=1&s=https://github.com/vercel/next.js/tree/canary/examples/cms-strapi&env=STRAPI_PREVIEW_SECRET,NEXT_PUBLIC_STRAPI_API_URL&envDescription=Required%20to%20connect%20the%20app%20with%20Strapi&envLink=https://vercel.link/cms-strapi-env)

### Related examples

- [WordPress](/examples/cms-wordpress)
- [DatoCMS](/examples/cms-datocms)
- [Sanity](/examples/cms-sanity)
- [TakeShape](/examples/cms-takeshape)
- [Prismic](/examples/cms-prismic)
- [Contentful](/examples/cms-contentful)
- [Agility CMS](/examples/cms-agilitycms)
- [Cosmic](/examples/cms-cosmic)
- [ButterCMS](/examples/cms-buttercms)
- [Storyblok](/examples/cms-storyblok)
- [GraphCMS](/examples/cms-graphcms)
- [Kontent](/examples/cms-kontent)
- [Blog Starter](/examples/blog-starter)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example cms-strapi cms-strapi-app
# or
yarn create next-app --example cms-strapi cms-strapi-app
```

## Configuration

### Step 1. Set up Strapi locally

[Follow the instructions on this page](https://strapi.io/documentation/v3.x/installation/cli.html) to create a Strapi project locally.

```bash
npx create-strapi-app my-project --quickstart
npm run develop # or: yarn develop
```

This will open http://localhost:1337/ and prompt you to create an admin user.

### Step 2. Install GraphQL for Strapi

Inside the Strapi directory, stop the server, [install GraphQL](https://strapi.io/documentation/v3.x/plugins/graphql.html), and restart the server:

```bash
# If using Yarn: yarn strapi install graphql
npm run strapi install graphql

npm run develop # or: yarn develop
```

### Step 3. Create an `Author` collection

From **Content-Types Builder**, **create a new collection type**.

- The display name should be `Author`.

Next, add these fields (you don't have to modify the settings):

- **Text** field called **`name`** (**Short text**)
- **Media** field called **`picture`** (**Single media**)

Then click **Save**.

### Step 4. Create a `Post` collection

From **Content-Types Builder**, **create a new collection type**.

- The display name should be `Post`.

Next, add these fields (you don't have to modify the settings unless specified):

- **Text** field called **`title`** (**Short text**)
- **Rich Text** field called **`content`** (**Multiple-paragraph Text**)
- **Text** field called **`excerpt`** (**Long text**)
- **Media** field called **`coverImage`** (**Single media**)
- **Date** field called **`date`** (type should be **date**)
- **UID** field called **`slug`** (attached field should be **title**)
- **Relation** field called **`author`** (Post **has one** Author)
- **Enumeration** field `status` (the values should be **published** and **draft**)

### Step 5. Set permissions

From **Settings, Users & Permissions, Roles**, edit the **Public** role.

Then select: `count`, `find`, and `findone` permissions for both **Author** and **Post**. Click **Save**.

### Step 6. Populate Content

Select **Author** and click **Add New Author**.

- You just need **1 Author entry**.
- Use dummy data for the name.
- For the image, you can download one from [Unsplash](https://unsplash.com/).

Next, select **Posts** and click **Add New Post**.

- We recommend creating at least **2 Post records**.
- Use dummy data for the text.
- You can write markdown for the **content** field.
- For the images, you can download ones from [Unsplash](https://unsplash.com/).
- Pick the **Author** you created earlier.
- Set the **status** field to be **published**.

### Step 7. Set up environment variables

While the Strapi server is running, open a new terminal and `cd` into the Next.js app directory you created earlier.

```
cd cms-strapi-app
```

Copy the `.env.local.example` file in this directory to `.env.local` (which will be ignored by Git):

```bash
cp .env.local.example .env.local
```

Then set each variable on `.env.local`:

- `STRAPI_PREVIEW_SECRET` can be any random string (but avoid spaces), like `MY_SECRET` - this is used for [Preview Mode](https://nextjs.org/docs/advanced-features/preview-mode).
- `NEXT_PUBLIC_STRAPI_API_URL` should be set as `http://localhost:1337` (no trailing slash).

### Step 8. Run Next.js in development mode

Make sure that the local Strapi server is still running at http://localhost:1337. Inside the Next.js app directory, run:

```bash
npm install
npm run dev

# or

yarn install
yarn dev
```

Your blog should be up and running on [http://localhost:3000](http://localhost:3000)! You should see the two posts you’ve created. If it doesn't work, make sure that:

- You’ve installed GraphQL to Strapi on Step 2.
- You’ve set the Roles & Permissions in Step 5.
- You’ve set the `status` of each post to be `published` in Step 6.

The best place to debug is inside the `fetchAPI` function in `lib/api.js`. If you still need help, you can post on [GitHub discussions](https://github.com/vercel/next.js/discussions).

### Step 9. Try preview mode

To try preview mode, create another post like before, but:

- Set the **title** as `Draft Post Test`
- Set the **status** as `draft`.

Now, if you go to the post page on localhost, you won't see this post because it’s not published. However, if you use the **Preview Mode**, you'll be able to see the change ([Documentation](https://nextjs.org/docs/advanced-features/preview-mode)).

To enable the Preview Mode, go to this URL:

```
http://localhost:3000/api/preview?secret=<secret>&slug=draft-post-test
```

- `<secret>` should be the string you entered for `STRAPI_PREVIEW_SECRET`.
- `<slug>` should be the post's `slug` attribute.

You should now be able to see the draft post. To exit the preview mode, you can click **Click here to exit preview mode** at the top.

### Step 10. Deploy Strapi

To deploy to production, you must first deploy your Strapi app. The Strapi app for our demo at https://next-blog-strapi.now.sh/ is deployed to Heroku ([here’s the documentation](https://strapi.io/documentation/v3.x/deployment/heroku.html)) and uses Cloudinary for image hosting ([see this file](https://github.com/strapi/strapi-starter-next-blog/blob/master/backend/extensions/upload/config/settings.js)).

### Step 11. Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

#### Deploy Your Local Project

To deploy your local project to Vercel, push it to GitHub/GitLab/Bitbucket and [import to Vercel](https://vercel.com/import/git?utm_source=github&utm_medium=readme&utm_campaign=next-example).

**Important**: When you import your project on Vercel, make sure to click on **Environment Variables** and set them to match your `.env.local` file.

#### Deploy from Our Template

Alternatively, you can deploy using our template by clicking on the Deploy button below.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/git?c=1&s=https://github.com/vercel/next.js/tree/canary/examples/cms-strapi&env=STRAPI_PREVIEW_SECRET,NEXT_PUBLIC_STRAPI_API_URL&envDescription=Required%20to%20connect%20the%20app%20with%20Strapi&envLink=https://vercel.link/cms-strapi-env)
