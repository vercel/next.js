---
description: Background or inactive pages in development mode might not load correctly.
---

# Development over background or inactive pages

When running Next.js in development mode Next.js will run pages using Fouc.
In development, Next.js uses [Window.requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/window/requestAnimationFrame) which does not work in background pages.

For example, if you have an invisible IFrame:

`

<iframe style="visiblity: hidden;" src="http://next-dev-server:3000"></iframe>
`

IFrame Next.js app:

```js
useEffect(() => {
  console.log('foo')
}, [])
```

In production mode, `foo` will be printed while in dev mode `foo` will _not_ be printed.

In order to solve it, you can disable `Window.requestAnimationFrame` using:

```js
module.exports = {
  devIndicators: {
    foucUseAnimationFrame: true,
  },
}
```
