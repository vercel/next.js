# A statically generated blog example using Next.js and ButterCMS

This example showcases Next.js's [Static Generation](https://nextjs.org/docs/basic-features/pages) feature using [ButterCMS](https://buttercms.com/) as the data source.

## Demo

[https://next-blog-buttercms.now.sh/](https://next-blog-buttercms.now.sh/)

### Related examples

- [WordPress](/examples/cms-wordpress)
- [DatoCMS](/examples/cms-datocms)
- [Sanity](/examples/cms-sanity)
- [TakeShape](/examples/cms-takeshape)
- [Prismic](/examples/cms-prismic)
- [Contentful](/examples/cms-contentful)
- [Agility CMS](/examples/cms-agilitycms)
- [Cosmic](/examples/cms-cosmic)
- [Strapi](/examples/cms-strapi)
- [Blog Starter](/examples/blog-starter)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example cms-buttercms cms-buttercms-app
# or
yarn create next-app --example cms-buttercms cms-buttercms-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/vercel/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/cms-buttercms
cd cms-buttercms
```

## Configuration

### Step 1. Create an account on ButterCMS

First, [create an account on ButterCMS](https://buttercms.com/).

After signing up, you’ll be presented with the API key. We’ll use this in the next step.

### Step 2. Set up environment variables

Copy the `.env.local.example` file in this directory to `.env.local` (which will be ignored by Git):

```bash
cp .env.local.example .env.local
```

Then set each variable on `.env.local`:

- `NEXT_EXAMPLE_CMS_BUTTERCMS_API_KEY` should be set as the API key.
- `NEXT_EXAMPLE_CMS_BUTTERCMS_PREVIEW_SECRET` can be any random string (but avoid spaces), like `MY_SECRET` - this is used for [Preview Mode](https://nextjs.org/docs/advanced-features/preview-mode).

### Step 3. Run Next.js in development mode

When you sign up to ButterCMS, it creates an example blog post automatically. You can run Next.js in development mode to view a blog containing this example post.

```bash
npm install
npm run dev

# or

yarn install
yarn dev
```

Your blog should be up and running on [http://localhost:3000](http://localhost:3000)! If it doesn't work, post on [GitHub discussions](https://github.com/vercel/next.js/discussions).

### Step 4. Try preview mode

To try preview mode, [create a blog post](https://buttercms.com/post/):

- Set the **Title** as `Draft Post Test`.
- Fill the content and summary with dummy text.
- Set the **Featured Image** by downloading some image from [Unsplash](https://unsplash.com/).

Most importantly, **do not publish** the blog post. Instead, click **Save Draft**.

Now, if you go to the post page on localhost, you won't see this post because it’s not published. However, if you use the **Preview Mode**, you'll be able to see the change ([Documentation](https://nextjs.org/docs/advanced-features/preview-mode)).

To enable the Preview Mode, go to this URL:

```
http://localhost:3000/api/preview?secret=<secret>&slug=draft-post-test
```

- `<secret>` should be the string you entered for `NEXT_EXAMPLE_CMS_BUTTERCMS_PREVIEW_SECRET`.

You should now be able to see the draft post. To exit the preview mode, you can click **Click here to exit preview mode** at the top.

**Tip**: [You can set the preview URL on ButterCMS](https://buttercms.com/kb/preview-urls).

### Step 5. Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

To deploy on Vercel, you need to set the environment variables with **Vercel Secrets** using [Vercel CLI](https://vercel.com/download) ([Documentation](https://vercel.com/docs/vercel-cli#commands/secrets)).

Install [Vercel CLI](https://vercel.com/download), log in to your account from the CLI, and run the following commands to add the environment variables. Replace `<NEXT_EXAMPLE_CMS_BUTTERCMS_API_KEY>` and `<NEXT_EXAMPLE_CMS_BUTTERCMS_PREVIEW_SECRET>` with the corresponding strings in `.env`.

```
vercel secrets add next_example_cms_buttercms_api_key <NEXT_EXAMPLE_CMS_BUTTERCMS_API_KEY>
vercel secrets add next_example_cms_buttercms_preview_secret <NEXT_EXAMPLE_CMS_BUTTERCMS_PREVIEW_SECRET>
```

Then push the project to GitHub/GitLab/Bitbucket and [import to Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) to deploy.
