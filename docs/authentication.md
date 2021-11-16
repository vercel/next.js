---
description: Learn about authentication patterns in Next.js apps and explore a few examples.
---

# Authentication

Authentication verifies who a user is, while authorization controls what a user can access. Next.js supports multiple authentication patterns, each designed for different use cases. This page will go through each case so that you can choose based on your constraints.

## Authentication Patterns

The first step to identifying which authentication pattern you need is understanding the [data-fetching strategy](/docs/basic-features/data-fetching.md) you want. We can then determine which authentication providers support this strategy. There are two main patterns:

- Use [static generation](/docs/basic-features/pages.md#static-generation-recommended) to server-render a loading state, followed by fetching user data client-side.
- Fetch user data [server-side](/docs/basic-features/pages.md#server-side-rendering) to eliminate a flash of unauthenticated content.

### Authenticating Statically Generated Pages

Next.js automatically determines that a page is static if there are no blocking data requirements. This means the absence of [`getServerSideProps`](/docs/basic-features/data-fetching.md#getserversideprops-server-side-rendering) and `getInitialProps` in the page. One advantage of statically-generating pages is it allows them to be served from a global CDN and preloaded using [`next/link`](/docs/api-reference/next/link.md). In practice, this results in a faster TTI ([Time to Interactive](https://web.dev/interactive/)).

There are generally two situations in which you want to authenticate a page without using `getServerSideProps` or `getInitialProps`:

1. The page has user-specific data that must be fetched with their authentication information, for example a profile page. In this case, your page can render a loading state from the server, followed by fetching the user-specific data client-side.  
2. The page has non user-specific data that users need to be authenticated to view, for example a static article behind a paywall. The content doesn't change user to user, and thus we would like to statically generate the page for speed, while still checking a user is authenticated before displaying it.

#### Case 1: User-specific pages

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

You can view this [example in action](https://iron-session-example.vercel.app/). Check out the [`with-iron-session`](https://github.com/vercel/next.js/tree/canary/examples/with-iron-session) example to see how it works.

#### Case 2: Static data behind authentication

Let's now look at an example of static articles that sit behind a paywall. This example uses middleware to check a user's authentication state before sending them a statically-generated page. On Edge platforms like Vercel, this middleware will be run as an [Edge Function](https://vercel.com/features/edge-functions). 

```jsx
// pages/articles/_middleware.js

import { verifyAuth } from '@lib/auth'
import { NextRequest, NextResponse } from 'next/server'

export function middleware(req) {
  const basicAuth = req.headers.get('authorization')

  if (basicAuth) {
    const isAuthenticated = verifyAuth(basicAuth)

    if (isAuthenticated) {
      return NextResponse.next()
    }
  }
  
  return return NextResponse.redirect("/login")
}
```

```jsx
// pages/articles/[id]

export default function Article({article}){

  // we can still get user-specific data without delaying
  // the display of the article. For example, to show their
  // username in the page's header bar.
  const user = useUser()
  
  return (
    <Layout user={user}>
      <Article article={article} />
    </Layout>
  );
}

export async function getStaticProps(context) {
  // fetch the article from your CMS
  const article = await fetchArticle(context.params.id)
  
  return {
    props: {
      article
    }, // will be passed to the page component as props
  }
}

// this will pre-render all of the articles at build time.
export async function getStaticPaths() {
  const articles = await fetchAllArticles()

  // Get the paths we want to pre-render based on articles
  const paths = articles.map((article) => ({
    params: { id: article.id },
  }))

  // We'll pre-render only these paths at build time.
  // { fallback: false } will respond with a 404 for
  // any ids that don't match a pre-renderered page.
  return { paths, fallback: false }
}
```

The advantage of this approach is twofold:

1. Authentication happens server-side, and thus there is only one round-trip to the client before they see the main article. If we used the previous approach and sent a loading indicator initially, a second round-trip would be needed to fetch the article data with their authentication information.
2. The article HTML is pre-generated at build time, so it can be served and rendered immediately once the user is authenticated with the middleware. In the previous approach, the article would have been rendered on the client after being fetched client-side. If you instead use `getServerSideProps`, the article is rendered server-side, but is being rendered on every request. 

Therefore, the middleware authentication approach will result in the fastest LCP ([Largest Contentful Paint](https://web.dev/lcp/)), which essentially means the user will get the content they requested as fast as possible.

### Authenticating Server-Rendered Pages

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
  if (!req.session.user) {
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

An advantage of this pattern is preventing a flash of unauthenticated content before redirecting. It's important to note fetching user data in `getServerSideProps` will block rendering until the request to your authentication provider resolves. To prevent creating a bottleneck and increasing your TTFB ([Time to First Byte](https://web.dev/time-to-first-byte/)), you should ensure your authentication lookup is fast. Otherwise, consider [static generation](#authenticating-statically-generated-pages).

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

- If you want a low-level, encrypted, and stateless session utility use [`iron-session`](https://github.com/vercel/next.js/tree/canary/examples/with-iron-session).
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
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-clerk">with-clerk</a></li>
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
