[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-jest-react-testing-library)

# Example app with React Testing Library and Jest

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-jest-react-testing-library with-rtl-app
# or
yarn create next-app --example with-jest-react-testing-library with-rtl-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-jest
cd with-jest-react-testing-library
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

## Run Tests

```bash
npm run test
# or
yarn test
```

## The idea behind the example

This library encourages your applications to be more accessible and allows you to get your tests closer to using your components the way a user will, which allows your tests to give you more confidence that your application will work when a real user uses it. And also, is a replacement for enzyme.

This example features:

* An app with [react testing library](https://github.com/kentcdodds/react-testing-library) by [Kent Dodds](https://github.com/kentcdodds/)

