# Invalid next.config.js

#### Why This Error Occurred

In your `next.config.js` file you passed invalid options that either are the incorrect type or an unknown field.

#### Possible Ways to Fix It

Fixing the listed config errors will remove this warning. You can also leverage the `NextConfig` type by importing from `next` to help ensure your config is correct.

```ts
/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  /* config options here */
}

module.exports = nextConfig
```

### Useful Links

- [`next.config.js`](https://nextjs.org/docs/api-reference/next.config.js/introduction)
