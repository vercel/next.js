---
description: Learn about authentication patterns in Next.js apps and explore a few examples.
---

# Authentication

Authentication verifies who a user is, while authorization controls what a user can access. Next.js supports multiple patterns for authentication, each designed for different use cases. This guide will allow you to choose your adventure based on your constraints.

## Patterns

The first step to identifying which authentication pattern you need is understanding the [data-fetching strategy](/docs/basic-features/data-fetching) you want. We can then determine which authentication providers support this strategy. There are two main strategies:

- Use [static generation](/docs/basic-features/pages#static-generation-recommended) to [server-render](/docs/basic-features/pages#static-generation-without-data) a loading state, followed by fetching user data client-side.
- Fetch user data server-side to eliminate a flash of unauthenticated content.

### Static Generation

Next.js automatically determines that a page is static if there are no blocking data requirements. This means the absence of `getServerSideProps` and `getInitialProps` in the page. Instead, your page can render a loading state from the server, followed by fetching the user client-side.

One advantage of this pattern is it allows pages to be served from a global CDN and [preloaded](/docs/api-reference/next/link) using `<Link />`. Depending on the size of your application, [React hydration](https://reactjs.org/docs/react-dom.html#hydrate) could take some time. If you serve a loading shell from the server, this allows React to hydrate while you're fetching user data. In practice, this results in a faster TTI ([Time to Interactive](https://web.dev/interactive/)).

Let's look at an example for a profile page. This will initially render a loading skeleton. Once the request for a user has finished, it will show the user's name.

```jsx
// pages/profile.js

import useUser from '../lib/useUser'
import Layout from '../components/Layout'

export default Profile = () => {
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
      <pre>{JSON.stringify(user, undefined, 2)}</pre>
    </Layout>
  )
}
```

You can view this example in action [here](https://next-iron-session.now.sh/).

### Server-side Rendering

If you export an `async` function called `getServerSideProps` from a page, Next.js will pre-render this page on each request using the data returned by `getServerSideProps`.

```jsx
export async function getServerSideProps(context) {
  return {
    props: {} // Will be passed to the page component as props
  };
}
```

Let's transform the profile example to use [server-side rendering](/docs/basic-features/pages#server-side-rendering). If there's a session, return `user` as a prop to the `Profile` component in the page. Notice there is not a loading skeleton in [this example](https://next-iron-session.now.sh/).

```jsx
// pages/profile.js

import useUser from '../lib/useUser'
import Layout from '../components/Layout'

export default Profile = () => {
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
      <pre>{JSON.stringify(user, undefined, 2)}</pre>
    </Layout>
  )
}

export const getServerSideProps = withSession(async function ({ req, res }) {
  // Get the user's session based on the request
  const user = req.session.get('user')

  return {
    props: { user },
  }
})
```

An advantage of this pattern is preventing a flash of unauthenticated content before redirecting. It's important to note fetching user data in `getServerSideProps` will block rendering until the request to your authentication provider resolves. To prevent creating a bottleneck and decreasing your TTFB ([Time to First Byte](https://web.dev/time-to-first-byte/)), you should ensure your authentication lookup is fast. Otherwise, consider static generation.

There is an [open RFC](https://github.com/vercel/next.js/discussions/14890) to improve redirecting inside `getServerSideProps`.

## Providers

Now that we've discussed authentication patterns, let's look at specific providers and explore how they're used with Next.js.

### Firebase

<details open>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-firebase-authentication">with-firebase-authentication</a></li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-firebase-authentication-ssr">with-firebase-authentication-ssr</a></li>
  </ul>
</details>

When using Firebase Authentication], we recommend using the static generation pattern.

It is possible to use the Firebase Client SDK to generate an ID token and forward it directly to Firebase's REST API on the server to log-in. However, requests to Firebase might take some time to resolve, depending on your user's location.

You can either use [FirebaseUI](https://github.com/firebase/firebaseui-web-react) for a drop-in UI, or create your own with a [custom React hook](https://usehooks.com/useAuth/).


### Bring Your Own Database

<details open>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-next-auth">with-next-auth</a></li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-iron-session">with-iron-session</a></li>
  </ul>
</details>

If you have an existing database with user data, you'll likely want to utilize an open-source solution that's provider agnostic.

- If you need email/password log-in, use `next-iron-session`.
- If you need to persist session data on the server, use `next-auth`.
- If you need to support social login (Google, Facebook, etc.), use `next-auth`.
- If you want to use [JWTs](https://jwt.io/), use `next-auth`.

Both of these libraries support either authentication pattern.

### Magic (Passwordless)

<details open>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-magic">with-magic</a></li>
  </ul>
</details>

Magic, which uses [passwordless login](https://magic.link/), supports the static generation pattern. Similar to Firebase, a [unique identifier](https://w3c-ccg.github.io/did-primer/) has to be created on the client-side and then forwarded as a header to log-in. Then, Magic's Node SDK can be used to exchange the indentifier for a user's information. 

### Auth0

<details open>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/auth0">auth0</a></li>
  </ul>
</details>

Auth0 can support both authentication patterns. You can also utilize [API routes](/docs/api-routes/introduction) for logging in/out and retrieving user information. After logging in using the [Auth0 SDK](@auth0/nextjs-auth0), you can utilize static generation or `getServerSideProps` for server-side rendering.

## Learn more

We recommend you to read the following section next:

<div class="card">
  <a href="/docs/basic-features/data-fetching.md">
    <b>Data Fetching:</b>
    <small>Learn more about data fetching in Next.js.</small>
  </a>
</div>
