# Overmind example

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-passport-session-auth with-passport-app
# or
yarn create next-app --example with-passport-session-auth with-passport-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-passport-session-auth
cd with-passport-session-auth
```

Set required environment variables. Use `.env.template` if you use a dotenv tool.

```
export GITHUB_CLIENTID=<your github app's client id>
export GITHUB_CLIENTSECRET=<your github app's client secret>
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
now
```

## Notes

This example demonstrates using [passport](http://www.passportjs.org/) in [NextJS API routes](https://nextjs.org/blog/next-9#api-routes) for OAuth connection flows.

Takes example of the fact that Next's micro-based API routes are compatible with connect-style middleware, with a little work.
