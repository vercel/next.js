# Serverless With Firebase Example (Typescript)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example serverless-with-firebase serverless-with-firebase-app
# or
yarn create next-app --example serverless-with-firebase serverless-with-firebase-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/serverless-with-firebase
cd serverless-with-firebase
```

### Set up firebase

* install Firebase Tools: `yarn global add firebase-tools`
* create a project through the [firebase web console](https://console.firebase.google.com/)
* grab the projects ID from the web consoles URL: https://console.firebase.google.com/project/<projectId>
* update the `.firebaserc` default project ID to the newly created project
* login to the Firebase CLI tool with `firebase login`

#### Install project:

```bash
yarn install
```

#### Run Next.js development:

```bash
yarn dev
```

#### Build Next.js App, Firebase Hosting Folder, Firebase Functions:

``` bash
yarn build
```

#### ~~Run Firebase locally for testing:~~

> `@google-cloud/functions-emulator` emulator only works with Cloud Functions written for the Node.js 6 runtime. So there is no way to simulate firebase functions locally since Next.js app would need to run in Node.js 8 runtime.
>
> [Cloud Functions Node.js Emulator](https://cloud.google.com/functions/docs/emulator)

```
yarn local
```

#### Deploy to Firebase:

```bash
yarn deploy
```

#### Clean dist folder

```bash
yarn clean
```

## The idea behind the example

With Next.js 8, it's possible to split pages into serverless functions, this example demonstrate a setup using Firebase Cloud Functions, Firebase Hosting and main app is written in typescript. Firebase Hosting rewrite rules provides ability to route http requests to Firebase Cloud Functions. Each function is corresponding to one page (or multiple pages) rendering with the idea of micro services. This setup creates multiple cloud functions, so it's more scalable, cost efficient and tracable, there are also drawbacks using this architecture, the pros and cons are open for discussion.

This is based off of the work of @jthegedus in the [with-firebase-hosting](https://github.com/zeit/next.js/tree/canary/examples/with-firebase-hosting) example.

If you're having issues, feel free to tag @shadowwalker in the [issue you create on the next.js repo](https://github.com/zeit/next.js/issues/new)

## Important

* The empty `src/app/static/manifest.json` file is needed so Firebase Hosting does not error on an empty `dist/public` folder. It can also be served as a manifest file for your web app if you are building PWA.
* `firebase.json` outlines the catchall rewrite rules for our Cloud Function.
* The [Firebase predeploy](https://firebase.google.com/docs/cli/#predeploy_and_postdeploy_hooks) hooks defined in `firebase.json` will handle compiling of the next app and the functions sourceswhen `firebase deploy` is invoked. The only scripts you should need are `dev`, `clean` and `deploy`.
* Specifying [`"engines": {"node": "8"}`](package.json#L5-L7) in the `package.json` is required for firebase functions
  to be deployed on Node 8 rather than Node 6
  ([Firebase Blog Announcement](https://firebase.googleblog.com/2018/08/cloud-functions-for-firebase-config-node-8-timeout-memory-region.html))
  . This is matched in by specifying target as `es2017` in [`src/functions/tsconfig.json`](src/functions/tsconfig) so that typescript output somewhat compacter and moderner code.
