# `next export` with Image API

#### Why This Error Occurred

You are attempting to run `next export` while importing the `next/image` component configured using the default `loader`.

However, the default `loader` relies on the Image Optimization API which is not available for exported applications.

This is because Next.js optimizes images on-demand, as users request them (not at build time).

#### Possible Ways to Fix It

- Use `next start` to run a server, which includes the Image Optimization API.
- Use any provider which supports Image Optimization (like [Vercel](https://vercel.com/docs/next.js/image-optimization)).
- Configure a third-party [loader](https://nextjs.org/docs/basic-features/image-optimization#loader) in `next.config.js`.
- Use the [`loader`](https://nextjs.org/docs/api-reference/next/image#loader) prop for `next/image`.

### Useful Links

- [Deployment Documentation](https://nextjs.org/docs/deployment#vercel-recommended)
- [Image Optimization Documentation](https://nextjs.org/docs/basic-features/image-optimization)
- [`next export` Documentation](https://nextjs.org/docs/advanced-features/static-html-export)
- [`next/image` Documentation](https://nextjs.org/docs/api-reference/next/image)
- [Vercel Documentation](https://vercel.com/docs/next.js/image-optimization)
