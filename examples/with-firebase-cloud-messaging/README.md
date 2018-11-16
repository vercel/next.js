[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-firebase-cloud-messaging)

## How to run

Install it and run:

```bash
npm install
npm run build
npm run dev
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
