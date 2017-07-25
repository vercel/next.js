# With Firebase Hosting example

## How to use

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/with-firebase-hosting
cd with-firebase-hosting
```

It is recommended to use a package manager that uses a lockfile and caching for faster dev/test cycles:
- [Yarn](https://github.com/yarnpkg/yarn)
- [npm5.1.x](https://github.com/npm/npm)
- [pnpm](https://github.com/pnpm/pnpm)

Set up firebase:
- create a project through the [firebase web console](https://console.firebase.google.com/)
- grab the projects ID from the web consoles URL: https://console.firebase.google.com/project/<projectId>
- update the `.firebaserc` default project ID to the newly created project

Install project:

```bash
npm install
```

Run Next.js development:

```bash
npm run next
```

Run Firebase locally for testing:

```bash
npm run serve
```

Deploy it to the cloud with Firebase

```bash
npm run deploy
```

## The idea behind the example
The goal is to host the Next.js app on Firebase Cloud Functions with Firebase Hosting rewrite rules so our app is served from our Firebase Hosting URL. Each individual `page` bundle is served in a new call to the Cloud Function which performs the initial server render.

This is based off of the work at https://github.com/geovanisouza92/serverless-firebase & https://github.com/jthegedus/firebase-functions-next-example as described [here](https://medium.com/jthegedus/)

## Important & Caveats
*   The empty `placeholder.html` file is so Firebase Hosting does not error on an empty `public/` folder and still hosts at the Firebase project URL.
*   `firebase.json` outlines the catchall rewrite rule for our Cloud Function.
*   Testing on Firebase locally requires a complete build of the Next.js app. `npm run serve` handles everything required.
*   Any npm modules dependencies used in the Next.js app (`app/` folder) must also be installed as dependencies for the Cloud Functions project (`functions` folder).
