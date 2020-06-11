# Minimum React version

#### Why This Error Occurred

The version of react you are using is older than 16.10.
Next.js requires React 16.10 or newer for Fast Refresh to work correctly.
On older versions, Next.js will fallback to full page reload every time.

Please, take in mind that in this case your dev experience would be suboptimal and unexpected behaviour may occour.

#### Possible Ways to Fix It

Be sure your React version is 16.10 or newer.

```js
 "dependencies": {
    "react": "16.10",
  }
```

### Useful Links

- [fast-refresh](https://nextjs.org/blog/next-9-4#fast-refresh)
- [react-refresh](https://github.com/facebook/react/tree/master/packages/react-refresh)
