# Apollo & Redux Example

## How to use

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/with-apollo-and-redux
cd with-apollo-and-redux
```

Install it and run:

```bash
npm install
npm run dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download)):

```bash
now
```

## The idea behind the example
By default, Apollo Client creates its own internal Redux store to manage queries and their results. If you are already using Redux for the rest of your app, [you can have the client integrate with your existing store instead](http://dev.apollodata.com/react/redux.html). This example is identical to the [`with-apollo`](https://github.com/zeit/next.js/tree/master/examples/with-apollo) with the exception of this Redux store integration.
