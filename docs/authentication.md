---
description: Learn about authentication patterns in Next.js apps and explore a few examples.
---

# Authentication

Authentication verifies who a user is, while authorization controls what a user can access. Next.js supports multiple patterns for authentication, each designed for different use cases. This guide will allow you to choose your adventure based on your constraints.

## Patterns

The first step to identifying which authentication pattern you need is understanding the data-fetching strategy you want. We can then determine which authentication providers support this strategy. There are two main strategies:

- Use static generation to server-render a loading state, followed by fetching user data client-side.
- Fetch user data server-side to eliminate a flash of unauthenticated content.

### Static Generation

Next.js automatically determines that a page is static if there are no blocking data requirements. This means the absence of `getServerSideProps` and `getInitialProps` in the page. Instead, your page can render a loading state from the server, followed by fetching the user client-side.

One advantage of this pattern is it allows pages to be served from a global CDN and [preloaded](https://nextjs.org/docs/api-reference/next/link) using `<Link />`. Depending on the size of your application, [React hydration](https://reactjs.org/docs/react-dom.html#hydrate) could take some time. If you serve a loading shell from the server, this allows React to hydrate while you're fetching user data. In practice, this results in a faster TTI ([Time to Interactive](https://web.dev/interactive/)).

Let's look at an example for a profile page. This will initially render a loading skeleton. Once the request for a user has finished, it will show the user's name.

```jsx
// pages/profile.js

export default Profile = () => {
  // Fetch the user client-side
  const { user } = useUser({ redirectTo: '/login' });

  // Server-render loading skeleton
  if (!user) {
    return <LoadingSkeleton />;
  }

  // Once the user request finishes, show the user's name
  return <p>{user.name}</p>;
};
```

### Server-side Rendering

If you export an `async` function called `getServerSideProps` from a page, Next.js will pre-render this page on each request using the data returned by `getServerSideProps`.

```jsx
export async function getServerSideProps(context) {
  return {
    props: {} // Will be passed to the page component as props
  };
}
```

Let's transform the profile example from earlier to use server-side rendering. If there's a session, return `session` as a prop to the `Profile` component in the page. Otherwise, redirect to `/login` on the server-side. Notice there is not a loading skeleton in this example.

```jsx
// pages/profile.js

export default Profile = ({ session }) => {
  return <p>{session.user.name}</p>;
};

export async function getServerSideProps({ req, res }) {
  // Get the user's session based on the request
  const session = await getSession(req);

  if (!session) {
    // If no user, redirect to login
    res.writeHead(307, { Location: '/login' });
    res.end();
    return { props: {} };
  }

  // If there is a user, return the current session
  return { props: { session } };
}
```

An advantage of this pattern is preventing a flash of unauthenticated content before redirecting. It's important to note fetching user data in `getServerSideProps` will block rendering until the request to your authentication provider resolves. To prevent creating a bottleneck and decreasing your TTFB ([Time to First Byte](https://web.dev/time-to-first-byte/)), you should ensure your authentication lookup is fast. Otherwise, consider static generation.

There is an [open RFC](https://github.com/vercel/next.js/discussions/14890) to improve redirecting inside `getServerSideProps`.

## Providers

Now that we've discussed authentication patterns, let's look at specific providers and explore how they're used with Next.js.

### Firebase

When using [Firebase Authentication](/blog/nextjs-firebase-serverless), we recommend using the static generation pattern. There currently isn't a way to log-in server-side using the Firebase Admin SDK.

It is possible to use the Firebase Client SDK to generate an ID token and forward it directly to Firebase's REST API on the server to log-in. However, requests to Firebase might take some time to resolve, depending on your user's location.

Let's look an example creating a `useUser` hook. This hook allows you to fully control where you'll call `signinWithGitHub`, or any other authentication provider with Firebase.

```jsx
import React, { useState, useEffect, useContext, createContext } from 'react';
import firebase from './firebase';

const authContext = createContext();

// You can wrap your _app.js with this provider
export function AuthProvider({ children }) {
  const auth = useProvideAuth();
  return <authContext.Provider value={auth}>{children}</authContext.Provider>;
}

// Custom React hook to access the context
export const useAuth = () => {
  return useContext(authContext);
};

function useProvideAuth() {
  // Store the user in state
  const [user, setUser] = useState(null);

  const signinWithGitHub = () => {
    return firebase
      .auth()
      .signInWithPopup(new firebase.auth.GithubAuthProvider())
      .then((response) => setUser(response.user));
  };

  const signout = () => {
    return firebase
      .auth()
      .signOut()
      .then(() => setUser(false));
  };

  useEffect(() => {
    const unsubscribe = firebase.auth().onAuthStateChanged(handleUser);
    return () => unsubscribe();
  }, []);

  return {
    user,
    signinWithGitHub,
    signout
  };
}
```

If you don't want to create the interface yourself, you can use [FirebaseUI](https://github.com/firebase/firebaseui-web).

<details open>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-firebase-authentication">with-firebase-authentication</a></li>
  </ul>
</details

### Bring Your Own Database

If you have an existing database with user data, you'll likely want to utilize an open-source solution that's provider agnostic.

- If you need email/password log-in, use `next-iron-session`.
- If you need to persist session data on the server, use `next-auth`.
- If you need to support social login (Google, Facebook, etc.), use `next-auth`.
- If you want to use [JWTs](https://jwt.io/), use `next-auth`.

Both of these libraries support either authentication pattern.

<details open>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-next-auth">with-next-auth</a></li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-iron-session">with-iron-session</a></li>
  </ul>
</details>

### Magic (Passwordless)

Magic, which uses [passwordless login](https://magic.link/), supports the static generation pattern. Similar to Firebase, a [unique identifier](https://w3c-ccg.github.io/did-primer/) has to be created on the client-side and then forwarded as a header to log-in.

```jsx
const did = await new Magic(
  process.env.NEXT_PUBLIC_MAGIC_PUB_KEY
).auth.loginWithMagicLink({ email: 'your@email.com' });

const authRequest = await fetch('/api/login', {
  method: 'POST',
  headers: { Authorization: `Bearer ${did}` }
});
```

Then, we can use Magic's Node SDK to exchange the unique identifier for information about the user. Finally, we'll want to persist the user's session by creating a cookie. You can either [write this logic yourself](https://github.com/vercel/next.js/blob/canary/examples/with-magic/lib/auth-cookies.js) or use [next-iron-session](https://github.com/vercel/next.js/tree/canary/examples/with-iron-session).

```jsx
// pages/api/login.js

import { Magic } from '@magic-sdk/admin';

let magic = new Magic(process.env.MAGIC_SECRET_KEY);

export default async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  // Exchange the DID from Magic for some user data
  const did = magic.utils.parseAuthorizationHeader(req.headers.authorization);
  const user = await magic.users.getMetadataByToken(did);

  // Create a cookie to persist a user's session

  res.end();
};
```

<details open>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-magic">with-magic</a></li>
  </ul>
</details>

### Auth0

Auth0 can support both authentication patterns. You can also utilize [API routes](https://nextjs.org/docs/api-routes/introduction) for logging in/out and retrieving user information. For example, after initializing the [Auth0 SDK](@auth0/nextjs-auth0), you can log-in by calling `handleLogin`.

```jsx
// pages/api/login.js

import auth0 from '../../lib/auth0';

export default async function login(req, res) {
  try {
    await auth0.handleLogin(req, res);
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).end(error.message);
  }
}
```

Auth0 populates the session so you can utilize static generation or `getServerSideProps` for server-side rendering. Here's an example of the latter.

```jsx
// pages/profile.js

import auth0 from '../../lib/auth0';

export async function getServerSideProps({ req, res }) {
  const session = await auth0.getSession(req);

  if (!session || !session.user) {
    res.writeHead(307, { Location: '/api/login' });
    res.end();
    return { props: {} };
  }

  return { props: { user: session.user } };
}
```

<details open>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/auth0">auth0</a></li>
  </ul>
</details>

## Frequently Asked Questions

### How can I fetch user data once for every page in my application?

To fetch data once for your entire Next.js application, create a [custom `App`](https://nextjs.org/docs/advanced-features/custom-app) and use `getInitialProps`.
You should only use this method if you have blocking data requirements for _every single page_ in your application.
This will disable [static optimization](https://nextjs.org/docs/advanced-features/automatic-static-optimization).
We are [working on adding support](https://github.com/vercel/next.js/discussions/10949#discussioncomment-44898) for `getStaticProps` inside `_app.js`.

Here's an example using a provider like Auth0.

```jsx
// _app.js

App.getInitialProps = async ({ req, res }) => {
  // Only run on the server
  if (typeof window === 'undefined') {
    const session = await auth0.getSession(req);
    if (!session || !session.user) {
      res.writeHead(307, { Location: '/api/login' });
      res.end();

      return;
    }

    return { user: session.user };
  }
};
```

If you require some pages to render as static HTML, you should use `getServerSideProps`
in every page requiring server-rendering. You can extract this logic to a shared function to improve code reuse.

```jsx
// lib/auth.js
export const requirePageAuth = (inner) => {
  return async (context) => {
    const session = await getSession(context.req);

    if (!session) {
      context.res.writeHead(307, { Location: '/login' });
      context.res.end();
      return { props: {} };
    }

    return inner ? inner(context, auth) : { props: { session } };
  };
};
```

```jsx
// pages/profile.js

export default Profile = ({ session }) => {
  return <p>{session.user.name}</p>;
};

export const getServerSideProps = requirePageAuth;
```
