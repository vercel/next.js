# Firebase Static Website Hosting with Next.js dynamic routes

This is simple setup for hosting static app build with next.js to Firebase hosting.
This project also shows work-around for supporting dynamic pages which are normally not supported in static export.

<details>
<summary><b>Make sure that firebase is set up and you have the projectID</b></summary>

- Install Firebase Tools: `npm i -g firebase-tools`
- Create a project through the [firebase web console](https://console.firebase.google.com/)
- Login to the Firebase CLI tool with `firebase login`
- Grab the **projectID** from [`firebase projects:list`](https://firebase.google.com/docs/cli#admin-commands) or the web consoles URL: `https://console.firebase.google.com/project/<projectID>`
  </details>

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/hostinger-static-hosting&project-name=hostinger-static-hosting&repository-name=hostinger-static-hosting)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example hostinger-static-hosting hostinger-static-hosting-app
```

```bash
yarn create next-app --example hostinger-static-hosting hostinger-static-hosting-app
```

```bash
pnpm create next-app --example hostinger-static-hosting hostinger-static-hosting-app
```

## References

- [How to support dynamic routes](https://stackoverflow.com/a/75306956/9640177)
