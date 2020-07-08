# A statically generated blog example using Next.js and MDX

This example showcases Next.js's [Static Generation](https://nextjs.org/docs/basic-features/pages) feature using MDX files as the data source.

The blog posts are stored in `/_posts` as MDX files with front matter support. Adding a new markdown file in there will create a new blog post.

We do the mapping of components from the MDX file to the project with the `mdxComponents` object in `posts/[slug].js`, so there is no need to have import statements in the MDX file. This makes it possible to fetch the MDX source from any other data source.

To create the blog posts we use [`next-mdx-remote`](https://github.com/hashicorp/next-mdx-remote) to convert the markdown files into an object containing the JS source and the HTML string output, and then send it down as a prop to the page. In the render of the page we rehydrate the custom MDX components using the JS source. The metadata of every post is handled by [`gray-matter`](https://github.com/jonschlinkert/gray-matter) and also sent in props to the page.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/git?c=1&s=https://github.com/vercel/next.js/tree/canary/examples/blog-starter-mdx)

### Related examples

- [Blog Starter](/examples/blog-starter)
- [Blog Starter TypeScript](/examples/blog-starter-typescript)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example blog-starter-mdx blog-starter-mdx-app
# or
yarn create next-app --example blog-starter-mdx blog-starter-mdx-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/vercel/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/blog-starter-mdx
cd blog-starter-mdx
```

Install dependencies and run the example:

```bash
npm install
npm run dev

# or

yarn install
yarn dev
```

Your blog should be up and running on [http://localhost:3000](http://localhost:3000)! If it doesn't work, post on [GitHub discussions](https://github.com/vercel/next.js/discussions).

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

# Notes

This blog-starter-mdx uses [Tailwind CSS](https://tailwindcss.com). To control the generated stylesheet's filesize, this example uses Tailwind CSS' v1.4 [`purge` option](https://tailwindcss.com/docs/controlling-file-size/#removing-unused-css) to remove unused CSS.
