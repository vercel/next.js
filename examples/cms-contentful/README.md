# A statically generated blog example using Next.js and Contentful

This example showcases Next.js's [Static Generation](/docs/basic-features/pages.md) feature using [Contentful](https://www.contentful.com/) as the data source.

## Demo

### [https://next-blog-contentful.now.sh/](https://next-blog-contentful.now.sh/)

### Related examples

- [Blog Starter](/examples/blog-starter)
- [DatoCMS](/examples/cms-datocms)
- [TakeShape](/examples/cms-takeshape)
- [Sanity](/examples/cms-sanity)

## How to use

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example cms-contentful cms-contentful-app
# or
yarn create next-app --example cms-contentful cms-contentful-app
```

## Configuration

### Step 1. Create an account and a space on Contentful

First, [create an account on Contentful](https://www.contentful.com/sign-up/).

After creating an account, create a new **space** from the [dashboard](https://app.contentful.com/) and assign to it any name of your liking.

### Step 2. Create an `author` content type

From your contentful space, go to **Content model** and add a new content type:

- **Api Identifier** should be `author`

Once the content model is saved, let's add these fields (you don't have to modify the settings unless specified):

- `name` - **Text** field. **Field ID** should be set to `name`
- `picture` - **Media** field. **Field ID** should be set to `picture`

Save the content type and continue.

### Step 3. Create a `post` type

From your contentful space, go to **Content model** and add a new content type:

- **Api Identifier** should be `post`

Next, add these fields (you don't have to modify the settings unless specified):

- `title` - **Text** field
- `content` - **Rich text** field
- `excerpt` - **Text** field. Enable **Long text, full-text search**
- `coverImage` - **Media** field
- `date` - **Date and time** field
- `slug` - **Text** field. You can optionally go to the settings of this field, and under **Appearance**, select **Slug** to display it as a slug of the `title` field.
- `author` - **Reference** field

Save the content type and continue.

### Step 4. Populate Content

Go to the **Content** page in your space, then click on **Add entry** and select the **author** content type:

- You just need **1 author entry**.
- Use dummy data for the text.
- For the image, you can download one from [Unsplash](https://unsplash.com/).

Next, add a new entry to **post**:

- We recommend creating at least **2 post entries**.
- Use dummy data for the text.
- You can write markdown for the **content** field.
- For images, you can download them from [Unsplash](https://unsplash.com/).
- Pick the **author** you created earlier.

**Important:** For each entry, you need to click on **Publish**. If not, the entry will be in draft state.

### Step 5. Set up environment variables

From your contentful space, go to **Settings > API keys**. There should be an example Content delivery / preview token - you can use this API key. (You may also create a new key.)

Next, copy the `.env.example` file in this directory to `.env` (which will be ignored by Git):

```bash
cp .env.example .env
```

Then set each variable on `.env`:

- `NEXT_EXAMPLE_CMS_CONTENTFUL_SPACE_ID` should be the **Space ID** field of your API Key
- `NEXT_EXAMPLE_CMS_CONTENTFUL_ACCESS_TOKEN` should be the **Content Delivery API - access token** field of your API key
- `NEXT_EXAMPLE_CMS_CONTENTFUL_PREVIEW_ACCESS_TOKEN` should be the **Content Preview API - access token** field of your API key
- `NEXT_EXAMPLE_CMS_CONTENTFUL_PREVIEW_SECRET` should be any value you want. It must be URL friendly as the dashboard will send it as a query parameter to enable preview mode

Your `.env` file should look like this:

```bash
NEXT_EXAMPLE_CMS_CONTENTFUL_SPACE_ID=...
NEXT_EXAMPLE_CMS_CONTENTFUL_ACCESS_TOKEN=...
NEXT_EXAMPLE_CMS_CONTENTFUL_PREVIEW_ACCESS_TOKEN=...
NEXT_EXAMPLE_CMS_CONTENTFUL_PREVIEW_SECRET=...
```

### Step 6. Run Next.js in development mode

```bash
npm install
npm run dev

# or

yarn install
yarn dev
```

Your blog should be up and running on [http://localhost:3000](http://localhost:3000)! If it doesn't work, post on [GitHub discussions](https://github.com/zeit/next.js/discussions).

### Step 7. Try preview mode

On your contentful space, go to **Settings > Content preview**, then add a new content preview for development.

The **Name** field may be anything, like `Development`. Then, under **Content preview URLs**, check **post** and set its value to:

```
http://localhost:3000/api/preview?secret=<NEXT_EXAMPLE_CMS_CONTENTFUL_PREVIEW_SECRET>&slug={entry.fields.slug}
```

Replace `<NEXT_EXAMPLE_CMS_CONTENTFUL_PREVIEW_SECRET>` with its respective value in `.env`.

Once saved, go to one of the posts you've created and:

- **Update the title**. For example, you can add `[Draft]` in front of the title.
- The state of the post will switch to **CHANGED** automatically. **Do not** publish it. By doing this, the post will be in draft state.
- In the sidebar, you should see the **Open preview** button. Click on it!

You should now be able to see the updated title. To exit preview mode, you can click on **Click here to exit preview mode** at the top of the page.

### Step 8. Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

To deploy on Vercel, you need to set the environment variables with **Now Secrets** using [Vercel CLI](https://vercel.com/download) ([Documentation](https://vercel.com/docs/now-cli#commands/secrets)).

Install [Vercel CLI](https://vercel.com/download), log in to your account from the CLI, and run the following commands to add the environment variables. Replace each variable with the corresponding strings in `.env`:

```bash
now secrets add next_example_contentful_space_id <NEXT_EXAMPLE_CMS_CONTENTFUL_SPACE_ID>
now secrets add next_example_cms_contentful_access_token <NEXT_EXAMPLE_CMS_CONTENTFUL_ACCESS_TOKEN>
now secrets add next_example_cms_contentful_preview_access_token <NEXT_EXAMPLE_CMS_CONTENTFUL_PREVIEW_ACCESS_TOKEN>
now secrets add next_example_cms_contentful_preview_secret <NEXT_EXAMPLE_CMS_CONTENTFUL_PREVIEW_SECRET>
```

Then push the project to GitHub/GitLab/Bitbucket and [import to Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) to deploy.
