# Invalid Page Config

#### Why This Error Occurred

In one of your pages you did `export const config` with an invalid value.

#### Possible Ways to Fix It

The page's config must be an object initialized directly when being exported.

This is not allowed

```js
export const config = 'hello world'
```

This is allowed

```js
export const config = { amp: true }
```

### Useful Links

- [Enabling AMP Support](https://nextjs.org/docs#enabling-amp-support)
- [API Middlewares](https://nextjs.org/docs#api-middlewares)
