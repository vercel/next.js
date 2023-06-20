# next/image Un-configured Host

#### Why This Error Occurred

One of your pages that leverages the `next/image` component, passed a `src` value that uses a hostname in the URL that isn't defined in the `images.remotePatterns` in `next.config.js`.

#### Possible Ways to Fix It

Add the protocol, hostname, port, and pathname to the `images.remotePatterns` config in `next.config.js`:

```js
// next.config.js
module.exports = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'assets.example.com',
        port: '',
        pathname: '/account123/**',
      },
    ],
  },
}
```

#### Fixing older versions of Next.js

<details>
  <summary>Using Next.js prior to 12.3.0?</summary>
  <p>Older versions of Next.js can configure <code>images.domains</code> instead:</p>
  <pre><code>module.exports = {
  images: {
    domains: ['assets.example.com'],
  },
}</code></pre>
</details>

### Useful Links

- [Image Optimization Documentation](https://nextjs.org/docs/pages/building-your-application/optimizing/images)
- [Remote Patterns Documentation](https://nextjs.org/docs/pages/api-reference/components/image#remotepatterns)
