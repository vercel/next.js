# Missing Env Value

#### Why This Error Occurred

On one of your pages' config you requested an env value that wasn't populated.

```js
export const config = {
  env: ['MY_ENV_KEY'],
}
```

#### Possible Ways to Fix It

Either remove the requested env value from the page's config or populate it in your `.env` file or manually populate it in your environment before starting `next`

### Useful Links

- [dotenv](https://npmjs.com/package/dotenv)
- [dotenv-expand](https://npmjs.com/package/dotenv-expand)
- [Environment Variables](https://en.wikipedia.org/wiki/Environment_variable)
