# Auth0 Example

## How to use

### Using `create-next-app`

Download [`create-next-app`](https://github.com/segmentio/create-next-app) to bootstrap the example:

```bash
npm i -g create-next-app
create-next-app --example with-auth0 with-auth0-app
```

### Download manually

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-auth0
cd with-auth0
```

Install the dependencies:

```bash
npm install
# or
yarn
```

### Run locally

You need to have an account with [Auth0](https://auth0.com/signup) first. Then you need to [register a regular web application](https://auth0.com/docs/dashboard/guides/applications/register-app-regular-web), we'll use that app to run the application in localhost.

In the settings of the application, go to `Allowed Callback URLs` and add:

```bash
http://localhost:3000/api/login/callback
```

Now we need to add the credentials in the settings to our app. Create a new file called `.env` in the root folder and add the following environment variables using your application credentials:

```bash
AUTH0_DOMAIN = user.auth0.com
AUTH0_CLIENT_ID = client_id
AUTH0_CLIENT_SECRET = client_secret
# Available in dashboard -> APIs -> copy the API Audience
AUTH0_AUDIENCE = https://user.auth0.com/api/v2/
# Don't need to change this one
AUTH0_REDIRECT_URI = http://localhost:3000/api/login/callback
```

The recommended way to run the example is using [now](https://zeit.co/now) ([download](https://zeit.co/download)):

```bash
now dev
```

With the above command we can start our application and add the environment variables

### Deploy

To do a deployment we'll use [now](https://zeit.co/now), you need to add the secrets in [now.json](./now.json) to your account first:

```bash
now secrets add @auth0_domain VALUE
now secrets add @auth0_client_id VALUE
now secrets add @auth0_client_secret VALUE
now secrets add @auth0_audience VALUE
now secrets add @auth0_redirect_uri VALUE
```

To get the secrets from above follow the same steps for creating an Auth0 application in [Run Locally](#run-locally). The recommended approach is to create 2 apps, one for production and another one for localhost, for production we use [now secrets](https://zeit.co/docs/v2/environment-variables-and-secrets) and for localhost a local `.env` file.

> Make sure `ROOT_URL` in `now.json` is set to the domain the app will use in production, in development it always defaults to `http://localhost:3000`

Then deploy it:

```bash
now
```

## The idea behind the example

In this example we use [Auth0](https://auth0.com) to authenticate users using cookies, you can check the folder `pages/api` to see how it works

The example uses both Client Side Rendering (CSR) and Server Side Rendering (SSR) to handle the authentication. There are 2 pages that show how every method works:

- [pages/index.js](./pages/index.js): The header changes after the login token is found in cookies, this happens in the client and because of it the page can be prerendered (exported to static HTML)

- [pages/profile.js](./pages/profile.js): This page fetches the user using `getInitialProps` (SSR), if there's no user it will do a redirect, and if there's an user the page will be rendered with the user's data. Compared to `index.js`, this page won't have a blink in the header because the user will be available since the first render, but it also can't be prerendered, meaning it will require more server resources and have a slower first render

If you run `yarn build`/`npm run build`, you'll notice that Next.js will export a static HTML file in the case of `pages/index.js`, and a lambda for `pages/profile.js`
