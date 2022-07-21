# Invalid Page / API Route Config

#### Why This Error Occurred

In one of your pages or API Routes you did `export const config` with an invalid value.

#### Possible Ways to Fix It

The page's config must be an object initialized directly when being exported and not modified dynamically.
The config object must only contains static constant literals without expressions.

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
export const config = {
  amp: 1 + 1 > 2,
}
```

This is not allowed

```js
export { config } from '../config'
```

This is not allowed

```js
export const config = {
  runtime: `n${'od'}ejs`,
}
```

This is allowed

```js
export const config = { amp: true }
```

This is allowed

```js
export const config = {
  runtime: 'nodejs',
}
```

This is allowed

```js
export const config = {
  runtime: `nodejs`,
}
```

### Useful Links

- [Enabling AMP Support](https://nextjs.org/docs/advanced-features/amp-support/introduction)
- [API Middlewares](https://nextjs.org/docs/api-routes/api-middlewares)
- [Switchable Runtime](https://nextjs.org/docs/advanced-features/react-18/switchable-runtime)
