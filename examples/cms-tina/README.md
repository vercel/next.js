# A statically generated blog example using Next.js and TinaCMS

This example showcases Next.js's [Static Generation](https://nextjs.org/docs/basic-features/pages) feature using [TinaCMS](https://tina.io/) as the CMS and editor.

> This boilerplate demonstrates a basic usage and best practices. If you are looking for a more feature rich Tina experience with contextual editing.
> check out [tina-cloud-starter](https://github.com/tinacms/tina-cloud-start/git).

## Demo

### [https://cms-tina-example.vercel.app/](https://cms-tina-example.vercel.app/)

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
npx create-next-app --example cms-tina cms-tina-app
```

```bash
yarn create next-app --example cms-tina cms-tina-app
```

```bash
pnpm create next-app --example cms-tina cms-tina-app
```

### Setp 1. Run Next.js in development mode

To get started, no configuration is needed for local development and editing.

```bash
npm install
npm run tina-dev

# or

yarn install
yarn tina-dev
```

Your blog should be up and running on [http://localhost:3000](http://localhost:3000)! If it doesn't work, post on [GitHub discussions](https://github.com/vercel/next.js/discussions).

### Step 2. Editing blog posts.

Tina is git backed and uses markdown, JSON or MDX to power websites. To enter edit mode locally you just need to visit [http://localhost:3000/admin](http://localhost:3000/admin)

You can then select the collection "Blog Posts" and then the content you would like to edit.

Once you hit save, Tina will use our graphQL modify the content on your filesystem.

### Step 4. Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

#### Deploy Your Local Project

To deploy your local project to Vercel, push it to GitHub. Once you have pushed to GitHub, sign up for your Tina Cloud account at [https://app.tina.io/register](https://app.tina.io/register). Then follow the steps below:

1. Select new project
2. Select Import your site
3. Follow steps to connect your GitHub repo.
4. Copy your Client ID

Then [import to Vercel](https://vercel.com/import/git?utm_source=github&utm_medium=readme&utm_campaign=next-example).

**Important**: When you import your project on Vercel, make sure to click on **Environment Variables** and set NEXT_PUBLIC_TINA_CLIENT_ID to the client ID above.

Once you have successfully deployed to Vercel, go back to your Tina dashboard and under the project configuration enter the url in the Site URL(s) for example: https://cms-tina-example.vercel.app/
