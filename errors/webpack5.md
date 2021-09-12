# Webpack 5 Adoption

#### Why This Message Occurred

Next.js has adopted webpack 5 as the default for compilation. We've spent a lot of effort into ensuring the transition from webpack 4 to 5 will be as smooth as possible. For example Next.js now comes with both webpack 4 and 5 allowing you to adopt webpack 5 by adding a flag to your `next.config.js`:

```js
module.exports = {
  // Webpack 5 is enabled by default
  // You can still use webpack 4 while upgrading to the latest version of Next.js by adding the "webpack5: false" flag
  webpack5: false,
}
```

Using webpack 5 in your application has many benefits, notably:

- Improved Disk Caching: `next build` is significantly faster on subsequent builds
- Improved Fast Refresh: Fast Refresh work is prioritized
- Improved Long Term Caching of Assets: Deterministic code output that is less likely to change between builds
- Improved Tree Shaking
- Support for assets using `new URL("file.png", import.meta.url)`
- Support for web workers using `new Worker(new URL("worker.js", import.meta.url))`
- Support for `exports`/`imports` field in `package.json`

In the past releases we have gradually rolled out webpack 5 to Next.js applications:

- In Next.js 10.2 we automatically opted-in applications without custom webpack configuration in `next.config.js`
- In Next.js 10.2 we automatically opted-in applications that do not have a `next.config.js`
- In Next.js 11 webpack 5 was enabled by default for all applications. You can still opt-out and use webpack 4 to help with backwards compatibility using `webpack5: false` in `next.config.js`

In the next major version webpack 4 support will be removed.

#### Custom webpack configuration

In case you do have custom webpack configuration, either through custom plugins or your own modifications you'll have to take a few steps to ensure your applications works with webpack 5.

- When using `next-transpile-modules` make sure you use the latest version which includes [this patch](https://github.com/martpie/next-transpile-modules/pull/179)
- When using `@zeit/next-css` / `@zeit/next-sass` make sure you use the [built-in CSS/Sass support](https://nextjs.org/docs/basic-features/built-in-css-support) instead
- When using `@zeit/next-preact` use [this example](https://github.com/vercel/next-plugins/tree/master/packages/next-preact) instead
- When using `@zeit/next-source-maps` use the [built-in production Source Map support](https://nextjs.org/docs/advanced-features/source-maps)
- When using webpack plugins make sure they're upgraded to the latest version, in most cases the latest version will include webpack 5 support. In some cases these upgraded webpack plugins will only support webpack 5.

### Useful Links

In case you're running into issues you can connect with the community in [this help discussion](https://github.com/vercel/next.js/discussions/23498).
