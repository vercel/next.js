---
description: Learn to add and access environment variables in your Next.js application at build time.
---

# Environment Variables

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/zeit/next.js/tree/canary/examples/with-env-from-next-config-js">With env</a></li>
    <li><a href="https://github.com/zeit/next.js/tree/canary/examples/with-now-env">With Now env</a></li>
  </ul>
</details>

To add environment variables to the JavaScript bundle, open `next.config.js` and add the `env` config:

```js
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
