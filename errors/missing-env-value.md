# Missing Env Value

#### Why This Error Occurred

One of your pages' config requested an env value that wasn't populated.

```js
// pages/index.js
export const config = {
  // this value isn't provided in `.env`
  env: ['MISSING_KEY'],
}
```

```
// .env (notice no `MISSING_KEY` provided here)
NOTION_KEY='...'
```

#### Possible Ways to Fix It

Either remove the requested env value from the page's config, populate it in your `.env` file, or manually populate it in your environment before running `next dev` or `next build`.

### Useful Links

- [dotenv](https://npmjs.com/package/dotenv)
- [dotenv-expand](https://npmjs.com/package/dotenv-expand)
- [Environment Variables](https://en.wikipedia.org/wiki/Environment_variable)
