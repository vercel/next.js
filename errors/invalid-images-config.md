# Invalid images config

#### Why This Error Occurred

In your `next.config.js` file you provided an invalid config for the `images` field.

#### Possible Ways to Fix It

Make sure your `images` field follows the allowed config shape and values:

```js
module.exports = {
  images: {
    // limit of 25 deviceSizes values
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    // limit of 25 imageSizes values
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    // limit of 50 domains values
    domains: [],
    path: '/_next/image',
    // loader can be 'default', 'imgix', 'cloudinary', 'akamai', or 'custom'
    loader: 'default',
    // disable static imports for image files
    disableStaticImages: false,
    // minimumCacheTTL is in seconds, must be integer 0 or more
    minimumCacheTTL: 60,
  },
}
```

### Useful Links

- [Image Optimization Documentation](https://nextjs.org/docs/basic-features/image-optimization)
