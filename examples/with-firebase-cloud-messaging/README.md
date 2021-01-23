# With Firebase Cloud Messaging example

To demo how to implement firebase cloud messaging to send web push notification in next.js.

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-firebase-cloud-messaging with-firebase-cloud-messaging-app
# or
yarn create next-app --example with-firebase-cloud-messaging with-firebase-cloud-messaging-app
```

## Set your send id

set your `messagingSenderId` in `static/firebase-messaging-sw.js` and `utils/webPush.js`

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

## How to send a notification

https://firebase.google.com/docs/cloud-messaging/js/first-message,
