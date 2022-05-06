# Returning response body in \_middleware

#### Why This Error Occurred

One of your [`_middleware`](https://nextjs.org/docs/advanced-features/middleware) returns a body response, which is not supported.

#### Possible Ways to Fix It

Middlewares in Next.js give you a great opportunity to run code and adjust the served data to the requesting user.

It is a great tool for use cases like:

- A/B testing, where you **_rewrite_** to a different page based on external data (User agent, user location, a custom header or cookie...)
- authentication, where you **_redirect_** to your log-in/sign-in page any un-authenticated request
- detecting bots and **_redirecting_** them to some sink
- programmatically adding **_headers_** to the response, like cookies.

However, letting a middleware respond to the request completly bypasses Next.js routing mechanism.

**TODO** rewrites this all paragraph, to provide simpler reasons why this is forbidden.
Having the possibility to stream content is certainly appealing, but creates a dependency with the system hosting your middleware (since they make not sense on the client side). This creates e

### Useful Links

**TODO** examples
