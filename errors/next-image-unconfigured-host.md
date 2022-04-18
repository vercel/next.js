# next/image Un-configured Host

#### Why This Error Occurred

On one of your pages that leverages the `next/image` component, you passed a `src` value that uses a hostname in the URL that isn't defined in the `images.remotePatterns` or `images.domains` config in `next.config.js`.

#### Possible Ways to Fix It

For Next.js 12.2.0 or newer, add the hostname of your URL to the `images.remotePatterns` config in `next.config.js`:

```js
// next.config.js
module.exports = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'assets.example.com',
        port: '',
      },
    ],
  },
}
```

For older versions of Next.js, add the hostname of your URL to the `images.domains` config in `next.config.js`:

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
