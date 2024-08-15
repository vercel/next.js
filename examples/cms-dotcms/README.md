# A statically generated blog example using Next.js and dotCMS

This example showcases Next.js's [Static Generation](https://nextjs.org/docs/basic-features/pages) feature using [dotCMS](https://dotcms.com/) as the data source.

## Demo

### [https://nextjs-dotcms-blog.vercel.app/](https://nextjs-dotcms-blog.vercel.app/)

## Deploy your own

Using the Deploy Button below, you'll deploy the Next.js project.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FdotCMS%2Fnext.js%2Ftree%2Fcanary%2Fexamples%2Fcms-dotcms&project-name=nextjs-dotcms-blog&repository-name=nextjs-dotcms-blog&demo-title=Next.js+Blog&demo-description=Static+blog+with+multiple+authors+using+Preview+Mode&demo-url=https%3A%2F%2Fnext-blog-dotcms.vercel.app%2F)

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

## How to use

Rename `.env.local.example` to `.env.local` and complete the variables:

`NEXT_PUBLIC_DOTCMS_HOST` is the dotCMS host, you can use `https://demo.dotcms.com`
`DOTCMS_TOKEN` for the demo site, you can generate the token using:

```
curl -H "Content-Type:application/json" --insecure  -X POST -d  '
{ "user":"admin@dotcms.com", "password":"admin", "expirationDays": 10 }
' http://demo.dotcms.com:8080/api/v1/authentication/api-token
```

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example cms-dotcms cms-dotcms-app
# or
yarn create next-app --example cms-dotcms cms-dotcms-app
# or
pnpm create next-app --example cms-dotcms cms-dotcms-app
```

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fnext.js%2Ftree%2Fcanary%2Fexamples%2Fcms-dotcms&project-name=nextjs-dotcms-blog&repository-name=nextjs-dotcms-blog&demo-title=Next.js+Blog&demo-description=Static+blog+with+multiple+authors+using+Preview+Mode&demo-url=https%3A%2F%2Fnext-blog-dotcms.vercel.app%2F)
