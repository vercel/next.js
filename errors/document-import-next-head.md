# `next/head` should not be imported inside `_document`

#### Why This Error Occurred

Importing and using `next/head` in `pages/_document.js` will lead to unexpected results with since `_document.js` is only rendered on the initial pre-render.

#### Possible Ways to Fix It

Import and use `next/head` in `pages/_app.js` or in a specific `page` instead:

```js
// pages/_app.js
import App from 'next/app'
import Head from 'next/head'
```

### Useful Links

- [This issue was reported in: #13712](https://github.com/vercel/next.js/issues/13712)
