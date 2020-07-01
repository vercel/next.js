# `next/document` should not be imported outside `_document`

#### Why This Error Occurred

Importing `next/document` elsewhere `pages/_document.js` will cause unexpected issues.

#### Possible Ways to Fix It

Import `next/document` only in `pages/_document.js` instead:

### Useful Links

- [This issue was reported in: #13712](https://github.com/vercel/next.js/issues/13712)
