---
description: By using `pageIgnorePattern` you can filter files to not be included in production build.
---

# Ignoring pages by pattern

Next.js allows you to ignore files under pages -folder on production build. This is especially convenient for teams that have a coding convention to locate unit tests close to the actual code.

The ignore pattern allows you to ignore files by defining a RegExp-pattern. As default, the pageIgnorePattern is undefined and all files under pages are treated as pages.

To ignore all test files and test-folders under pages, you can use:

```js
module.exports = {
  pageIgnorePattern: /__test__|__specs__|\.test|\.spec|\.snap/,
}
```
