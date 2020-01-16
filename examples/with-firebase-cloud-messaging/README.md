# With Firebase Cloud Messaging example

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npm init next-app --example with-firebase-cloud-messaging with-firebase-cloud-messaging-app
# or
yarn create next-app --example with-firebase-cloud-messaging with-firebase-cloud-messaging-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-firebase-cloud-messaging
cd with-firebase-cloud-messaging
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

## Set your send id

set your `messagingSenderId` in `static/firebase-messaging-sw.js` and `utils/webPush.js`

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
now
```

## How to send a notification

https://firebase.google.com/docs/cloud-messaging/js/first-message,

## The idea behind the example

To demo how to implement firebase cloud messaging to send web push notification in next.js.
