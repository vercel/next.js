---
description: Learn about authentication patterns in Next.js apps and explore a few examples.
---

# Authentication

Authentication verifies who a user is, while authorization controls what a user can access. Next.js supports authentication patterns for both [Pages](/docs/basic-features/pages.md) and [API Routes](/docs/api-routes/introduction.md). This page will go through each case so that you can choose based on your constraints.

## Authenticating Pages

The first step to adding authentication to your page is to identify the [data-fetching strategy](/docs/basic-features/data-fetching.md) you want. We can then determine which authentication providers support this strategy. The authentication patterns for each strategy are:

- Use [static generation (recommended)](/docs/basic-features/pages.md#static-generation-recommended) to server-render a loading state, then fetch the user data and authenticated content client-side. Additional navigations using [`next/link`](/docs/api-reference/next/link.md) or [`next/router`](/docs/api-reference/next/router.md) will not need to re-fetch user data.
- Fetch user data and authenticated content [server-side](/docs/basic-features/pages.md#server-side-rendering) to eliminate the initial flash of loading state.

### Statically Generated Pages

Next.js automatically determines that a page is static if there are no blocking data requirements. This means the absence of [`getServerSideProps`](/docs/basic-features/data-fetching.md#getserversideprops-server-side-rendering) and `getInitialProps` in the page. Instead, your page can render a loading state from the server, followed by fetching the user client-side.

One advantage of this pattern is it allows pages to be served from a global CDN and preloaded using [`next/link`](/docs/api-reference/next/link.md). In practice, this results in a faster TTI ([Time to Interactive](https://web.dev/interactive/)).

Let's look at an example for a profile page. This will initially render a loading skeleton. Once the request for a user has finished, it will show the user's name:

```jsx
// pages/profile.js

import useUser from '../lib/useUser'
import Layout from '../components/Layout'

const Profile = () => {
  // Fetch the user client-side
  const { user } = useUser({ redirectTo: '/login' })

  // Server-render loading state
  if (!user || user.isLoggedIn === false) {
    return <Layout>Loading...</Layout>
  }

  // Once the user request finishes, show the user
  return (
    <Layout>
      <h1>Your Profile</h1>
      <pre>{JSON.stringify(user, null, 2)}</pre>
    </Layout>
  )
}

export default Profile
```

You can view this [example in action](https://next-with-iron-session.vercel.app/). Check out the [`with-iron-session`](https://github.com/vercel/next.js/tree/canary/examples/with-iron-session) example to see how it works.

### Server-Rendered Pages

If you export an `async` function called [`getServerSideProps`](/docs/basic-features/data-fetching.md#getserversideprops-server-side-rendering) from a page, Next.js will pre-render this page on each request using the data returned by `getServerSideProps`.

```jsx
export async function getServerSideProps(context) {
  return {
    props: {}, // Will be passed to the page component as props
  }
}
```

Let's transform the profile example to use [server-side rendering](/docs/basic-features/pages#server-side-rendering). If there's a session, return `user` as a prop to the `Profile` component in the page. Notice there is not a loading skeleton in [this example](https://next-with-iron-session.vercel.app/).

```jsx
// pages/profile.js

import withSession from '../lib/session'
import Layout from '../components/Layout'

export const getServerSideProps = withSession(async function ({ req, res }) {
  // Get the user's session based on the request
  const user = req.session.get('user')

  if (!user) {
    return {
      redirect: {
        destination: '/login',
        permanent: false,
      },
    }
  }

  return {
    props: { user },
  }
})

const Profile = ({ user }) => {
  // Show the user. No loading state is required
  return (
    <Layout>
      <h1>Your Profile</h1>
      <pre>{JSON.stringify(user, null, 2)}</pre>
    </Layout>
  )
}

export default Profile
```

An advantage of this pattern is preventing a flash of unauthenticated content before redirecting. It's important to note fetching user data in `getServerSideProps` will block rendering until the request to your authentication provider resolves. To prevent creating a bottleneck and decreasing your TTFB ([Time to First Byte](https://web.dev/time-to-first-byte/)), you should ensure your authentication lookup is fast. Otherwise, consider [static generation](#authenticating-statically-generated-pages).

## Authenticating API Routes

API routes are typically authenticated using a secret stored in a cookie or delivered through the `Authorization` header.

Authentication providers offer helpers to verify this secret and return authenticated user data to your API route.

Let's look at an example that uses middleware to decorate the request object with user data.

```js
import { withSession } from '@clerk/next/api'

function handler(req, res) {
  if (req.session) {
    // Signed in
    console.log('User ID', req.session.userId)
  } else {
    // Signed out
    res.status(401)
  }
  res.end()
}

// Use middleware decorate `req` with `session`
export default withSession(handler)
```

You can view this example [in action](#). Check out the [`clerk`](#) example to see how it works.

## Authentication Providers

Now that we've discussed authentication patterns, let's look at specific providers and explore how they're used with Next.js.

### Bring Your Own Database

<details open>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-iron-session">with-iron-session</a></li>
    <li><a href="https://github.com/nextauthjs/next-auth-example">next-auth-example</a></li>
  </ul>
</details>

If you have an existing database with user data, you'll likely want to utilize an open-source solution that's provider agnostic.

- If you want a low-level, encrypted, and stateless session utility use [`next-iron-session`](https://github.com/vercel/next.js/tree/canary/examples/with-iron-session).
- If you want a full-featured authentication system with built-in providers (Google, Facebook, GitHub…), JWT, JWE, email/password, magic links and more… use [`next-auth`](https://github.com/nextauthjs/next-auth-example).

Both of these libraries support either authentication pattern. If you're interested in [Passport](http://www.passportjs.org/), we also have examples for it using secure and encrypted cookies:

- [with-passport](https://github.com/vercel/next.js/tree/canary/examples/with-passport)
- [with-passport-and-next-connect](https://github.com/vercel/next.js/tree/canary/examples/with-passport-and-next-connect)

### Other Providers

To see examples with other authentication providers, check out the [examples folder](https://github.com/vercel/next.js/tree/canary/examples).

<details open>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-firebase-authentication">with-firebase-authentication</a></li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-magic">with-magic</a></li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/auth0">auth0</a></li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-supabase-auth-realtime-db">with-supabase-auth-realtime-db</a></li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-userbase">with-userbase</a></li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-supertokens">with-supertokens</a></li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-nhost-auth-realtime-graphql">with-nhost-auth-realtime-graphql</a></li>
  </ul>
</details>

## Related

For more information on what to do next, we recommend the following sections:

<div class="card">
  <a href="/docs/basic-features/pages.md">
    <b>Pages:</b>
    <small>Learn more about pages and the different pre-rendering methods in Next.js.</small>
  </a>
</div>

<div class="card">
  <a href="/docs/basic-features/data-fetching.md">
    <b>Data Fetching:</b>
    <small>Learn more about data fetching in Next.js.</small>
  </a>
</div>
