# A statically generated blog example using Next.js and GraphCMS

This example showcases Next.js's [Static Generation](https://nextjs.org/docs/basic-features/pages) feature using [GraphCMS](https://www.graphcms.com/) as the data source.

## Demo

### [https://next-blog-graphcms.now.sh/](https://next-blog-graphcms.now.sh/)

### Related examples

- [Blog Starter](/examples/blog-starter)
- [DatoCMS](/examples/cms-datocms)
- [TakeShape](/examples/cms-takeshape)
- [Prismic](/examples/cms-prismic)
- [Contentful](/examples/cms-contentful)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example cms-graphcms cms-graphcms-app
# or
yarn create next-app --example cms-graphcms cms-graphcms-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/cms-graphcms
cd cms-graphcms
```

## Configuration

### Step 1. Create an account and a project in GraphCMS

First, [create an account in GraphCMS](https://app.graphcms.com).

### Step 2. Create a new GraphCMS project

After creating an account, create a new project from the "Blog Starter template" - be sure to include the example content.

### Step 3. Copy your environment variables

Copy the `.env.example` file in this directory to `.env.local` (which will be ignored by Git):

```bash
cp .env.example .env.local
```

Then set each variable in `.env.local`:

- `NEXT_EXAMPLE_CMS_GCMS_PREVIEW_SECRET` can be any random string (but avoid spaces), like `MY_SECRET` - this is used for [the Preview Mode](https://nextjs.org/docs/advanced-features/preview-mode).
- `NEXT_EXAMPLE_CMS_GCMS_PROJECT_API`: Get the `Project API` endpoint value from the Settings > API Access page.
- `NEXT_EXAMPLE_CMS_GCMS_PROD_AUTH_TOKEN`: Copy the API token from your project API Access Settings. This will only query content that is published.
- `NEXT_EXAMPLE_CMS_GCMS_DEV_AUTH_TOKEN`: Copy the API token from your project API Access Settings. This will only query content that is in draft.

You can find all of these tokens under Settings > API Access (lefthand menu, bottom group of icons.)

Your `.env.local` file should look like this:

```bash
NEXT_EXAMPLE_CMS_GCMS_PREVIEW_SECRET=...
NEXT_EXAMPLE_CMS_GCMS_PROJECT_API=...
NEXT_EXAMPLE_CMS_GCMS_PROD_AUTH_TOKEN=...
NEXT_EXAMPLE_CMS_GCMS_DEV_AUTH_TOKEN=...

```

### Step 4. Run Next.js in development mode

```bash
npm install
npm run dev

# or

yarn install
yarn dev
```

Your blog should be up and running on [http://localhost:3000](http://localhost:3000)! If it doesn't work, post on [GitHub discussions](https://github.com/zeit/next.js/discussions).

### Step 5. Try preview mode

In GraphCMS, go to one of the posts you've created and:

- **Update the title**. For example, you can add `[Draft]` in front of the title.
- After you edit the document save the article as a draft, but **DO NOT** click **Publish**. By doing this, the post will be in the draft stage.

Now, if you go to the post page on localhost, you won't see the updated title. However, if you use the **Preview Mode**, you'll be able to see the change ([Documentation](/docs/advanced-features/preview-mode.md)).

To view the preview, transform the url to the following format: `http://localhost:3000/api/preview?secret=[YOUR_SECRET_TOKEN]&slug=[SLUG_TO_PREVIEW]` where \[YOUR_SECRET_TOKEN]\ is the same secret you defined in the `.env` file and \[SLUG_TO_PREVIEW]\ is the slug of one of the posts you want to preview.

You should now be able to see the updated title. To exit the preview mode, you can click on _"Click here to exit preview mode"_ at the top.

### Step 6. Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

To deploy on Vercel, you need to set the environment variables with **Vercel Secrets** using [Vercel CLI](https://vercel.com/download) ([Documentation](https://vercel.com/docs/cli#commands/secrets)).

Install [Vercel CLI](https://vercel.com/download), log in to your account from the CLI by running the following command.

```bash
vercel login
```

Now, link your project to a Vercel project by running `vercel` in the terminal and follow the command-line prompts. It is usually safe to accept all the defaults.

Before we deploy, we need to add our secrets to the the Vercel run time. The commandline pattern for adding secrts to vercel looks like:

```bash
vercel secrets add my-secret "my value"
```

Run that command for each of the entries in our .env.local file. For example, adding the secret would look like

```bash
vercel secrets add NEXT_EXAMPLE_CMS_GCMS_PREVIEW_SECRET "12345token"
```

Once all th secrets hav been added, you can re-run the vercel deploy with `vercel`.

That's it! You now have a blog on Vercel, made with NextJS and powered by GraphCMS with preview's enabled!
