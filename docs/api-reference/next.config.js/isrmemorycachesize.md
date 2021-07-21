---
description: Control the size of the ISR memory cache in Next.js
---

# ISR Memory Cache Size

<details>
  <summary><b>Version History</b></summary>

| Version   | Changes                      |
| --------- | ---------------------------- |
| `v11.0.2` | ISR Memory Cache Size added. |

</details>

Next.js keeps the data for frequently accessed paths in a least recently used (LRU) cache in memory.
`isrMemoryCacheSize` allows you to adjust the cache size for the application.

Setting it to 0 will disable the cache.

The default is 50MB:

```js
module.exports = {
  experimental: {
    isrMemoryCacheSize: 50 * 1024 * 1024,
  },
}
```
