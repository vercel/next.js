[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-react-ga)

# React-GA example

## How to use

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/with-react-ga
cd with-react-ga
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

This example shows the most basic way to use [react-ga](https://github.com/react-ga/react-ga) using `<Layout/>` component with NextJs. You can also use an HOC instead of `<Layout/>` component. Modify `Tracking ID` in `utils/analytics.js` file for testing this example.
