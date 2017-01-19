
# Passwordless Authentication example

## How to use

Download the example [or clone the repo](https://github.com/zeit/next.js.git):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/with-auth
cd with-auth
```

Install it and run:

```bash
npm install
npm run dev

# In a different tab
sudo python -m smtpd -n -c DebuggingServer localhost:25
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
now
```

## The idea behind the example

This example shows how to implement passwordless authentication on a next.js app.
All checks are being made on `getInitialProps` so we are only showing the page to
the users that are authenticated.
