# Missing query params in `href`

#### Why This Error Occurred

During your page transition, there was a mismatch between `href` and `as`, that results in inconsistent behavior. The `as` query provided extra query values that are not present in the `href` query. 

#### Possible Ways to Fix It

Check `next/link`, `Router#push`, or `Router#replace` usage for any `as` query values not being provided in the `href` query. 

### Useful Links

- [Routing](https://nextjs.org/docs#routing)
