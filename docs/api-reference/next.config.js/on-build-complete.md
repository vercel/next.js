---
description: Inspect build output data with onBuildComplete
---

# Inspect build output

Next.js has a rich compiler toolchain, with various interesting datas you may
wish to introspect. To programmatically inspect build data, you may add a
`onBuildComplete` function to your `next.config.js`:

```js
module.exports = {
  onBuildComplete: ({ pageInfos, ...rest }) => {
    for (const [pageName, pageInfo] of pageInfos.entries()) {
      fs.writeFile(`${pageName}.txt`, `${pageInfo.totalSize} bytes`)
    }
  },
}
```

This is an **unstable API**. Current provided values are not guaranteed major
to major version.
