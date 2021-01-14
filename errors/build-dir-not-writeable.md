# Build directory not writeable

#### Why This Error Occurred

The filesystem does not allow writing to the specified directory. A common cause for this error is starting a [custom server](https://nextjs.org/docs/advanced-features/custom-server) in development mode on a production server, for example, [Vercel](https://vercel.com) which doesn't allow you to write to the filesystem after your app is built.

#### Possible Ways to Fix It

When using a custom server with a server file, for example called `server.js`, make sure you update the scripts key in `package.json` to:

```json
{
  "scripts": {
    "dev": "node server.js",
    "build": "next build",
    "start": "NODE_ENV=production node server.js"
  }
}
```

and the custom server starts Next in production mode when `NODE_ENV` is `production`

```js
const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
```

### Useful Links

- [Custom Server documentation + examples](https://nextjs.org/docs/advanced-features/custom-server)
