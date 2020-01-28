# API Apollo server with Federation

this example shows how to utilize next.js api to build graphql server with federation

## Deploy your own

Deploy the example using [ZEIT Now](https://zeit.co/now):

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/new/project?template=https://github.com/zeit/next.js/tree/canary/examples/api-apollo-federation-server)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example api-apollo-federation-server api-apollo-federation-server-app
# or
yarn create next-app --example api-apollo-federation-server api-apollo-federation-server-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/api-apollo-federation-server
cd api-apollo-federation-server
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download)):

Change `{PROJECT_ROOT}/config/production.json` to your deployment target url

```json
{
  "api": "https://my-graphql-federation-server.<user-name>.now.sh"
}
```

```bash
now
```
