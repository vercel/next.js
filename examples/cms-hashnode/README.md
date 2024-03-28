# A statically generated blog example using Next.js, Markdown, and TypeScript with Hashnode 💫

This is the existing [blog-starter](https://github.com/vercel/next.js/tree/canary/examples/blog-starter) plus TypeScript.
wired with [Hashnode](https://hashnode.com).

We've used [Hashnode API's](https://apidocs.hashnode.com) and integrated them with this blog starter kit.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/cms-hashnode&project-name=cms-hashnode&repository-name=cms-hashnode)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example cms-hashnode cms-hashnode-app
```

```bash
yarn create next-app --example cms-hashnode cms-hashnode-app
```

```bash
pnpm create next-app --example cms-hashnode cms-hashnode-app
```

## Version Requirements:

    Node.js 18.17+

## Running Locally

- cd into `examples/cms-hashnode`
- Copy `.env.example` to `.env.local`
- `npm install`
- `npm run dev`

Visit http://localhost:3000!

## Want to have your own?

Change the environment variable `NEXT_PUBLIC_HASHNODE_PUBLICATION_HOST` in the `.env.local` file to your host (victoria.hashnode.dev is the host in the example)
That's it! You now have your own frontend. You can still use Hashnode for writing your Articles.

## APIs

If you prefer to build your frontend from scratch, you can use our public GraphQL APIs to do so:

- [Docs](https://apidocs.hashnode.com)
- [GraphQL Playground](https://gql.hashnode.com)
- [Generate queries/mutations by talking to AI](https://chatgql.com/chat?url=https://gql.hashnode.com)

# Live Demos

- [Personal Blog](https://sandeep.dev/blog)

# Hashnode Blog Starter Kit

[Blog Starter Kit](https://github.com/Hashnode/starter-kit) lets you instantly deploy a Next.js and Tailwind powered frontend for your Hashnode blog. It consumes [Hashnode's Public APIs](https://apidocs.hashnode.com), and gives you a fully customizable blog that can be deployed anywhere, including a subpath of a custom domain. Combined with [Hashnode's headless mode](https://hashnode.com/headless), it unlocks entirely new possibilities. You can now use Hashnode's [world class editor](https://hashnode.com/neptune) and dashboard to author content and collaborate. And use blog starter kit to customize the frontend to your liking.
