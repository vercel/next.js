---
description: Improve the security of your Next.js application by adding HTTP response headers.
---

# Security Headers

To improve the security of your application, you can use [`headers`](/docs/api-reference/next.config.js/headers.md) in `next.config.js` to apply HTTP response headers to all routes in your application.

```jsx
// next.config.js

// You can choose which headers to add to the list
// after learning more below.
const securityHeaders = []

module.exports = {
  async headers() {
    return [
      {
        // Apply these headers to all routes in your application.
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
}
```

## Options

### [X-DNS-Prefetch-Control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-DNS-Prefetch-Control)

This header controls DNS prefetching, allowing browsers to proactively perform domain name resolution on external links, images, CSS, JavaScript, and more. This prefetching is performed in the background, so the [DNS](https://developer.mozilla.org/en-US/docs/Glossary/DNS) is more likely to be resolved by the time the referenced items are needed. This reduces latency when the user clicks a link.

```jsx
{
  key: 'X-DNS-Prefetch-Control',
  value: 'on'
}
```

### [Strict-Transport-Security](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security)

This header informs browsers it should only be accessed using HTTPS, instead of using HTTP. Using the configuration below, all present and future subdomains will use HTTPS for a `max-age` of 2 years. This blocks access to pages or subdomains that can only be served over HTTP.

If you're deploying to [Vercel](https://vercel.com/docs/edge-network/headers#strict-transport-security), this header is not necessary as it's automatically added to all deployments.

```jsx
{
  key: 'Strict-Transport-Security',
  value: 'max-age=31536000; includeSubDomains; preload'
}
```

### [X-XSS-Protection](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-XSS-Protection)

This header stops pages from loading when they detect reflected cross-site scripting (XSS) attacks. Although this protection is not necessary when sites implement a strong [`Content-Security-Policy`](#content-security-policy) disabling the use of inline JavaScript (`'unsafe-inline'`), it can still provide protection for older web browsers that don't support CSP.

```jsx
{
  key: 'X-XSS-Protection',
  value: '1; mode=block'
}
```

### [X-Frame-Options](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Frame-Options)

This header indicates whether the site should be allowed to be displayed within an `iframe`. This can prevent against clickjacking attacks. This header has been superseded by CSP's `frame-ancestors` option, which has better support in modern browsers.

```jsx
{
  key: 'X-Frame-Options',
  value: 'SAMEORIGIN'
}
```

### [Permissions-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Feature-Policy)

This header allows you to control which features and APIs can be used in the browser. It was previously named `Feature-Policy`. You can view the full list of permission options [here](https://www.w3.org/TR/permissions-policy-1/).

```jsx
{
  key: 'Permissions-Policy',
  value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()'
}
```

### [X-Content-Type-Options](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Content-Type-Options)

This header prevents the browser from attempting to guess the type of content if the `Content-Type` header is not explicitly set. This can prevent XSS exploits for websites that allow users to upload and share files. For example, a user trying to download an image, but having it treated as a different `Content-Type` like an executable, which could be malicious. This header also applies to downloading browser extensions. The only valid value for this header is `nosniff`.

```jsx
{
  key: 'X-Content-Type-Options',
  value: 'nosniff'
}
```

### [Referrer-Policy](https://scotthelme.co.uk/a-new-security-header-referrer-policy/)

This header controls how much information the browser includes when navigating from the current website (origin) to another. You can read about the different options [here](https://scotthelme.co.uk/a-new-security-header-referrer-policy/).

```jsx
{
  key: 'Referrer-Policy',
  value: 'origin-when-cross-origin'
}
```

### [Content-Security-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)

This header helps prevent cross-site scripting (XSS), clickjacking and other code injection attacks. Content Security Policy (CSP) can specify allowed origins for content including scripts, stylesheets, images, fonts, objects, media (audio, video), iframes, and more.

You can read about the many different CSP options [here](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP).

```jsx
{
  key: 'Content-Security-Policy',
  value: // Your CSP Policy
}
```

### References

- [MDN](https://developer.mozilla.org)
- [Varun Naik](https://blog.vnaik.com/posts/web-attacks.html)
- [Scott Helme](https://scotthelme.co.uk)
- [Mozilla Observatory](https://observatory.mozilla.org/)

## Related

For more information, we recommend the following sections:

<div class="card">
  <a href="/docs/api-reference/next.config.js/headers.md">
    <b>Headers:</b>
    <small>Add custom HTTP headers to your Next.js app.</small>
  </a>
</div>
