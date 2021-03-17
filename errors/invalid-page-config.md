# Invalid Page Config

#### Why This Error Occurred

In one of your pages you did `export const config` with an invalid value.

#### Possible Ways to Fix It

The page's config must be an object initialized directly when being exported and not modified dynamically.

This is not allowed

```js
export const config = 'hello world'
```

This is not allowed

```js
const config = {}
config.amp = true
```

This is not allowed

```js
export { config } from '../config'
```

This is allowed

```js
export const config = { amp: true }
```

### Useful Links

- [Enabling AMP Support](https://nextjs.org/docs/advanced-features/amp-support/introduction)
- [API Middlewares](https://nextjs.org/docs/api-routes/api-middlewares)
