# SuperTokens Example

This is a simple set up for applications protected by SuperTokens.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-supertokens&project-name=with-supertokens&repository-name=with-supertokens)

## How to use

- Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-supertokens with-supertokens-app
# or
yarn create next-app --example with-supertokens with-supertokens-app
```

- Run `yarn install`

- Run `npm run dev` to start the application on `http://localhost:3000`.

## Configuration

> Until you do this, social login will not work. But you can still try out email password sign up / in.

- Create a `.env.local` file and copy the content of `.env.local.example` into it:

  ```bash
  cp .env.local.example .env.local
  ```

- Fill in the values for your social login secrets

## Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

### Deploy Your Local Project

To deploy your local project to Vercel, push it to GitHub/GitLab/Bitbucket and [import to Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example).

**Important**: When you import your project on Vercel, make sure to click on **Environment Variables** and set them to match your `.env.local` file.

## Notes

Take a look at [SuperTokens documentation](https://supertokens.io/docs/community/introduction).
