# with Firebase Hosting example

The goal is to host the Next.js app on Firebase Cloud Functions with Firebase Hosting rewrite rules so our app is served from our Firebase Hosting URL. Each individual `page` bundle is served in a new call to the Cloud Function which performs the initial server render.

If you are having issues, feel free to tag @jthegedus in the [issue you create on the next.js repo](https://github.com/vercel/next.js/issues/new)

<details>
<summary><b>Make sure that firebase is set up and you have the projectID</b></summary>

- Install Firebase Tools: `npm i -g firebase-tools`
- Create a project through the [firebase web console](https://console.firebase.google.com/)
- Login to the Firebase CLI tool with `firebase login`
- Grab the **projectID** from [`firebase projects:list`](https://firebase.google.com/docs/cli#admin-commands) or the web consoles URL: `https://console.firebase.google.com/project/<projectID>`
  </details>

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-firebase-hosting with-firebase-hosting-app
# or
yarn create next-app --example with-firebase-hosting with-firebase-hosting-app
```

**Important:** Update `.firebaserc` and add your firebase project ID.

To run Firebase locally for testing:

```bash
npm run serve
# or
yarn serve
```

To deploy it to the cloud with Firebase:

```bash
npm run deploy
# or
yarn deploy
```

## Typescript

To use Typescript, simply follow [Typescript setup](https://nextjs.org/learn/excel/typescript/setup) as normal (package.json scripts are already set).

i.e: `npm install --save-dev typescript @types/react @types/node`

Then you can create components and pages in `.tsx` or `.ts`

**Only `src/next.config.js` and `firebaseFunctions.js` must remain in `*.js` format.**

## Good to know

- [`firebase.json`](firebase.json:#L7) outlines the catchall rewrite rule for our Cloud Function.
- The empty `public/.gitignore` file is to ensure `public/` dir exists as it is required for Firebase Hosting. It is [configured](firebase.json:#L4) (by [default](https://firebase.google.com/docs/hosting/full-config#ignore)) that dotfiles (`public/.*`) are ignored from being publicly served.
- The Cloud Function is named `nextjsFunc` (changeable in [firebaseFunctions.js](firebaseFunctions.js#L16) and [firebase.json](firebase.json#L8)).
- `public/*` files are statically served through [Firebase hosting](https://firebase.google.com/docs/hosting/full-config#public), not through [NextJs server](https://nextjs.org/docs/basic-features/static-file-serving).

#### Customization

Next App is in `src/` directory.

The crucial files for the setup:

- `.firebaserc`
- `firebase.json`
- `firebaseFunctions.js`
- `src/next.config.js`
- In `package.json`: `firebase-*` packages.

## References

- [geovanisouza92/serverless-firebase](https://github.com/geovanisouza92/serverless-firebase) repo
- [jthegedus/firebase-functions-next-example](https://github.com/jthegedus/firebase-functions-next-example) repo
- [this medium article](https://medium.com/@jthegedus/next-js-on-cloud-functions-for-firebase-with-firebase-hosting-7911465298f2)
- [Crash Course: Node.js apps on Firebase Hosting](https://youtu.be/LOeioOKUKI8)
- [Official documentation](https://firebase.google.com/docs/cli).
