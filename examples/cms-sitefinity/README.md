# A statically generated blog example using Next.js and Sitefinity CMS

This is the existing [cms-sitefinity](https://github.com/vercel/next.js/tree/canary/examples/cms-sitefinity) plus TypeScript.
This example showcases [Next.js's Static Generation feature](https://nextjs.org/docs/basic-features/pages) using Sitefinity CMS as the data source.

## Demo

[https://next-cms-sitefinity.vercel.app/](https://next-cms-sitefinity.vercel.app/)

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/cms-sitefinity)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/cms-sitefinity&project-name=cms-sitefinity&repository-name=cms-sitefinity)

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

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example cms-sitefinity cms-sitefinity-app
```

```bash
yarn create next-app --example cms-sitefinity cms-sitefinity-app
```

```bash
pnpm create next-app --example cms-sitefinity cms-sitefinity-app
```

## Configuration

### Step 1. Setup the CMS locally (version >=14.27922)

First, [install](https://www.progress.com/documentation/sitefinity-cms/install-sitefinity) and run the CMS Locally.

### Step 2. Import the ready to use dynamic module 'Posts'

For the purpose of this demo a ready to use dynamic module was build containing two types - 'Post' and 'Author'.

In order to install it:

1. Open the CMS Administration under (/Sitefinity)
2. Open the Export/Import screen under (/Sitefinity/Administration/Packaging)
3. Click on Import Zip file and import the file from the [sitefinity folder](./sitefinity/SitefinityExport.zip)

### Step 3. Enable the web service

By default the web services are not allowed for anonymous users, so the yhave to be enabled.

Go to /sitefinity/Administration/WebServices and edit the 'Default' web service to allow it to be accessible by 'Everyone'

### Step 4. Install the GraphQL package

1. Add the [Sitefinity CMS nugget source](https://www.progress.com/documentation/sitefinity-cms/sitefinity-cms-nuget-packages-repository)
2. Install the [Progress.Sitefinity.GraphQL](https://nuget.sitefinity.com/#/package/Progress.Sitefinity.GraphQL) package (enable prerelease filter).

### Step 5. Set up environment variables

Copy the `.env.local.example` file in this directory to `.env.local` (which will be ignored by Git):

```bash
cp .env.local.example .env.local
```

Then set each variable on `.env.local`

- `SF_API_URL` - This is the url of the 'Default' web service that we configured earlier. E.g. http://locahost/api/default/
- `SF_URL` - This is the URL of the CMS itself. E.g. http://localhost/

### Step 6. Run Next.js in development mode

```bash
npm install
npm run dev

# or

yarn
yarn dev
```

Your blog should be up and running on [http://localhost:3000](http://localhost:3000)! If it doesn't work, post on [GitHub discussions](https://github.com/vercel/next.js/discussions).
