# No Next Server Outside Middleware

#### Why This Error Occurred

You're importing types from `next/server` that should only be imported inside `_middleware` files. You likely want to import [these types](https://nextjs.org/docs/basic-features/typescript#api-routes) instead

#### Possible Ways to Fix It

Remove imports from `next/server` from files that are not `_middleware`

### Useful Links

- [Middleware](https://nextjs.org/docs/middleware)
- [API Routes with Typescript](https://nextjs.org/docs/basic-features/typescript#api-routes)
