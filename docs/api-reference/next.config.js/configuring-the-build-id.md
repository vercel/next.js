# Configuring the Build ID

Next.js uses a constant id generated at build time to identify which version of your application is being served. This can cause problems in multi-server deployments when `next build` is ran on every server. In order to keep a static build id between builds you can provide your own build id.

Open `next.config.js` and add the `generateBuildId` function:

```js
module.exports = {
  generateBuildId: async () => {
    // You can, for example, get the latest git commit hash here
    return 'my-build-id'
  },
}
```
