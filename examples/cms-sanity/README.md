# A statically generated blog example using Next.js and Sanity

This example showcases Next.js's [Static Generation](https://nextjs.org/docs/basic-features/pages) feature using [Sanity](https://www.sanity.io/) as the data source.

You'll get:

- Next.js deployed with the [Sanity Vercel Integration][integration].
- Sanity Studio running on localhost and deployed in the [cloud](https://www.sanity.io/docs/deployment).
- Sub-second as-you-type previews in Next.js
- [On-demand revalidation of pages](https://nextjs.org/blog/next-12-1#on-demand-incremental-static-regeneration-beta) with [GROQ powered webhooks](https://www.sanity.io/docs/webhooks)

## Demo

### [https://next-blog-sanity.vercel.app](https://next-blog-sanity.vercel.app)

## Related examples

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

# Configuration

- [Step 1. Set up the environment](#step-1-set-up-the-environment)
- [Step 2. Run Next.js locally in development mode](#step-3-run-nextjs-locally-in-development-mode)
- [Step 3. Populate content](#step-3-populate-content)
- [Step 4. Deploy to production & use Preview Mode from anywhere](#step-4-deploy-to-production--use-preview-mode-from-anywhere)
  - [If you didn't Deploy with Vercel earlier do so now](#if-you-didnt-deploy-with-vercel-earlier-do-so-now)
  - [Configure CORS for production](#configure-cors-for-production)
  - [Add the preview secret environment variable](#add-the-preview-secret-environment-variable)
  - [How to test locally that the secret is setup correctly](#how-to-test-locally-that-the-secret-is-setup-correctly)
  - [How to start Preview Mode for Next.js in production from a local Studio](#how-to-start-preview-mode-for-nextjs-in-production-from-a-local-studio)
  - [If you regret sending a preview link to someone](#if-you-regret-sending-a-preview-link-to-someone)
- [Step 5. Deploy your Studio and publish from anywhere](#step-5-deploy-your-studio-and-publish-from-anywhere)
- [Step 6. Setup Revalidation Webhook](#step-6-setup-revalidation-webhook)
  - [Testing the Webhook](#testing-the-webhook)
- [Next steps](#next-steps)

## Step 1. Set up the environment

Use the Deploy Button below, you'll deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) as well as connect it to your Sanity dataset using [the Sanity Vercel Integration][integration].

[![Deploy with Vercel](https://vercel.com/button)][vercel-deploy]

[Clone the repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/cloning-a-repository) that Vercel created for you and from the root directory of your local checkout.
Then link your clone to Vercel:

```bash
npx vercel link
```

Download the environment variables needed to connect Next.js and Studio to your Sanity project:

```bash
npx vercel env pull
```

## Step 2. Run Next.js locally in development mode

```bash
npm install && npm run dev
```

```bash
yarn install && yarn dev
```

Your blog should be up and running on [http://localhost:3000](http://localhost:3000)! If it doesn't work, post on [GitHub discussions](https://github.com/vercel/next.js/discussions).

Note: This also installs dependencies for Sanity Studio as a post-install step.

## Step 4. Populate content

In another terminal start up the studio:

```bash
npm run studio:dev
```

Your studio should be up and running on [http://localhost:3333](http://localhost:3333)!

### Create content

Create content in Sanity Studio and live preview it in Next.js, side-by-side, by opening these URLs:

- [`http://localhost:3333`](http://localhost:3333)
- [`http://localhost:3000/api/preview`](http://localhost:3000/api/preview)

<details>
<summary>View screenshot ✨</summary>

![screenshot](https://user-images.githubusercontent.com/81981/182991870-7a0f6e54-b35e-4728-922b-409fcf1d6cc3.png)

</details>

We're all set to do some content creation!

- Click on the **"Create new document"** button top left and select **Post**
- Type some dummy data for the **Title**
- **Generate** a **Slug**
  <details>
  <summary>View screenshot ✨</summary>

  ![screenshot](https://user-images.githubusercontent.com/81981/182993687-b6313086-f60a-4b36-b038-4c1c63b53c54.png)

  </details>

- Set the **Date**
- Select a **Cover Image** from [Unsplash].
  <details>
  <summary>View screenshot ✨</summary>

  ![screenshot](https://user-images.githubusercontent.com/81981/182994571-f204c41c-e1e3-44f4-82b3-99fefbd25bec.png)

  </details>

- Let's create an **Author** inline, click **Create new**.
- Give the **Author** a **Name**.
- After selecting a **Picture** of a **face** from [Unsplash], set a hotspot to ensure pixel-perfect cropping.
  <details>
  <summary>View screenshot ✨</summary>

  ![screenshot](https://user-images.githubusercontent.com/81981/182995772-33d63e45-4920-48c5-aa47-ccb7ce10170c.png)

  </details>

- Create a couple more **Posts** and watch how the layout adapt to more content.

**Important:** For each post record, you need to click **Publish** after saving for it to be visible outside Preview Mode.

To exit Preview Mode, you can click on _"Click here to exit preview mode"_ at the top.

## Step 4. Deploy to production & use Preview Mode from anywhere

### If you didn't [Deploy with Vercel earlier](#step-1-set-up-the-environment) do so now

To deploy your local project to Vercel, push it to [GitHub](https://docs.github.com/en/get-started/importing-your-projects-to-github/importing-source-code-to-github/adding-locally-hosted-code-to-github)/GitLab/Bitbucket and [import to Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example).

**Important**: When you import your project on Vercel, make sure to click on **Environment Variables** and set them to match your `.env.local` file.

After it's deployed link your local code to the Vercel project:

```bash
npx vercel link
```

### Configure CORS for production

Add your `production url` to the list over CORS origins.

<details>
<summary>Don't remember the production url? 🤔</summary>

No worries, it's easy to find out. Go to your [Vercel Dashboard](https://vercel.com/) and click on your project:

![screenshot](https://user-images.githubusercontent.com/81981/183002637-6aa6b1d8-e0ee-4a9b-bcc0-d49799fcc984.png)

In the screenshot above the `production url` is `https://cms-sanity.vercel.app`.

</details>

```bash
npm --prefix studio run cors:add -- [your production url] --credentials
```

### Add the preview secret environment variable

It's required to set a secret that makes Preview Mode activation links unique. Otherwise anyone could see your unpublished content by just opening `[your production url]/api/preview`.
Run this and it'll prompt you for a value:

```bash
npx vercel env add SANITY_STUDIO_PREVIEW_SECRET
```

The secret can be any combination of random words and letters as long as it's URL safe.
You can generate one in your DevTools console using `copy(Math.random().toString(36).substr(2, 10))` if you don't feel like inventing one.

You should see something like this in your terminal afterwards:

```bash
$ npx vercel env add SANITY_STUDIO_PREVIEW_SECRET
Vercel CLI 27.3.7
? What’s the value of SANITY_STUDIO_PREVIEW_SECRET? 2whpu1jefs
? Add SANITY_STUDIO_PREVIEW_SECRET to which Environments (select multiple)? Production, Preview, Development
✅  Added Environment Variable SANITY_STUDIO_PREVIEW_SECRET to Project cms-sanity [1s]
```

Redeploy production to apply the secret to the preview api:

```bash
npx vercel --prod
```

After it deploys it should now start preview mode if you launch `[your production url]/api/preview?secret=[your preview secret]`. You can send that preview url to people you want to show the content you're working on before you publish it.

### How to test locally that the secret is setup correctly

In order to test that the secret will prevent unauthorized people from activating preview mode, start by updating the local `.env` with the secret you just made:

```bash
npx vercel env pull
```

Restart your Next.js and Studio processes so the secret is applied:

```bash
npm run dev
```

```bash
npm run studio:dev
```

And now you'll get an error if `[secret]` is incorrect when you try to open `https://localhost:3000/api/preview?secret=[secret]`.

### How to start Preview Mode for Next.js in production from a local Studio

Run this to make the Studio open previews at `[your production url]/api/preview` instead of `http://localhost:3000/api/preview`

```bash
SANITY_STUDIO_PREVIEW_URL=[your production url] npm run studio:dev
```

### If you regret sending a preview link to someone

Revoke their access by creating a new secret:

```bash
npx vercel env rm SANITY_STUDIO_PREVIEW_SECRET
npx vercel env add SANITY_STUDIO_PREVIEW_SECRET
npx vercel --prod
```

## Step 5. Deploy your Studio and publish from anywhere

Live previewing content is fun, but collaborating on content in real-time is next-level:

```bash
SANITY_STUDIO_PREVIEW_URL=[your production url] npm run studio:deploy
```

If it's successful you should see something like this in your terminal:

```bash
SANITY_STUDIO_PREVIEW_URL="https://cms-sanity.vercel.app" npm run studio:deploy
? Studio hostname (<value>.sanity.studio): cms-sanity

Including the following environment variables as part of the JavaScript bundle:
- SANITY_STUDIO_PREVIEW_URL
- SANITY_STUDIO_PREVIEW_SECRET
- SANITY_STUDIO_API_PROJECT_ID
- SANITY_STUDIO_API_DATASET

✔ Deploying to Sanity.Studio

Success! Studio deployed to https://cms-sanity.sanity.studio/
```

This snippet is stripped from verbose information, you'll see a lot of extra stuff in your terminal.

## Step 6. Setup Revalidation Webhook

Using GROQ Webhooks Next.js can rebuild pages that have changed content. It rebuilds so fast it can almost compete with Preview Mode.

Create a secret and give it a value the same way you did for `SANITY_STUDIO_PREVIEW_SECRET` in [Step 4](#add-the-preview-secret-environment-variable). It's used to verify that webhook payloads came from Sanity infra, and set it as the value for `SANITY_REVALIDATE_SECRET`:

```bash
npx vercel env add SANITY_REVALIDATE_SECRET
```

You should see something like this in your terminal afterwards:

```bash
$ npx vercel env add SANITY_REVALIDATE_SECRET
Vercel CLI 27.3.7
? What’s the value of SANITY_REVALIDATE_SECRET? jwh3nr85ft
? Add SANITY_REVALIDATE_SECRET to which Environments (select multiple)? Production, Preview, Development
✅  Added Environment Variable SANITY_REVALIDATE_SECRET to Project cms-sanity [1s]
```

Apply the secret to production:

```bash
npx vercel --prod
```

Wormhole into the [manager](https://manage.sanity.io/) by running:

```bash
(cd studio && npx sanity hook create)
```

- **Name** it "On-demand Revalidation".
- Set the **URL** to`[your production url]/api/revalidate`, for example: `https://cms-sanity.vercel.app/api/revalidate`
- Set the **Trigger on** field to <label><input type=checkbox checked> Create</label> <label><input type=checkbox checked> Update</label> <label><input type=checkbox checked> Delete</label>
- Set the **Filter** to `_type == "post" || _type == "author"`
- Set the **Secret** to the same value you gave `SANITY_REVALIDATE_SECRET` earlier.
- Hit **Save**!

### Testing the Webhook

- Open the Deployment function log. (**Vercel Dashboard > Deployment > Functions** and filter by `api/revalidate`)
- Edit a Post in your Sanity Studio and publish.
- The log should start showing calls.
- And the published changes show up on the site after you reload.

## Next steps

- Mount your preview inside the Sanity Studio for comfortable side-by-side editing
- [Join the Sanity community](https://slack.sanity.io/)

[vercel-deploy]: https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fnext.js%2Ftree%2Fcanary%2Fexamples%2Fcms-sanity&repository-name=cms-sanity&project-name=cms-sanity&demo-title=Blog%20using%20Next.js%20%26%20Sanity&demo-description=On-demand%20ISR%2C%20sub-second%20as-you-type%20previews&demo-url=https%3A%2F%2Fnext-blog-sanity.vercel.app%2F&demo-image=https%3A%2F%2Fuser-images.githubusercontent.com%2F110497645%2F182727236-75c02b1b-faed-4ae2-99ce-baa089f7f363.png&integration-ids=oac_hb2LITYajhRQ0i4QznmKH7gx
[integration]: https://www.sanity.io/docs/vercel-integration
[`sanity.json`]: studio/sanity.json
[`.env.local.example`]: .env.local.example
[unsplash]: https://unsplash.com
