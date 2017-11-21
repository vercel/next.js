[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-zones)

# Using multiple zones

With Next.js you can use multiple apps as a single app using it's multi-zones feature.
This is a example showing how to use it.

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

This is the place we define rules for our proxy. Here are the rules for this app:

```json
[
  {
    "pathname": "/blog(/**)",
    "zone": { "name": "blog", "url": "http://localhost:5000" }
  },
  {
    "pathname": "/**",
    "zone": { "name": "home", "url": "http://localhost:4000" }
  }
]
```

This is the place where how define different zones and how they should proxy. The name of the proxy is important and it'll be used in the client side.

If we are need to navigate into a different zone, we need to create a link like below:

```js
<Link href='zone://blog/blog' as='/blog'><a>Blog</a></Link>
```

Here's how we can decode the above URL:

```
zone://blog/blog
(zone protocol)//(zone name)/(pathname)
```

