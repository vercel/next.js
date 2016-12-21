# Example app using Jest to run tests

This example features:

* A properly configured Next.js app for Jest
* An example test written with Jest Snapshot Testing
* An example test written with Enzyme

## How to run it

```sh
npm install
npm run dev
```

## Jest related info

After you've added `jest-cli` and `jest-babel` into your app, make sure to add the following `.babelrc` file.

```json
{
    "presets": ["next/babel"]
}
```

It'll ask Jest to use the babel configurations used by Next.js.
