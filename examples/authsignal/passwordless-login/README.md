# Authsignal Passwordless Login Example

This example shows how to integrate Authsignal with Next.js in order to implement passwordless login using email magic links and server-side redirects.

The login session is managed using cookies. Session data is encrypted using [@hapi/iron](https://hapi.dev/family/iron).

A live version of this example can be found [here](https://authsignal-next-passwordless-example.vercel.app).

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/authsignal-passwordless&project-name=authsignal-passwordless&repository-name=authsignal-passwordless)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example authsignal-passwordless authsignal-passwordless-app
# or
yarn create next-app --example authsignal-passwordless authsignal-passwordless-app
# or
pnpm create next-app --example authsignal-passwordless authsignal-passwordless-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

## Configuration

Log in to the [Authsignal Portal](https://portal.authsignal.com) and [enable email magic links for your tenant](https://portal.authsignal.com/organisations/tenants/authenticators).

Copy the .env.local.example file to .env.local:

```
cp .env.local.example .env.local
```

Set `AUTHSIGNAL_SECRET` as your [Authsignal secret key](https://portal.authsignal.com/organisations/tenants/api).

The `SESSION_TOKEN_SECRET` is used to encrypt the session cookie. Set it to a random string of 32 characters.

## Notes

To learn more about Authsignal take a look at the [API Documentation](https://docs.authsignal.com/).
