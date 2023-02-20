# nonce contained invalid characters

#### Why This Error Occurred

This happens when there is a request that contains a `Content-Security-Policy`
header that contains a `script-src` directive with a nonce value that contains
invalid characters (any one of `<>&` characters). For example:

- `'nonce-<script />'`: not allowed
- `'nonce-/>script<>'`: not allowed
- `'nonce-PHNjcmlwdCAvPg=='`: allowed
- `'nonce-Lz5zY3JpcHQ8Pg=='`: allowed

#### Possible Ways to Fix It

Replace the nonce value with a base64 encoded value.

### Useful Links

- [Content Security Policy Sources](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/Sources#sources)
