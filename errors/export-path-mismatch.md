# The provided export path doesn't match the page.

#### Why This Error Occurred

An `exportPathMap` path was improperly matched to a dynamically routed page.
This would result in the page missing its URL parameters.

#### Possible Ways to Fix It

Change your `exportPathMap` function in `next.config.js` to have a path that matches the dynamically routed page.

```js
module.exports = {
  exportPathMap: function() {
    return {
      '/': { page: '/' },
      // '/blog/nextjs': { page: '/blog/[post]/comment/[id]' },        // wrong
      '/blog/nextjs/comment/1': { page: '/blog/[post]/comment/[id]' }, // correct
    }
  },
}
```

### Useful Links

- [exportPathMap](https://nextjs.org/docs#usage) documentation
