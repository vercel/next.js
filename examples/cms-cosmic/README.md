# A statically generated blog example using Next.js and Cosmic

This example showcases Next.js's [Static Generation](https://nextjs.org/docs/basic-features/pages) feature using [Cosmic](https://cosmicjs.com/) as the data source.

## Demo

[https://next-blog-cosmic.now.sh/](https://next-blog-cosmic.now.sh/)

### Related examples

- [Blog Starter](/examples/blog-starter)
- [Sanity](/examples/cms-sanity)
- [TakeShape](/examples/cms-takeshape)
- [Prismic](/examples/cms-prismic)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example cms-cosmic cms-cosmic-app
# or
yarn create next-app --example cms-cosmic cms-cosmic-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/cms-cosmic
cd cms-cosmic
```

## Configuration

### Step 1. Create an account and a project on Cosmic

First, [create an account on Cosmic](https://cosmicjs.com).

After creating an account, create a **new bucket** from the dashboard. You can select a **Start from scratch**.

### Step 2. Create an `Author` Object Type

From the bucket dashboard, create a new **Object Type**.

- The name should be `Author`.

Next, add these metafields (you don't have to modify the settings):

- `Picture` - **Image/File** field

Next, untoggle **Content Editor Text Area** from Object Options

### Step 3. Create a `Post` Object Type

From the bucket dashboard, create a new **Object Type**:

- The name should be `Post`.

Next, add these metafields (you don't have to modify the settings unless specified):

- `Content` - **Markdown** field
- `Excerpt` - **Plain Text Area** field
- `Cover Image` - **Image/File** field
- `Author` - **Single Object Relation** field , and from the "Setting" popup toggle "Limit Search by Object Type", select **Authors**.

Next, untoggle **Content Editor Text Area** from Object Options

### Step 4. Populate Content

From the **Sidebar** menu, select **Authors** and create a new record.

- You just need **1 Author record**.
- Use dummy data for the Title.
- For the image, you can download one from [Unsplash](https://unsplash.com/).

Next, select **Posts** and create a new record.

- We recommend creating at least **2 Post records**.
- Use dummy data for the Title.
- You can write markdown for the **Content** field.
- For the images, you can download ones from [Unsplash](https://unsplash.com/).
- Pick the **Author** you created earlier.

**Important:** For each post record, you need to click **Publish** after saving. If not, the post will be in the draft state.

### Step 5. Set up environment variables

Go to the **Settings** menu at the sidebar and click **Basic Settings**.

Then copy the **Bucket slug** and **Read Key**.

Next, copy the `.env.example` file in this directory to `.env` (which will be ignored by Git):

```bash
cp .env.example .env
```

Then set each variable on `.env`:

- `NEXT_EXAMPLE_CMS_COSMIC_BUCKET_SLUG` should be the Bucket slug you just copied.
- `NEXT_EXAMPLE_CMS_COSMIC_READ_KEY` should be the Read Key you just copied.
- `NEXT_EXAMPLE_CMS_COSMIC_PREVIEW_SECRET` can be any random string (but avoid spaces), like `Read Key` - this is used for [the Preview Mode](https://nextjs.org/docs/advanced-features/preview-mode).

Your `.env` file should look like this:

```bash
NEXT_EXAMPLE_CMS_COSMIC_BUCKET_SLUG=...
NEXT_EXAMPLE_CMS_COSMIC_READ_KEY=...
NEXT_EXAMPLE_CMS_COSMIC_PREVIEW_SECRET=...
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

On Cosmic, go to one of the posts you've created and:

- **Update the title**. For example, you can add `[Draft]` in front of the title.
- Click **Save Draft**, but **DO NOT** click **Publish**. By doing this, the post will be in the draft state.

Now, if you go to the post page on localhost, you won't see the updated title. However, if you use the **Preview Mode**, you'll be able to see the change ([Documentation](https://nextjs.org/docs/advanced-features/preview-mode)).

To enable the Preview Mode, go to this URL:

```
http://localhost:3000/api/preview?secret=<secret>&slug=<slug>
```

- `<secret>` should be the string you entered for `NEXT_EXAMPLE_CMS_COSMIC_PREVIEW_SECRET`.
- `<slug>` should be the post's `slug` attribute (you can check on Cosmic).

You should now be able to see the updated title. To exit the preview mode, you can click **Click here to exit preview mode** at the top.

### Step 8. Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

To deploy on Vercel, you need to set the environment variables with **Now Secrets** using [Vercel CLI](https://vercel.com/download) ([Documentation](https://vercel.com/docs/now-cli#commands/secrets)).

Install [Vercel CLI](https://vercel.com/download), log in to your account from the CLI, and run the following commands to add the environment variables. Replace `<NEXT_EXAMPLE_CMS_COSMIC_BUCKET_SLUG>`, `<NEXT_EXAMPLE_CMS_COSMIC_READ_KEY>` and `<NEXT_EXAMPLE_CMS_COSMIC_PREVIEW_SECRET>` with the corresponding strings in `.env`.

```
vercel secrets add next_example_cms_cosmic_bucket_slug <NEXT_EXAMPLE_CMS_COSMIC_BUCKET_SLUG>
vercel secrets add next_example_cms_cosmic_read_key <NEXT_EXAMPLE_CMS_COSMIC_READ_KEY>
vercel secrets add next_example_cms_cosmic_preview_secret <NEXT_EXAMPLE_CMS_COSMIC_PREVIEW_SECRET>
```

Then push the project to GitHub/GitLab/Bitbucket and [import to Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) to deploy.
