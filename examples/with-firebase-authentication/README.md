# With Firebase Authentication

## Background

Using Firebase with server-side rendering can be challenging, because the Firebase user and user ID token are accessible only on the client side by default.

If your app will *only* use the Firebase user information on the client side—for example, fetching data after you serve a static page—the easiest approach is simply to use the [Firebase JS SDK](https://firebase.google.com/docs/web/setup).

If your app may need the Firebase user during server-side rendering, however, we recommend using [next-firebase-auth](https://github.com/gladly-team/next-firebase-auth). This package manages auth cookies, refreshes the Firebase user ID token server-side (as needed), and provides universal access to the authenticated Firebase user.

## Getting Started

**To get started:**

1. `yarn add next-firebase-auth` or `npm install next-firebase-auth`
2. Follow the [getting started guide](https://github.com/gladly-team/next-firebase-auth#get-started)

Example: see a [live demo](https://nfa-example.vercel.app/) and its [source code](https://github.com/gladly-team/next-firebase-auth/tree/main/example)

Documentation: [gladly-team/next-firebase-auth](https://github.com/gladly-team/next-firebase-auth)

On NPM: [next-firebase-auth](https://www.npmjs.com/package/next-firebase-auth)

