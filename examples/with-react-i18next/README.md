# react-i18next example

This minimal example uses [react-i18next](https://react.i18next.com/) with no additional server or dependencies required and without sacrificing any features of Next.js.

This example directly loads the translations from the project's source, removing the need for an i18next backend. The default language can be specified in `init()`, under [i18n.js](translations/i18n.js), removing the need for an i18next language detector.

Example usage with custom namespaces is also provided.

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) or [Yarn](https://classic.yarnpkg.com/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-react-app --example with-react-i18next
# or
yarn create next-app --example with-react-i18next
```

### Download manually

Download the example, switch to the root:

```bash
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

## Configure

- All relevant files are available under [`translations/`](translations).
- Edit files under [`locales/`](translations/locales) to add translations.
- Edit i18n configuration under [`i18n.js`](translations/i18n.js). Refer [i18next docs](https://www.i18next.com/overview/configuration-options) for configuration options.
- i18n setup example to make the translations available throughout the application can be found in [`_app.jsx`](pages/_app.jsx).
- Example usage using the [`useTranslation()`](https://react.i18next.com/latest/usetranslation-hook) hook can be found in [`App.jsx`](components/App.jsx).
- Example usage of using custom namespaces for translations can be found in [`overview.jsx`](pages/overview.jsx).
