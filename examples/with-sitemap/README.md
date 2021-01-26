# With Sitemap example

This example shows how to generate a `sitemap.xml` file based on the pages in your [Next.js](https://nextjs.org/) app. The sitemap will be generated and saved in the `public` directory after starting the development server or by making a build.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-sitemap&project-name=with-sitemap&repository-name=with-sitemap)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-sitemap with-sitemap-app
# or
yarn create next-app --example with-sitemap with-sitemap-app
```

Your app should be up and running on [http://localhost:3000](http://localhost:3000) and the sitemap should now be available in [http://localhost:3000/sitemap.xml](http://localhost:3000/sitemap.xml)! If it doesn't work, post on [GitHub discussions](https://github.com/vercel/next.js/discussions).

To change the website URL used by `sitemap.xml`, open the file `.env` and change the `WEBSITE_URL` environment variable:

```bash
# Used to add the domain to sitemap.xml, replace it with a real domain in production
WEBSITE_URL=https://my-domain.com
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
