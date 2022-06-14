# `next export` with Image API

#### Why This Error Occurred

You are attempting to run `next export` while importing the `next/image` component using the default `loader` configuration.

However, the default `loader` relies on the Image Optimization API which is not available for exported applications.

This is because Next.js optimizes images on-demand, as users request them (not at build time).

#### Possible Ways to Fix It

- Use [`next start`](https://nextjs.org/docs/api-reference/cli#production) to run a server, which includes the Image Optimization API.
- Use any provider which supports Image Optimization (such as [Vercel](https://vercel.com)).
- [Configure the loader](https://nextjs.org/docs/api-reference/next/image#loader-configuration) in `next.config.js`.
- Use the [`loader`](https://nextjs.org/docs/api-reference/next/image#loader) prop for each instance of `next/image`.

If you do not wish to use Image Optimization, it can be disabled with the following `next.config.js`:

```js
module.exports = {
  images: {
    loader: 'unoptimized',
  },
}
```

### Useful Links

- [Deployment Documentation](https://nextjs.org/docs/deployment#managed-nextjs-with-vercel)
- [Image Optimization Documentation](https://nextjs.org/docs/basic-features/image-optimization)
- [`next export` Documentation](https://nextjs.org/docs/advanced-features/static-html-export)
- [`next/image` Documentation](https://nextjs.org/docs/api-reference/next/image)
- [Vercel Documentation](https://vercel.com/docs/concepts/next.js/image-optimization)
