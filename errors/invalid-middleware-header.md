# Invalid middleware header

#### Why This Error Occurred

You included a proxy header in a middleware response that is reserved by next.js. This could include headers starting with `x-middleware`, or one of the following:

- `x-forwarded-host`
- `x-forwarded-proto`
- `x-forwarded-port`
- `x-forwarded-for`
- `sec-fetch-dest`
- `sec-fetch-user`
- `sec-fetch-mode`
- `sec-fetch-site`
- `sec-ch-ua-platform`
- `sec-ch-ua-mobile`
- `sec-ch-ua`
- `upgrade-insecure-requests`
- `connection`
- `cookie`
- `host`

#### Possible Ways to Fix It

Rename your header so that it does not conflict with a system reserved header. For instance rename `x-middleware-my-header` to `x-my-header`.
