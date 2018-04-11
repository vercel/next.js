[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-react-toolbox)

# With react-toolbox example

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-react-toolbox with-react-toolbox-app
# or
yarn create next-app --example with-react-toolbox with-react-toolbox-app
```

### Download manually

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-react-toolbox
cd with-react-toolbox
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Notice that `yarn toolbox` (or `npm run toolbox`) should be rerun every time the `"reactToolbox"` configuration in `package.json` is changed, in order to update `static/theme.js` and `static/theme.css`. The `"reactToolbox"` configuration includes styling, and the list of react-toolbox components to include.

## The idea behind the example

This is a simple example of getting react-toolbox up and running, using [react-toolbox-themr](https://github.com/react-toolbox/react-toolbox-themr).

For actual use, you probably also want to add Roboto Font, and Material Design Icons. See <http://react-toolbox.com/#/install>
