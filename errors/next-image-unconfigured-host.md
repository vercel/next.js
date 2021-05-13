# next/image Un-configured Host

#### Why This Error Occurred

On one of your pages that leverages the `next/image` component, you passed a `src` value that uses a hostname in the URL that isn't defined in the `images.domains` config in `next.config.js`.

#### Possible Ways to Fix It

Add the hostname of your URL to the `images.domains` config in `next.config.js`:

```js
// next.config.js
module.exports = {
  images: {
    domains: ['assets.example.com'],
  },
}
```

### Using Docker

If deploying to docker containers with a custom `next.config.js` make sure to copy your `next.config.js` file over to the app serve directory to accommodate the runtime config, otherwise you will still receive this error. See https://nextjs.org/docs/deployment#docker-image

### Useful Links

- [Image Optimization Documentation](https://nextjs.org/docs/basic-features/image-optimization)
