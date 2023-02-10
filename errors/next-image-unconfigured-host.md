# next/image Un-configured Host

#### Why This Error Occurred

One of your pages that leverages the `next/image` component, passed a `src` value that uses a hostname in the URL that isn't defined in the `images.remotePatterns` or `images.domains` in `next.config.js`.

#### Possible Ways to Fix It

Add the protocol, hostname, port, and pathname to the `images.remotePatterns` config in `next.config.js`:

```js
// next.config.js
module.exports = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'example.com',
        port: '',
        pathname: '/account123/**',
      },
    ],
  },
}
```

If you are using an older version of Next.js prior to 12.3.0, you can use `images.domains` instead:

```js
// next.config.js
module.exports = {
  images: {
    domains: ['assets.example.com'],
  },
}
```

### Useful Links

- [Image Optimization Documentation](https://nextjs.org/docs/basic-features/image-optimization)
- [Remote Patterns Documentation](https://nextjs.org/docs/api-reference/next/image#remote-patterns)
