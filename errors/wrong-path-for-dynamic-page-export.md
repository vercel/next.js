# Your `path` didn't match the dynamic `page` during static export

#### Why This Error Occurred

During static export, your `path` didn't match the dynamic `page` path, so it not possible to provide needed parameters to this `page`. 

#### Possible Ways to Fix It

Adjust your `exportPathMap` function inside `next.config.js`, so your path can match the actual `page` path. For example:

```js
module.exports = {
  exportPathMap: function() {
    return {
      '/': { page: '/' },
      '/blog/nextjs/comment/test': { page: '/blog/[post]/comment/[id]' },
    }
  },
}
```

### Useful Links

- [exportPathMap](https://github.com/zeit/next.js#usage) documentation