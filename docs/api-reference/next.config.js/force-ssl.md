---
description: Configure Next.js to redirect requests from http to https (does not create a secure server)
---

# Force SSL


By default Next.js does not deal with SSL/https connetions. This config will redirect any request that uses http to https. It does not create a secure server or even listen for https connections but is extremely useful in some hosting situations like Heroku where the SSL/https connection is terminated before interacting with the Next.js server and the user does not want to create a custom server.

Open `next.config.js` and add the `forceSsl` config:

```js
module.exports = {
  forceSsl: true,
}
```

With this option set, urls like `http://hello.com/about?test=hi#scroll` will redirect to `https://hello.com/about?test=hi#scroll`. 

## Related

<div class="card">
  <a href="/docs/api-reference/next.config.js/introduction.md">
    <b>Introduction to next.config.js:</b>
    <small>Learn more about the configuration file used by Next.js.</small>
  </a>
</div>
