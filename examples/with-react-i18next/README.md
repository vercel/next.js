[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-react-i18next)

# Internationalization with [react-i18next](https://github.com/i18next/react-i18next).

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-react-i18next with-react-i18next-app
# or
yarn create next-app --example with-react-i18next with-react-i18next-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/with-react-i18next
cd with-react-i18next
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
now
```

### Testing the app

auto detecting user language: [http://localhost:3000](http://localhost:3000)

german: [http://localhost:3000/?lng=de](http://localhost:3000/?lng=de)

english: [http://localhost:3000/?lng=en](http://localhost:3000/?lng=en)

## The idea behind the example

This example app shows how to integrate [react-i18next](https://github.com/i18next/react-i18next) with [Next](https://github.com/zeit/next.js).

**Plus:**

- Routing and separating translations into multiple files (lazy load them on client routing)
- Child components (pure or using translation hoc)

### Features of this example app

- Server-side language negotiation
- Full control and usage of i18next on express server using [i18next-express-middleware](https://github.com/i18next/i18next-express-middleware) which asserts no async request collisions resulting in wrong language renderings
- Support for save missing features to get untranslated keys automatically created `locales/{lng}/{namespace}.missing.json` -> never miss to translate a key
- Proper pass down on translations via initialProps
- Taking advantage of multiple translation files including lazy loading on client (no need to load all translations upfront)
- Use express to also serve translations for clientside
- In contrast to react-intl the translations are visible both during development and in production

### learn more

- [next.js](https://github.com/zeit/next.js)
- [react-i18next repository](https://github.com/i18next/react-i18next)
- [react-i18next documentation](https://react.i18next.com)

**Translation features:**

- [i18next repository](https://github.com/i18next/i18next)
- [i18next documentation](https://www.i18next.com)

**Translation management:**

- [locize](http://locize.com)
