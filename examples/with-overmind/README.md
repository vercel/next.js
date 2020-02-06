# Overmind example

This example uses [overmind](https://overmindjs.org/?view=react&typescript=false).

## Deploy your own

Deploy the example using [ZEIT Now](https://zeit.co/now):

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/new/project?template=https://github.com/zeit/next.js/tree/canary/examples/with-overmind)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example with-overmind with-overmind-app
# or
yarn create next-app --example with-overmind with-overmind-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-overmind
cd with-overmind
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

```bash
now
```

## Notes

Look at the comments for more information on how the application is structured. This is just one of several ways you can manage hydration and rehydration of state. It depends heavily on how you want to manage it, do code sharing between client and server etc. The exampled approach should give you the hooks and flexibility to get you started on your endeavour :-)
