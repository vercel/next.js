[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-cookie-auth-redux)

# With Cookie Authentication and Redux example

## How to use

### Using `create-next-app`

Download [`create-next-app`](https://github.com/segmentio/create-next-app) to bootstrap the example:

```
npm i -g create-next-app
create-next-app --example with-cookie-auth-redux with-cookie-auth-redux-app
```

### Download manually

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-cookie-auth-redux
cd with-cookie-auth-redux
```

Install it and run:

```bash
npm install
npm run dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
now
```

## The idea behind the example

This example adds cookie based authentication to a Next.js application. It is based from 
the [redux example](https://github.com/zeit/next.js/tree/canary/examples/with-redux-wrapper) and 
uses the redux store to maintain the current logged in user.

The first time the page loads, it calls an `/api/whoami` API from the server side with the session cookie.
If the user is logged in, the API returns the user data and populates the redux store.

When the application is ready on the client side, the pages must use the `withAuth` higher order component
to automatically make themselves private. If anonymous user navigates from a public page to a private page, he's
redirected to a login page.

`withAuth` HOC has an optional "permissions" parameter if you want to fine tune the user access. 

An special `PUBLIC` permission is required to make a public page knows about the current logged in user.

For simplicity and readability, Reducers, Actions, and Store creators are all in the same file: store.js

No styles were used for this example.
