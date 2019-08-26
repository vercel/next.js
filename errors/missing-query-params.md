# Missing query params in `href`

#### Why This Error Occurred

During your page transition, there was miss-match between `href` and `as`, what results in inconsistent behavior. Your `as` query provided extra query parameters what are not part of `href` query. 

#### Possible Ways to Fix It

Check your `Link` component or `Router.push` event if your `href` query parameters have the same keys like your `as` query. 

### Useful Links

- [Routing](https://nextjs.org/docs#routing)
