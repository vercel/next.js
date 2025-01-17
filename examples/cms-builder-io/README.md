# A statically generated blog example using Next.js and Builder.io

This example showcases Next.js's [Static Generation](https://nextjs.org/docs/basic-features/pages) feature using [Builder.io](https://builder.io/) as the data source.

## Demo

[https://cms-builder-io.vercel.app/](https://cms-builder-io.vercel.app/)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example cms-builder-io cms-builder-io-app
```

```bash
yarn create next-app --example cms-builder-io cms-builder-io-app
```

```bash
pnpm create next-app --example cms-builder-io cms-builder-io-app
```

## Configuration

### Step 1 Install the Builder.io cli

```
npm install @builder.io/cli -g
```

### Step 2 Generate a space

[Signup for Builder.io](https://builder.io/signup), then go to your [organization settings page](https://builder.io/account/organization?root=true), create a private key and copy it and supply it for `[private-key]` below. For `[space-name]` create a name for your space, such as "Blog"

```
cd cms-builder-io-app
builder create -k [private-key] -n [space-name] -d
```

This command when done it'll print your new space's public api key, copy it and add as the value for `NEXT_PUBLIC_BUILDER_API_KEY` into the .env files (`.env.production` and `.env.development`)

```
BUILDER_PUBLIC_KEY=...
```

### Step 3 Run Next.js in development mode

```bash
npm install
npm run dev

# or

yarn install
yarn dev
```

Your blog should be up and running on [http://localhost:3000](http://localhost:3000)! If it doesn't work, you can post on [GitHub discussions](https://github.com/vercel/next.js/discussions).

### Step 4 Try preview mode

To try preview mode at any time while editing in Builder.io press `view current draft`, if you changed the secret defined in [constants.js](./lib/constants.js) you'll need to also change it in your `Post` [model settings](https://builder.io/models).

To exit the preview mode, you can click **Click here to exit preview mode** at the top.

### Step 5 Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

#### Deploy Your Local Project

To deploy your local project to Vercel, push it to GitHub/GitLab/Bitbucket and [import to Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example).

**Important**: When you import your project on Vercel, make sure to click on **Environment Variables** and set them to match your `.env.local` file.

#### Deploy from Our Template

Alternatively, you can deploy using our template by clicking on the Deploy button below.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/cms-builder-io&project-name=cms-builder-io&repository-name=cms-builder-io&env=BUILDER_PUBLIC_KEY&envDescription=Required%20to%20connect%20the%20app%20with%20Builder.io&envLink=https://www.builder.io/c/docs/custom-react-components#api-key)

### Related examples

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
- [Kontent.ai](/examples/cms-kontent-ai)
- [MakeSwift](/examples/cms-makeswift)
- [Payload](/examples/cms-payload)
- [Plasmic](/examples/cms-plasmic)
- [Prepr](/examples/cms-prepr)
- [Prismic](/examples/cms-prismic)
- [Sanity](/examples/cms-sanity)
- [Sitecore XM Cloud](/examples/cms-sitecore-xmcloud)
- [Sitefinity](/examples/cms-sitefinity)
- [Storyblok](/examples/cms-storyblok)
- [TakeShape](/examples/cms-takeshape)
- [Tina](/examples/cms-tina)
- [Umbraco](/examples/cms-umbraco)
- [Umbraco heartcore](/examples/cms-umbraco-heartcore)
- [Webiny](/examples/cms-webiny)
- [WordPress](/examples/cms-wordpress)
- [Blog Starter](/examples/blog-starter)
