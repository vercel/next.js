# next.config.js Loading Error

#### Why This Error Occurred

When attempting to load your `next.config.js` file an error occurred. This could be due to a syntax error or attempting to `require` a module that wasn't available.

#### Possible Ways to Fix It

See the error message in your terminal where you started `next` to see more context. The `next.config.js` file is not transpiled by Next.js currently so ensure only features supported by your current node.js version are being used.

### Useful Links

- [next.config.js documentation](https://nextjs.org/docs/api-reference/next.config.js/introduction)
- [node.js version feature chart](https://node.green/)
