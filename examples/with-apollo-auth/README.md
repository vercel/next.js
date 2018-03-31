[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-apollo-auth)
# Apollo With Authentication Example

## Demo

https://next-with-apollo-auth.now.sh

## How to use

### Using `create-next-app`

Download [`create-next-app`](https://github.com/segmentio/create-next-app) to bootstrap the example:

```bash
npx create-next-app --example with-apollo-auth with-apollo-auth-app
# or
yarn create next-app --example with-apollo-auth with-apollo-auth-app
```

### Download manually

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-apollo-auth
cd with-apollo-auth
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

This is an extention of the _[with Apollo](https://github.com/zeit/next.js/tree/master/examples/with-apollo#the-idea-behind-the-example)_ example:

> [Apollo](http://dev.apollodata.com) is a GraphQL client that allows you to easily query the exact data you need from a GraphQL server. In addition to fetching and mutating data, Apollo analyzes your queries and their results to construct a client-side cache of your data, which is kept up to date as further queries and mutations are run, fetching more results from the server.
>
> In this simple example, we integrate Apollo seamlessly with Next by wrapping our *pages* inside a [higher-order component (HOC)](https://facebook.github.io/react/docs/higher-order-components.html). Using the HOC pattern we're able to pass down a central store of query result data created by Apollo into our React component hierarchy defined inside each page of our Next application.
>
> On initial page load, while on the server and inside `getInitialProps`, we invoke the Apollo method,  [`getDataFromTree`](http://dev.apollodata.com/react/server-side-rendering.html#getDataFromTree). This method returns a promise; at the point in which the promise resolves, our Apollo Client store is completely initialized.
>
> This example relies on [graph.cool](https://www.graph.cool) for its GraphQL backend.
>
> *Note: Apollo uses Redux internally; if you're interested in integrating the client with your existing Redux store check out the [`with-apollo-and-redux`](https://github.com/zeit/next.js/tree/master/examples/with-apollo-and-redux) example.*

[graph.cool](https://www.graph.cool) can be setup with many different
[authentication providers](https://www.graph.cool/docs/reference/integrations/overview-seimeish6e/#authentication-providers), the most basic of which is [email-password authentication](https://www.graph.cool/docs/reference/simple-api/user-authentication-eixu9osueb/#email-and-password). Once email-password authentication is enabled for your graph.cool project, you are provided with 2 useful mutations: `createUser` and `signinUser`.

On loading each route, we perform a `user` query to see if the current visitor is logged in (based on a cookie, more on that in a moment). Depending on the query result, and the route, the user may be [redirected](https://github.com/zeit/next.js/blob/master/examples/with-apollo-auth/lib/redirect.js) to a different page.

When creating an account, both the `createUser` and `signinUser` mutations are executed on graph.cool, which returns a token that can be used to [authenticate the user for future requests](https://www.graph.cool/docs/reference/auth/authentication-tokens-eip7ahqu5o/). The token is stored in a cookie for easy access (_note: This may have security implications. Please understand XSS and JWT before deploying this to production_).

A similar process is followed when signing in, except `signinUser` is the only mutation executed.

It is important to note the use of Apollo's `resetStore()` method after signing in and signing out to ensure that no user data is kept in the browser's memory.

To get this example running locally, you will need to create a graph.cool
account, and provide [the `project.graphcool` schema](https://github.com/zeit/next.js/blob/master/examples/with-apollo-auth/project.graphcool).


### Note:
In these *with-apollo* examples, the ```withData()``` HOC must wrap a top-level component from within the ```pages``` directory. Wrapping a child component with the HOC will result in a ```Warning: Failed prop type: The prop 'serverState' is marked as required in 'WithData(Apollo(Component))', but its value is 'undefined'``` error. Down-tree child components will have access to Apollo, and can be wrapped with any other sort of ```graphql()```, ```compose()```, etc HOC's.
