---
title: env
description: Learn to add and access environment variables in your Next.js application at build time.
---

{/* The content of this doc is shared between the app and pages router. You can use the `<PagesOnly>Content</PagesOnly>` component to add content that is specific to the Pages Router. Any shared content should not be wrapped in a component. */}

<AppOnly>

> Since the release of [Next.js 9.4](https://nextjs.org/blog/next-9-4) we now have a more intuitive and ergonomic experience for [adding environment variables](/docs/app/building-your-application/configuring/environment-variables). Give it a try!

</AppOnly>

<PagesOnly>

> Since the release of [Next.js 9.4](https://nextjs.org/blog/next-9-4) we now have a more intuitive and ergonomic experience for [adding environment variables](/docs/pages/building-your-application/configuring/environment-variables). Give it a try!

</PagesOnly>

<AppOnly>

> **Good to know**: environment variables specified in this way will **always** be included in the JavaScript bundle, prefixing the environment variable name with `NEXT_PUBLIC_` only has an effect when specifying them [through the environment or .env files](/docs/app/building-your-application/configuring/environment-variables).

</AppOnly>

<PagesOnly>

> **Good to know**: environment variables specified in this way will **always** be included in the JavaScript bundle, prefixing the environment variable name with `NEXT_PUBLIC_` only has an effect when specifying them [through the environment or .env files](/docs/pages/building-your-application/configuring/environment-variables).

</PagesOnly>

To add environment variables to the JavaScript bundle, open `next.config.js` and add the `env` config:

```js filename="next.config.js"
module.exports = {
  env: {
    customKey: 'my-value',
  },
}
```

Now you can access `process.env.customKey` in your code. For example:

```jsx
function Page() {
  return <h1>The value of customKey is: {process.env.customKey}</h1>
}

export default Page
```

Next.js will replace `process.env.customKey` with `'my-value'` at build time. Trying to destructure `process.env` variables won't work due to the nature of webpack [DefinePlugin](https://webpack.js.org/plugins/define-plugin/).

For example, the following line:

```jsx
return <h1>The value of customKey is: {process.env.customKey}</h1>
```

Will end up being:

```jsx
return <h1>The value of customKey is: {'my-value'}</h1>
```
