# A statically generated blog example using Next.js and TakeShape

This example showcases Next.js's [Static Generation](https://nextjs.org/docs/basic-features/pages) feature using [TakeShape](https://www.takeshape.io/) as the data source.

## Demo

### [https://next-blog-takeshape.now.sh/](https://next-blog-takeshape.now.sh/)

### Related examples

- [WordPress](/examples/cms-wordpress)
- [DatoCMS](/examples/cms-datocms)
- [Sanity](/examples/cms-sanity)
- [Prismic](/examples/cms-prismic)
- [Contentful](/examples/cms-contentful)
- [Strapi](/examples/cms-strapi)
- [Agility CMS](/examples/cms-agilitycms)
- [Cosmic](/examples/cms-cosmic)
- [Blog Starter](/examples/blog-starter)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example cms-takeshape cms-takeshape-app
# or
yarn create next-app --example cms-takeshape cms-takeshape-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/vercel/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/cms-takeshape
cd cms-takeshape
```

## Configuration

### Step 1. Create an account and a project on TakeShape

First, [create an account on TakeShape](https://www.takeshape.io/).

After creating an account, create a **new project** from the dashboard. You can select a **Blank Project**.

### Step 2. Create an `Author` model

From the project settings page, create a new **content type**.

- The title should be `Author`.

Next, drag these widgets:

- **Single Line** widget: Set the title as **Name**.
- **Asset** widget: Set the title as **Picture**.

When you’re done, click "Create Content Type".

### Step 3. Create a `Post` model

Click **Add Content Type** again.

- The title should be `Post`.

Next, add these fields (you don't have to modify the settings unless specified):

- **Single Line** widget: Set the title as **Title**.
- **Markdown** widget: Set the title as **Content**.
- **Single Line** widget: Set the title as **Excerpt**.
- **Asset** widget: Set the title as **Cover Image**.
- **Date** widget: Set the title as **Date**.
- **Single Line** widget: Set the title as **Slug**.
- **Relationship** widget: Set the title as **Author**, then set **Relationship Type** to `Single` and check the `Author` checkbox under **Allowed Content Types**.

When you’re done, click "Create Content Type".

### Step 4. Populate Content

Select **Author** and create a new record.

- You just need **1 Author record**.
- Use dummy data for the text.
- For the image, you can download one from [Unsplash](https://unsplash.com/).

When you’re done, make sure to click **Enabled** under **Workflow Status**.

Next, select **Post** and create a new record.

- We recommend creating at least **2 Post records**.
- Use dummy data for the text.
- You can write markdown for the **Content** field.
- For the images, you can download ones from [Unsplash](https://unsplash.com/).
- Pick the **Author** you created earlier.

When you’re done, make sure to click **Enabled** under **Workflow Status**.

### Step 5. Set up environment variables

From the dropdown next to the project name, click **API Keys**.

Create a new API Key with the **Read** permission.

Next, copy the `.env.example` file in this directory to `.env` (which will be ignored by Git):

```bash
cp .env.example .env
```

Then set each variable on `.env`:

- `NEXT_EXAMPLE_CMS_TAKESHAPE_API_KEY` should be the API token you just copied.
- `NEXT_EXAMPLE_CMS_TAKESHAPE_PROJECT_ID` should be the project ID, which is a substring in the project page URL: `https://app.takeshape.io/projects/<project-id>/...`
- `NEXT_EXAMPLE_CMS_TAKESHAPE_PREVIEW_SECRET` can be any random string (but avoid spaces), like `MY_SECRET` - this is used for [the Preview Mode](https://nextjs.org/docs/advanced-features/preview-mode).

Your `.env` file should look like this:

```bash
NEXT_EXAMPLE_CMS_TAKESHAPE_PROJECT_ID=...
NEXT_EXAMPLE_CMS_TAKESHAPE_API_KEY=...
NEXT_EXAMPLE_CMS_TAKESHAPE_PREVIEW_SECRET=...
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

### Step 7. Try preview mode

On TakeShape, create a new post like before. But **DO NOT** click **Enabled** under **Workflow Status**.

Now, if you go to `http://localhost:3000/posts/<slug>` (replace `<slug>`), you won’t see the post. However, if you use the **Preview Mode**, you'll be able to see the change ([Documentation](/docs/advanced-features/preview-mode.md)).

To enable the Preview Mode, go to this URL:

```
http://localhost:3000/api/preview?secret=<secret>&slug=<slug>
```

- `<secret>` should be the string you entered for `NEXT_EXAMPLE_CMS_TAKESHAPE_PREVIEW_SECRET`.
- `<slug>` should be the post's `slug` attribute (you can check on TakeShape).

You should now be able to see this post. To exit the preview mode, you can click **Click here to exit preview mode** at the top.

### Step 8. Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

To deploy on Vercel, you need to set the environment variables with **Now Secrets** using [Vercel CLI](https://vercel.com/download) ([Documentation](https://vercel.com/docs/now-cli#commands/secrets)).

Install [Vercel CLI](https://vercel.com/download), log in to your account from the CLI, and run the following commands to add the environment variables. Replace `<NEXT_EXAMPLE_CMS_TAKESHAPE_API_KEY>` and `<NEXT_EXAMPLE_CMS_TAKESHAPE_PREVIEW_SECRET>` with the corresponding strings in `.env`.

```
now secrets add next_example_cms_takeshape_api_key <NEXT_EXAMPLE_CMS_TAKESHAPE_API_KEY>
now secrets add next_example_cms_takeshape_project_id <NEXT_EXAMPLE_CMS_TAKESHAPE_PROJECT_ID>
now secrets add next_example_cms_takeshape_preview_secret <NEXT_EXAMPLE_CMS_TAKESHAPE_PREVIEW_SECRET>
```

Then push the project to GitHub/GitLab/Bitbucket and [import to Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) to deploy.
