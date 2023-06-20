# `NextResponse.next()` used in a App Route Handler

#### Why This Error Occurred

App Route Handler's do not currently support using the `NextResponse.next()` method to forward to the next middleware because the handler is considered the endpoint to the middleware chain. Handlers must always return a `Response` object instead.

#### Possible Ways to Fix It

Remove the `NextResponse.next()` and replace it with a correct response handler.

### Useful Links

- [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response)
- [`NextResponse`](https://nextjs.org/docs/api-reference/next/server#nextresponse)
