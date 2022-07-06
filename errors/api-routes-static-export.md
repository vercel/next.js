# API routes in Static export

#### Why This Warning Occurred

An `exportPathMap` path was matched to an API route. Statically exporting a Next.js application via `next export` disables API routes.

This command is meant for a static-only setup, and is not necessary to make your application static. Pages in your application without server-side data dependencies will be automatically statically exported by `next build`, including pages powered by `getStaticProps`

#### Possible Ways to Fix It

Use `next build` with platforms that don't require `next export` like https://vercel.com or remove any paths using API routes from your `exportPathMap` in `next.config.js`.

### Useful Links

- [Static HTML export](https://nextjs.org/docs/advanced-features/static-html-export)
