[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-zones)

# Using multiple zones

With Next.js you can use multiple apps as a single app using it's multi-zones feature.
This is an example showing how to use it.

In this example, we've two apps: 'home' and 'blog'.
We also have a set of rules defined in `rules.json` for the proxy.

Now let's start two of our app using:

```
npm run home
npm run blog
```

Then start the proxy:

```
npm run proxy
```

Now you can visit http://localhost:9000 and access and develop both apps a single app.

### Proxy Rules

This is the place we define rules for our proxy. Here are the rules(in `rules.json`) available for this app:

```json
{
  "rules": [
    {"pathname": "/blog", "method":["GET", "POST", "OPTIONS"], "dest": "http://localhost:5000"},
    {"pathname": "/**", "dest": "http://localhost:4000"}
  ]
}
```

These rules are based on ZEIT now [path alias](https://zeit.co/docs/features/path-aliases) rules and use [`micro-proxy`](https://github.com/zeit/micro-proxy) as the proxy.

## Special Notes

* All pages should be unique across zones. A page with the same name should not exist in multiple zones. Otherwise, there'll be unexpected behaviour in client side navigation.
    * According to the above example, a page named `blog` should not be exist in the `home` zone.
