# Rematch example

This example has two pages. The first page has a counter which can be incremented synchronously or asynchronously. The second page is a page which shows a list of github users. It fetches data from the github api using this [endpoint](api.github.com/users).

Since rematch is utility which uses redux under the hood, some elements like `store.js` and `withRematch` are very similar to the `with-redux` example. Please go through the `with-redux` example [here](https://github.com/zeit/next.js/tree/master/examples/with-redux) before reading further if you are not familiar with how redux is integrated with nextjs. Rematch is just an extension for Redux so a lot of elements are the same.

## Deploy your own

Deploy the example using [ZEIT Now](https://zeit.co/now):

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/new/project?template=https://github.com/zeit/next.js/tree/canary/examples/with-rematch)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example::

```bash
npm init next-app --example with-rematch with-rematch-app
# or
yarn create next-app --example with-rematch with-rematch-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-rematch
cd with-rematch
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

## Directory structure

Besides the `pages` directory, there is a directory called shared which holds all of the code belonging to rematch. `Rematch` has a lot lesser boilerplate than `Redux` because it is able to put actions(including async actions), _models_ and reducers together. Hence, a `models` directory is present, which contains the logic for `counter` and `github` users.

Some features of this example are :

- Pages are connected to rematch using `withRematch` util. These pages are capable of accessing values from the store and dispatching changes
- Components are inside the `shared/components` folder. The `counter-display` component is connected to the store using the `connect` function to show how components which are not pages, can connect with Rematch.
- The file `shared/store` exports an initStore function which is used by `withRematch` to create store universally on the server and on the client.
