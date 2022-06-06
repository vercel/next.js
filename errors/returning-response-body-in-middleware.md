# Returning response body in middleware

#### Why This Error Occurred

Your [`middleware`](https://nextjs.org/docs/advanced-features/middleware) function returns a response body, which is not supported.

Letting middleware respond to incoming requests would bypass Next.js routing mechanism, creating an unnecessary escape hatch.

#### Possible Ways to Fix It

Next.js middleware gives you a great opportunity to run code and adjust to the requesting user.

It is intended for use cases like:

- A/B testing, where you **_rewrite_** to a different page based on external data (User agent, user location, a custom header or cookie...)

  ```js
  export function middleware(req: NextRequest) {
    let res = NextResponse.next()
    // reuses cookie, or builds a new one.
    const cookie = req.cookies.get(COOKIE_NAME) ?? buildABTestingCookie()

    // the cookie contains the displayed variant, 0 being default
    const [, variantId] = cookie.split('.')
    if (variantId !== '0') {
      const url = req.nextUrl.clone()
      url.pathname = url.pathname.replace('/', `/${variantId}/`)
      // rewrites the response to display desired variant
      res = NextResponse.rewrite(url)
    }

    // don't forget to set cookie if not set yet
    if (!req.cookies.has(COOKIE_NAME)) {
      res.cookies.set(COOKIE_NAME, cookie)
    }
    return res
  }
  ```

- authentication, where you **_redirect_** to your log-in/sign-in page any un-authenticated request

  ```js
  export function middleware(req: NextRequest) {
    const basicAuth = req.headers.get('authorization')

    if (basicAuth) {
      const auth = basicAuth.split(' ')[1]
      const [user, pwd] = atob(auth).split(':')
      if (areCredentialsValid(user, pwd)) {
        return NextResponse.next()
      }
    }

    return NextResponse.redirect(
      new URL(`/login?from=${req.nextUrl.pathname}`, req.url)
    )
  }
  ```

- detecting bots and **_rewrite_** response to display to some sink

  ```js
  export function middleware(req: NextRequest) {
    if (isABotRequest(req)) {
      // Bot detected! rewrite to the sink
      const url = req.nextUrl.clone()
      url.pathname = '/bot-detected'
      return NextResponse.rewrite(url)
    }
    return NextResponse.next()
  }
  ```

- programmatically adding **_headers_** to the response, like cookies.

  ```js
  export function middleware(req: NextRequest) {
    const res = NextResponse.next(null, {
      // sets a custom response header
      headers: { 'response-greetings': 'Hej!' },
    })
    // configures cookies
    res.cookies.set('hello', 'world')
    return res
  }
  ```
