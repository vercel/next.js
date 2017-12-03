[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-apollo-and-redux)
# Apollo & Redux Example

## How to use

### Using `create-next-app`

Download [`create-next-app`](https://github.com/segmentio/create-next-app) to bootstrap the example:

```
npm i -g create-next-app
create-next-app --example with-apollo-and-redux with-apollo-and-redux-app
```

### Download manually

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
By default, Apollo Client creates its own internal Redux store to manage queries and their results. If you are already using Redux for the rest of your app, [you can have the client integrate with your existing store instead](http://dev.apollodata.com/react/redux.html), which is what this example does. This example is identical to the [`with-apollo`](https://github.com/zeit/next.js/tree/master/examples/with-apollo) with the exception of this Redux store integration. 

Note that you can acesss the redux store like you normally would using `react-redux`'s `connect` as per [here](http://dev.apollodata.com/react/redux.html#using-connect). Here's a quick example:

```js
const mapStateToProps = state => ({
  location: state.form.location,
});

export default withData(connect(mapStateToProps, null)(Index));
```

`connect` must go inside `withData` otherwise `connect` will not be able to find the store. 

