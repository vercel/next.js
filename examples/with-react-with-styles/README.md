[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-react-with-styles)

# Example app with react-with-styles

## How to use

### Using `create-next-app`

Download [`create-next-app`](https://github.com/segmentio/create-next-app) to bootstrap the example:

```
npm i -g create-next-app
create-next-app --example with-react-with-styles with-react-with-styles-app
```

### Download manually

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-react-with-styles
cd with-react-with-styles
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

This example features how you use a different styling solution than [styled-jsx](https://github.com/zeit/styled-jsx) that also supports universal styles. 
That means we can serve the required styles for the first render within the HTML and then load the rest in the client. 
In this case we are using [react-with-styles](https://github.com/airbnb/react-with-styles).

For this purpose we are extending the `<Document />` and injecting the server side rendered styles into the `<head>`.

We are using `pages/_index.js` from this example [with-aphrodite](https://github.com/zeit/next.js/tree/v3-beta/examples/with-aphrodite). 