# Custom Routes must return an array

#### Why This Error Occurred

When defining custom routes an array wasn't returned from either `headers`, `rewrites`, or `redirects`.

#### Possible Ways to Fix It

Make sure to return an array that contains the routes.

**Before**

```js
// next.config.js
module.exports = {
  async rewrites() {
    return {
      source: '/feedback',
      destination: '/feedback/general',
    }
  },
}
```

**After**

```js
module.exports = {
  async rewrites() {
    return [
      {
        source: '/feedback',
        destination: '/feedback/general',
      },
    ]
  },
}
```
