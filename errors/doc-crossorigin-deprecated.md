# `Head` or `NextScript` attribute `crossOrigin` is deprecated

#### Why This Error Occurred

This option has been moved to `next.config.js`.

#### Possible Ways to Fix It

Add the config option:

```js
// next.config.js
module.exports = {
  crossOrigin: 'anonymous',
}
```

### Useful Links

- [The issue this was reported in: #5674](https://github.com/vercel/next.js/issues/5674)

<details open>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-firebase-authentication">Firebase</a></li>
    <li><a href="https://github.com/vercel/examples/tree/main/solutions/auth-with-ory">Ory</a></li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-magic">Magic</a></li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/auth0">Auth0</a></li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-supabase-auth-realtime-db">Supabase</a></li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-userbase">wUserbase</a></li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-supertokens">Supertokens</a></li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-nhost-auth-realtime-graphql">Nhost</a></li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-clerk">Clerk</a></li>
  </ul>
</details>
