# A statically generated blog example using Next.js and DatoCMS

This example showcases Next.js's [Static Generation](https://nextjs.org/docs/basic-features/pages) feature using [DatoCMS](https://www.datocms.com/) as the data source.

## Demo

[https://next-blog-datocms.now.sh/](https://next-blog-datocms.now.sh/)

### Related examples

- [Blog Starter](/examples/blog-starter)
- [Sanity](/examples/cms-sanity)
- [TakeShape](/examples/cms-takeshape)
- [Prismic](/examples/cms-prismic)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example cms-datocms cms-datocms-app
# or
yarn create next-app --example cms-datocms cms-datocms-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/cms-datocms
cd cms-datocms
```

## Configuration

### Step 1. Create an account and a project on DatoCMS

First, [create an account on DatoCMS](https://datocms.com).

After creating an account, create a **new project** from the dashboard. You can select a **Blank Project**.

### Step 2. Create an `Author` model

From the project setting page, create a new **Model**.

- The name should be `Author`.

Next, add these fields (you don't have to modify the settings):

- `Name` - **Text** field (**Single-line String**)
- `Picture` - **Media** field (**Single asset**)

### Step 3. Create a `Post` model

From the project setting page, create a new **Model**:

- The name should be `Post`.
- **Important:** From the "Additional Settings" tab, turn on **Enable draft/published system.** This lets you preview the content.

Next, add these fields (you don't have to modify the settings unless specified):

- `Title` - **Text** field (**Single-line String**)
- `Content` - **Text** field (**Multiple-paragraph Text**)
- `Excerpt` - **Text** field (**Single-line String**)
- `Cover Image` - **Media** field (**Single asset**)
- `Date` - **Date and time** field (**Date**)
- `Author` - **Links** field (**Single link**) , and from the "Validations" tab under "Accept only specified model", select **Author**.
- `Slug` - **SEO** field (**Slug**), and from the "Validations" tab under "Reference field" select **Title**.

### Step 4. Populate Content

From the **Content** menu at the top, select **Author** and create a new record.

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

### Step 5. Set up environment variables

Go to the **Settings** menu at the top and click **API tokens**.

Then click **Read-only API token** and copy the token.

Next, copy the `.env.example` file in this directory to `.env` (which will be ignored by Git):

```bash
cp .env.example .env
```

Then set each variable on `.env`:

- `NEXT_EXAMPLE_CMS_DATOCMS_API_TOKEN` should be the API token you just copied.
- `NEXT_EXAMPLE_CMS_DATOCMS_PREVIEW_SECRET` can be any random string (but avoid spaces), like `MY_SECRET` - this is used for [the Preview Mode](https://nextjs.org/docs/advanced-features/preview-mode).

Your `.env` file should look like this:

```bash
NEXT_EXAMPLE_CMS_DATOCMS_API_TOKEN=...
NEXT_EXAMPLE_CMS_DATOCMS_PREVIEW_SECRET=...
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

On DatoCMS, go to one of the posts you've created and:

- **Update the title**. For example, you can add `[Draft]` in front of the title.
- Click **Save**, but **DO NOT** click **Publish**. By doing this, the post will be in the draft state.

(If it doesn't become draft, you need to go to the model settings for `Post`, go to **Additional Settings**, and turn on **Enable draft/published system**.)

Now, if you go to the post page on localhost, you won't see the updated title. However, if you use the **Preview Mode**, you'll be able to see the change ([Documentation](https://nextjs.org/docs/advanced-features/preview-mode)).

To enable the Preview Mode, go to this URL:

```
http://localhost:3000/api/preview?secret=<secret>&slug=<slug>
```

- `<secret>` should be the string you entered for `NEXT_EXAMPLE_CMS_DATOCMS_PREVIEW_SECRET`.
- `<slug>` should be the post's `slug` attribute (you can check on DatoCMS).

You should now be able to see the updated title. To exit the preview mode, you can click **Click here to exit preview mode** at the top.

### Step 8. Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

To deploy on Vercel, you need to set the environment variables with **Now Secrets** using [Now CLI](https://vercel.com/download) ([Documentation](https://vercel.com/docs/now-cli#commands/secrets)).

Install [Now CLI](https://vercel.com/download), log in to your account from the CLI, and run the following commands to add the environment variables. Replace `<NEXT_EXAMPLE_CMS_DATOCMS_API_TOKEN>` and `<NEXT_EXAMPLE_CMS_DATOCMS_PREVIEW_SECRET>` with the corresponding strings in `.env`.

```
now secrets add next_example_cms_datocms_api_token <NEXT_EXAMPLE_CMS_DATOCMS_API_TOKEN>
now secrets add next_example_cms_datocms_preview_secret <NEXT_EXAMPLE_CMS_DATOCMS_PREVIEW_SECRET>
```

Then push the project to GitHub/GitLab/Bitbucket and [import to Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) to deploy.
