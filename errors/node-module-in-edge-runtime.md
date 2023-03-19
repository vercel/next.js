# Using Node.js Modules in Edge Runtime

#### Why This Error Occurred

The code in your [Middleware](https://nextjs.org/docs/advanced-features/middleware) or your [Edge API Routes](https://nextjs.org/docs/api-routes/edge-api-routes) is using a feature from Node.js runtime.

However, the Edge Runtime does not support [Node.js APIs and globals](https://nextjs.org/docs/api-reference/edge-runtime#unsupported-apis).

#### Possible Ways to Fix It

When running Next.js locally with `next dev`, your application will show in the console, and in your browser, which file is importing and using an unsupported module. This module must be avoided: either by not importing it, or by replacing it with a polyfill.

For example, you might replace the Node.js `crypto` module with the [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API).

### Useful Links

- [Edge Runtime Supported APIs](https://nextjs.org/docs/api-reference/edge-runtime)
- [Next.js Middleware](https://nextjs.org/docs/advanced-features/middleware)
- [JWT Example](https://vercel.com/templates/next.js/jwt-authentication)
