[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-firebase-authentication)

# With Firebase Authentication example

## How to use

### Using `create-next-app`

Download [`create-next-app`](https://github.com/segmentio/create-next-app) to bootstrap the example:

```
npm i -g create-next-app
create-next-app --example with-firebase-authentication with-firebase-authentication-app
```

### Download manually

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-firebase-authentication
cd with-firebase-authentication
```

Set up firebase:
- Create a project at the [Firebase console](https://console.firebase.google.com/).
- Get your account credentials from the Firebase console at *settings>service accounts*, where you can click on *generate new private key* and download the credentials as a json file. It will contain keys such as `project_id`, `client_email` and `client id`. Now copy them into your project in the `credentials/server.js` file.
- Get your authentication credentials  from the Firebase console under *authentication>users>web setup*. It will include keys like `apiKey`, `authDomain` and `databaseUrl` and it goes into your project in `credentials/client.js`.
- Copy the `databaseUrl` key you got in the last step into `server.js` in the corresponding line.
- Back at the Firebase web console, go to *authentication>signup method* and select *Google*.

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
