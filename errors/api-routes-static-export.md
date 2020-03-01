# API routes in Static export

#### Why This Warning Occurred

An `exportPathMap` path was matched to an API route. `next export` will not prerender API routes to HTML.

#### Possible Ways to Fix It

Remove any paths using API routes from your `exportPathMap` in `next.config.js`.

### Useful Links

- [Static HTML export](https://nextjs.org/docs#static-html-export)
