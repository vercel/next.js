# With Firebase Hosting example

The goal is to host the Next.js app on Firebase Cloud Functions with Firebase Hosting rewrite rules so our app is served from our Firebase Hosting URL. Each individual `page` bundle is served in a new call to the Cloud Function which performs the initial server render.

This is based off of the work at https://github.com/geovanisouza92/serverless-firebase & https://github.com/jthegedus/firebase-functions-next-example as described [here](https://medium.com/@jthegedus/next-js-on-cloud-functions-for-firebase-with-firebase-hosting-7911465298f2).

If you're having issues, feel free to tag @jthegedus in the [issue you create on the next.js repo](https://github.com/zeit/next.js/issues/new)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example with-firebase-hosting with-firebase-hosting-app
# or
yarn create next-app --example with-firebase-hosting with-firebase-hosting-app
```

<details>
<summary><b>Download manually</b></summary>

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-firebase-hosting
cd with-firebase-hosting
```

</details>

<details>
<summary><b>Set up firebase</b></summary>

- install Firebase Tools: `npm i -g firebase-tools`
- create a project through the [firebase web console](https://console.firebase.google.com/)
- grab the projects ID from the web consoles URL: `https://console.firebase.google.com/project/<projectId>`
- update the `.firebaserc` default project ID to the newly created project
- login to the Firebase CLI tool with `firebase login`

</details>

<details>
<summary><b>Install Project</b></summary>

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

</details>

## Important

- [`firebase.json`](firebase.json:#L7) outlines the catchall rewrite rule for our Cloud Function.
- The empty `public/.gitignore` file is to ensure `public/` dir exists as it is required for Firebase Hosting. It is [configured](firebase.json:#L4) (by [default](https://firebase.google.com/docs/hosting/full-config#ignore)) that dotfiles (`public/.*`) are ignored from bein publicly served.
- The Cloud Function is named `nextjsFunc` (changeable [here](firebaseFunctions.js#L16) and [here](firebase.json#L8)).
- `public/*` files are statically served through [Firebase hosting](https://firebase.google.com/docs/hosting/full-config#public), not through [NextJs server](https://nextjs.org/docs/basic-features/static-file-serving).
- Specifying [`"engines": {"node": "10"}`](package.json#L5-L7) in `package.json` is required and the [latest supported](https://firebase.google.com/docs/functions/manage-functions#set_nodejs_version) by firebase functions.

### Customization

Next App is in `src/` directory.

The crucial files for the setup:

- `.firebaserc`
- `firebase.json`
- `firebaseFunctions.js`
- `src/next.config.js`
- In `package.json`; `firebase-*` packages and `engines` field

## Caveat

- As firebase functions requires `"engines": {"node": "10"}` to be specified (in `package.json`), if you are yarn (instead of npm), you will need to add flag [`--ignore-engines`](https://classic.yarnpkg.com/en/docs/cli/install/#toc-yarn-install-ignore-engines).
