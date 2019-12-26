# Ignoring TypeScript Errors

Next.js reports TypeScript errors by default. If you don't want to leverage this behavior and prefer something else instead, like your editor's integration, you may want to disable it.

Open `next.config.js` and enable the `ignoreDevErrors` option in the `typescript` config:

```js
module.exports = {
  typescript: {
    ignoreDevErrors: true,
  },
}
```

Next.js will still fail your **production build** (`next build`) when TypeScript errors are present in your project.

---

If you'd like Next.js to dangerously produce production code even when your application has errors, you can also disable error reports for builds.

> Be sure you are running type checks as part of your build or deploy process, otherwise this can be very dangerous.

Open `next.config.js` and enable the `ignoreDevErrors` option in the `typescript` config:

```js
module.exports = {
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    //
    // This option is rarely needed, and should be reserved for advanced
    // setups. You may be looking for `ignoreDevErrors` instead.
    // !! WARN !!
    ignoreBuildErrors: true,
  },
}
```
