# Custom Document must be a functional Server Component

#### Why This Error Occurred

Your `next.config.js` has `concurrentFeatures: true` and your `pages/_document` page doesn't export a React Server Component.

#### Possible Ways to Fix It

Set `concurrentFeatures: false` or convert `pages/_document` to a React Server Component.
