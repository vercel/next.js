# Invalid webpack resolve alias 

#### Why This Error Occurred

When overriding `config.resolve.alias` incorrectly in `next.config.js` webpack will throw an error because private-next-pages is not defined.

#### Possible Ways to Fix It

This is not a bug in Next.js, it's related to the user adding a custom webpack(config) config to next.config.js and overriding internals by not applying Next.js' aliases. Solution would be:

```js
webpack(config) {
  config.resolve.alias = {
    ...config.resolve.alias,
    // your aliases
  }
}
```

### Useful Links

- [Related issue](https://github.com/zeit/next.js/issues/6681)
