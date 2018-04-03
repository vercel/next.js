# With Firebase Hosting example

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-firebase-hosting with-firebase-hosting-app
# or
yarn create next-app --example with-firebase-hosting with-firebase-hosting-app
```

### Download manually

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-firebase-hosting
cd with-firebase-hosting
```

Set up firebase:

* install Firebase Tools: `npm i -g firebase-tools`
* create a project through the [firebase web console](https://console.firebase.google.com/)
* grab the projects ID from the web consoles URL: https://console.firebase.google.com/project/<projectId>
* update the `.firebaserc` default project ID to the newly created project
* login to the Firebase CLI tool with `firebase login`

#### Install project:

```bash
npm install
```

#### Run Next.js development:

```bash
npm run dev
```

#### Run Firebase locally for testing:

```
npm run serve
```

#### Deploy it to the cloud with Firebase:

```bash
npm run deploy
```

#### Clean dist folder

```bash
npm run clean
```

## The idea behind the example

The goal is to host the Next.js app on Firebase Cloud Functions with Firebase Hosting rewrite rules so our app is served from our Firebase Hosting URL. Each individual `page` bundle is served in a new call to the Cloud Function which performs the initial server render.

This is based off of the work at https://github.com/geovanisouza92/serverless-firebase & https://github.com/jthegedus/firebase-functions-next-example as described [here](https://medium.com/@jthegedus/next-js-on-cloud-functions-for-firebase-with-firebase-hosting-7911465298f2).

If you're having issues, feel free to tag @jthegedus in the [issue you create on the next.js repo](https://github.com/zeit/next.js/issues/new)

## Important

* The empty `placeholder.html` file is so Firebase Hosting does not error on an empty `public/` folder and still hosts at the Firebase project URL.
* `firebase.json` outlines the catchall rewrite rule for our Cloud Function.
* The [Firebase predeploy](https://firebase.google.com/docs/cli/#predeploy_and_postdeploy_hooks) hooks run most of the npm scripts when `npm run deploy` runs `firebase deploy`. The only scripts you should need are `dev`, `clean` and `deploy`.
