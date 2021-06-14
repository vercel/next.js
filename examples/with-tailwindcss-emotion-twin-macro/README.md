# Tailwind CSS with Emotion.js and twin.macro example

This is an example of how you can add [Tailwind CSS](https://tailwindcss.com/) with [Emotion.js](https://emotion.sh/docs/introduction) in your web app. It takes inspiration from [examples/with-tailwindcss](https://github.com/vercel/next.js/blob/canary/examples/with-tailwindcss/README.md).

`twin.macro` is used to apply Tailwind styles inside Emotion. No need to use CSS files, autoprefix, minifier, etc. You will get the full benefits of Emotion.

> It’s important to know that you don’t need a tailwind.config.js to use Twin. You already have access to every class with every variant. Unlike Tailwind, twin.macro only generates styles for the classes so you don’t need to use PurgeCSS.

[Source](https://github.com/ben-rogerson/twin.macro/blob/master/docs/customizing-config.md)

## Preview

Preview the example live on [StackBlitz](http://stackblitz.com/):

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-tailwindcss-emotion-twin-macro)

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-tailwindcss-emotion-twin-macro&project-name=with-tailwindcss-emotion-twin-macro&repository-name=with-tailwindcss-emotion-twin-macro)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-tailwindcss-emotion-twin-macro with-tailwindcss-emotion-app
# or
yarn create next-app --example with-tailwindcss-emotion-twin-macro with-tailwindcss-emotion-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
