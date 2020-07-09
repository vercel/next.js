# NextAuth.js Example

Next.js example with [`next-auth`](https://github.com/iaincollins/next-auth), an open source, easy to use, and secure by default authentication library.

## How to use

Copy the `.env.local.example` file in this directory to `.env.local` (which will be ignored by Git):

```bash
cp .env.local.example .env.local
```

Then, you'll need to fill at least one of the authentication providers by adding the required secrets for it, be that in the form of OAuth keys/secrets from a provider (Google, Twitter, etc.) or an SMTP connection string to enable email authentication.

More details about the providers can be found [here](https://next-auth.js.org/configuration/providers), and for a more complete introduction to `next-auth` check out their [introduction guide](https://next-auth.js.org/getting-started/introduction)

It is vital that you know the deployment URL and define it in the environment file.

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-next-auth with-next-auth-app
# or
yarn create next-app --example with-next-auth with-next-auth-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/vercel/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-next-auth
cd with-next-auth
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

**Note:** For production you need to know in advance the domain (deployment URL) of your application, as it would be required for OAuth to work, once you have it set it to the `VERCEL_URL` environment variable under the settings of your Vercel project.
