# Duplicate Polyfills from Polyfill.io

#### Why This Error Occurred

You are using Polyfill.io and including duplicate polyfills already shipped with Next.js. This increases page weight unnecessarily which can affect loading performance.

#### Possible Ways to Fix It

Remove all duplicate polyfills that are included with Polyfill.io. If you need to add polyfills but are not sure if Next.js already includes it, take a look at the list of [supported browsers and features](https://nextjs.org/docs/basic-features/supported-browsers-features) first.

### Useful Links

- [Supported Browsers and Features](https://nextjs.org/docs/basic-features/supported-browsers-features)
