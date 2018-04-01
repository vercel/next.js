[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-zones)

# Using multiple zones

With Next.js you can use multiple apps as a single app using it's multi-zones feature.
This is an example showing how to use it.

In this example, we've two apps: 'home' and 'blog'.
We also have a set of rules defined in `rules.json` for the proxy.

Now let's start two of our app using:

```bash
npm run home
npm run blog
```

Then start the proxy:

```bash
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

## Production Deployment

Here's how are going to deploy this application into production.

* Open the `now.json` file in both `blog` and `home` directories and change the aliases as you wish.
* Then update `rules-prod.json` accordingly.
* Now deploy both apps:

~~~sh
cd home
now && now alias
cd ../blog
now && now alias
cd ..
~~~

* Finally, set the path alias rules with

~~~sh
now alias with-zones.now.sh -r rules-prod.json
~~~

> You can use a domain name of your choice in the above command instead of `with-zones.now.sh`.

That's it.
Now you can access the final app via: <https://with-zones.now.sh>
