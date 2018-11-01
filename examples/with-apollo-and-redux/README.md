[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-apollo-and-redux)
# Apollo & Redux Example

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-apollo-and-redux with-apollo-and-redux-app
# or
yarn create next-app --example with-apollo-and-redux with-apollo-and-redux-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-apollo-and-redux
cd with-apollo-and-redux
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download)):

```bash
now
```

## The idea behind the example
This example serves as a conduit if you were using Apollo 1.X with Redux, and are migrating to Apollo 2.x, however, you have chosen not to manage your entire application state within Apollo (`apollo-link-state`).

In 2.0.0, Apollo serves out-of-the-box support for redux in favor of Apollo's state management. This example aims to be an amalgamation of the [`with-apollo`](https://github.com/zeit/next.js/tree/master/examples/with-apollo) and [`with-redux`](https://github.com/zeit/next.js/tree/master/examples/with-redux) examples.

Note that you can access the redux store like you normally would using `react-redux`'s `connect`. Here's a quick example:

```js
const mapStateToProps = state => ({
  location: state.form.location,
});

export default withRedux(connect(mapStateToProps, null)(Index));
```

### Note:
In these *with-apollo* examples, the ```withData()``` HOC must wrap a top-level component from within the ```pages``` directory. Wrapping a child component with the HOC will result in a ```Warning: Failed prop type: The prop 'serverState' is marked as required in 'WithData(Apollo(Component))', but its value is 'undefined'``` error. Down-tree child components will have access to Apollo, and can be wrapped with any other sort of ```graphql()```, ```compose()```, etc HOC's.
