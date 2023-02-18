# A statically generated blog example using Next.js, Blockenberg, and TypeScript

This is the typescript version of Next.js Blog Starter [blog-starter](https://github.com/vercel/next.js/tree/canary/examples/blog-starter) that fetch data from IPFS based decentralized CMS Blockenberg.

This example showcases Next.js's [Static Generation](https://nextjs.org/docs/basic-features/pages) feature using your IPFS files as the data source. You can easily create a new content on [Blockenberg](https://blockenberg.fission.app) and you need your Blockenberg token to find your posts on IPFS.

The token is on your account settings page (click on the Avatar) and it needs to be present on the environment. For local development you can rename .local.env.sample file to .local.env and fill your token in. 

## Demo

[https://next-blockenberg-starter.vercel.app/](https://next-blockenberg-starter.vercel.app/)

## Deploy your own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/cms-blockenberg&project-name=cms-blockenberg&repository-name=cms-blockenberg)

### Related examples

- [WordPress](/examples/cms-wordpress)
- [DatoCMS](/examples/cms-datocms)
- [Sanity](/examples/cms-sanity)
- [TakeShape](/examples/cms-takeshape)
- [Prismic](/examples/cms-prismic)
- [Contentful](/examples/cms-contentful)
- [Strapi](/examples/cms-strapi)
- [Agility CMS](/examples/cms-agilitycms)
- [Cosmic](/examples/cms-cosmic)
- [ButterCMS](/examples/cms-buttercms)
- [Storyblok](/examples/cms-storyblok)
- [GraphCMS](/examples/cms-graphcms)
- [Kontent](/examples/cms-kontent)
- [Umbraco Heartcore](/examples/cms-umbraco-heartcore)
- [Builder.io](/examples/cms-builder-io)
- [TinaCMS](/examples/cms-tina/)
- [Enterspeed](/examples/cms-enterspeed)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example cms-blockenberg blockenberg-starter-app
```

```bash
yarn create next-app --example cms-blockenberg blockenberg-starter-app
```

```bash
pnpm create next-app --example cms-blockenberg blockenberg-starter-app
```

Your blog should be up and running on [http://localhost:3000](http://localhost:3000)! If it doesn't work, post on [GitHub discussions](https://github.com/vercel/next.js/discussions).

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

# Notes

`cms-blockenberg` uses [Tailwind CSS](https://tailwindcss.com) [(v3.0)](https://tailwindcss.com/blog/tailwindcss-v3).
