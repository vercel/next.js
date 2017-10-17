[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-firebase-authentication)

# With Firebase Authentication example

## How to use

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/with-firebase-authentication
cd with-firebase
```

Set up firebase:
- create a project
- get your service account credentials and client credentials and set both in firebaseCredentials.js
- set your firebase database url in server.js
- on the firebase Authentication console, select Google as your provider

Install it and run:

```bash
npm install
npm run dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
now
```

## The idea behind the example
The goal is to authenticate users with firebase and store their auth token in sessions. A logged in user will see their messages on page load and then be able to post new messages. 
