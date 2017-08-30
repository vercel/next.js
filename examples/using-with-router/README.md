[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/using-with-router)
# Example app utilizing `withRouter` utility for routing

## How to use

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/using-with-router
cd using-with-router
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

Sometimes, we want to use the `router` inside component of our app without using the singleton `next/router` API. 

You can do that by creating a React Higher Order Component with the help of the `withRouter` utility.
