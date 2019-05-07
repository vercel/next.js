# With Firebase Authentication example

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-firebase-authentication with-firebase-authentication-app
# or
yarn create next-app --example with-firebase-authentication with-firebase-authentication-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-firebase-authentication
cd with-firebase-authentication
```

Set up firebase:

- Create a project at the [Firebase console](https://console.firebase.google.com/).
- Get your account credentials from the Firebase console at _settings>service accounts_, where you can click on _generate new private key_ and download the credentials as a json file. It will contain keys such as `project_id`, `client_email` and `client id`. Now copy them into your project in the `credentials/server.js` file.
- Get your authentication credentials from the Firebase console under _authentication>users>web setup_. It will include keys like `apiKey`, `authDomain` and `databaseUrl` and it goes into your project in `credentials/client.js`.
- Copy the `databaseUrl` key you got in the last step into `server.js` in the corresponding line.
- Back at the Firebase web console, go to _authentication>signup method_ and select _Google_.
- Create a database in the "Database" tab and select the realtime database. Then go to "rules" and set up your write, read rules. Examples can be found here: https://firebase.google.com/docs/database/security/quickstart#sample-rules

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
now
```

## The idea behind the example

The goal is to authenticate users with firebase and store their auth token in sessions. A logged in user will see their messages on page load and then be able to post new messages.
