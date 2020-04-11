# Example app utilizing cookie-based authentication

In this example, we authenticate users and store a token in a cookie. The example only shows how the user session works, keeping a user logged in between pages.

The repo includes a minimal passwordless backend built with the [API Routes support](https://nextjs.org/docs/api-routes/introduction) (`pages/api`), and 2 options to work with the pages:

- client side rendered using swr (`personalized-swr.js`)
- server side renders using [getServerSideProps](https://nextjs.org/docs/basic-features/data-fetching#getserversideprops-server-side-rendering)

Note that the cookie is created with an API call, this part should be changed to do your own authentication. The cookie is cleared with an API call as well, because it is setup as httponly, so it can't be accesed via javascript, which is recommended to avoid session hijacking.

## Deploy your own

Deploy the example using [ZEIT Now](https://zeit.co/now):

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/import/project?template=https://github.com/zeit/next.js/tree/canary/examples/with-cookie-auth)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example with-cookie-auth with-cookie-auth-app
# or
yarn create next-app --example with-cookie-auth with-cookie-auth-app
```

### Download manually

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-cookie-auth
cd with-cookie-auth
```

### Run locally

After you clone the repository you can install the dependencies, run `yarn dev` and start hacking! You'll be able to see the application running locally as if it were deployed.

```bash
$ cd with-cookie-auth
$ (with-cookie-auth/) yarn install
$ (with-cookie-auth/) yarn dev
```

### Deploy

Deploy it to the cloud with [ZEIT Now](https://zeit.co/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
