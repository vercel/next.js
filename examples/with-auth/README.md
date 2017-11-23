# Authentication example

## How to use

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/with-auth
cd with-auth
```

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

This example includes session support (with CSRF and XSS protection), email based sign-in sytem and integrates with [Passport](http://passportjs.org/) to support signing in with Facebook, Google, Twitter and other sites that support oAuth.

All functionality works on both client and server side - including without JavaScript support in the browser.

Please read [authentication](./AUTHENTICATION.md) to configure oAuth. And have a look at `./index.js` for server / database settings.
