---
description: The complete Next.js runtime is now Strict Mode-compliant, learn how to opt-in
---

# React Strict Mode

> **Suggested**: We strongly suggest you enable Strict Mode in your Next.js application to better prepare your application for the future of React.

The Next.js runtime is now Strict Mode-compliant. To opt-in to Strict Mode, configure the following option in your `next.config.js`:

```js
// next.config.js
module.exports = {
  reactStrictMode: true,
}
```

If you or your team are not ready to use Strict Mode in your entire application, that's OK! You can incrementally migrate on a page-by-page basis [using `<React.StrictMode>`](https://reactjs.org/docs/strict-mode.html).

React's Strict Mode is a development mode only feature for highlighting potential problems in an application. It helps to identify unsafe lifecycles, legacy API usage, and a number of other features.

## Related

<div class="card">
  <a href="/docs/api-reference/next.config.js/introduction.md">
    <b>Introduction to next.config.js:</b>
    <small>Learn more about the configuration file used by Next.js.</small>
  </a>
</div>
