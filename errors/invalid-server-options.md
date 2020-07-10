# It looks like the next instance is being instantiated incorrectly.

#### Why This Error Occurred

You have passed a null or undefined parameter to the next() call.

#### Possible Ways to Fix It

Make sure you are passing the variables properly:

```js
const app = next()
```

And make sure you're passing dev as shown in the examples below:

```js
const app = next({ dev: boolean })
```

### Useful Links

- [custom-server-express](https://github.com/vercel/next.js/blob/6ca00bfe312c8d3fc5c20d25a9cd8d2741a29332/examples/custom-server-express/server.js#L6)
- [custom-server](https://github.com/vercel/next.js/blob/6ca00bfe312c8d3fc5c20d25a9cd8d2741a29332/examples/custom-server/server.js#L6)
- [custom-server-typescript](https://github.com/vercel/next.js/blob/6ca00bfe312c8d3fc5c20d25a9cd8d2741a29332/examples/custom-server-typescript/server/index.ts#L7)
