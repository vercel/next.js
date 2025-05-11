# Redis Example (with Upstash)

This example showcases how to use Redis as a data store in a Next.js project.

The example is a roadmap voting application where users can enter and vote for feature requests. It features the following:

- Users can add and upvote items (features in the roadmap)
- Users can enter their email addresses to be notified about the released items.

## Demo

- [https://roadmap-redis.vercel.app/](https://roadmap-redis.vercel.app/)

## Deploy Your Own

This examples uses [Upstash](https://upstash.com) (Serverless Redis Database) as its data storage. During deployment. The integration will help you create a free Redis database and link it to your Vercel project automatically.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fnext.js%2Ftree%2Fcanary%2Fexamples%2Fwith-redis&project-name=redis-roadmap&repository-name=redis-roadmap&demo-title=Redis%20Roadmap&demo-description=Create%20and%20upvote%20features%20for%20your%20product.&demo-url=https%3A%2F%2Froadmap-redis.vercel.app%2F&stores=%5B%7B"type"%3A"kv"%7D%5D&)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-redis roadmap
```

```bash
yarn create next-app --example with-redis roadmap
```

```bash
pnpm create next-app --example with-redis roadmap
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
