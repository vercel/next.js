# Passport.js Example

## How to use

### Using `create-next-app`

Download [`create-next-app`](https://github.com/segmentio/create-next-app) to bootstrap the example:

```bash
npm i -g create-next-app
create-next-app --example with-passport with-passport-app
```

### Download manually

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-passport
cd with-passport
```

Install the dependencies:

```bash
npm install
# or
yarn
```

### Run locally

The recommended way to run the example is using [now](https://zeit.co/now) ([download](https://zeit.co/download)):

```bash
now dev
```

With the above command we can start our application and add the required environment variables

### Deploy

To do a deployment we'll use [now](https://zeit.co/now), you need to add the secrets in [now.json](./now.json) to your account first:

```bash
now secrets add @access-token-secret YOUR_SECRET
now secrets add @github-client-id YOUR_API_KEY
now secrets add @github-client-secret YOUR_CLIENT_SECRET
```

To get the secrets from above you'll have to create an OAuth app in GitHub, you can see how to do it [here](https://developer.github.com/apps/building-oauth-apps/creating-an-oauth-app/), the recommended approach is to create 2 apps, one for production and another one for localhost, for production we use [now secrets](https://zeit.co/docs/v2/environment-variables-and-secrets) and for localhost a local [.env](./.env) file

> Make sure `ROOT_URL` in `now.json` is set to the domain the app will use in production, in development it always defaults to `http://localhost:3000`

Then deploy it:

```bash
now
```

## The idea behind the example

In this example we use [Passport](http://www.passportjs.org) and GitHub to authenticate users and store a [JWT](https://jwt.io) token in a cookie, you can check the folder `pages/api` to see how it works

The example uses both Client Side Rendering (CSR) and Server Side Rendering (SSR) to handle the authentication. There are 2 pages that show how every method works:

- [pages/index.js](./pages/index.js): The header changes after the login token is found in cookies, this happens in the client and because of it the page can be prerendered (exported to static HTML)

- [pages/profile.js](./pages/profile.js): This page fetches the user using `getInitialProps` (SSR), if there's no user it will do a redirect, and if there's an user the page will be rendered with the user's data. Compared to `index.js`, this page won't have a blink in the header because the user will be available since the first render, but it also can't be prerendered, meaning it will require more server resources and have a slower first render

If you run `yarn build`/`npm run build`, you'll notice that Next.js will export a static HTML file in the case of `pages/index.js`, and a lambda for `pages/profile.js`
