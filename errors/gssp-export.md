# getServerSideProps Export Error

#### Why This Error Occurred

You attempted to statically export your application via `next export`, however, one or more of your pages uses `getServerSideProps`.

The `getServerSideProps` lifecycle is not compatible with `next export`, so you'll need to use `next start` or a [serverless deployment](https://vercel.com).

#### Possible Ways to Fix It

1. If you'd like to keep your application static, you can use `getStaticProps` instead of `getServerSideProps`.

2. If you want to use server-side rendering, update your build command and remove `next export`. For example, in your `package.json`:

   ```diff
   diff --git a/bla.json b/bla.json
   index b84aa66c4..149e67565 100644
   --- a/bla.json
   +++ b/bla.json
   @@ -1,7 +1,7 @@
   {
     "scripts": {
       "dev": "next dev",
   -    "build": "next build && next export",
   +    "build": "next build",
       "start": "next start"
     }
   }
   ```

> **Note**: Removing `next export` does not mean your entire application is no longer static.
> Pages that use `getStaticProps` or [no lifecycle](https://nextjs.org/docs/advanced-features/automatic-static-optimization) **will still be static**!

### Useful Links

- [Automatic Static Optimization](https://nextjs.org/docs/advanced-features/automatic-static-optimization)
- [`getStaticProps` documentation](https://nextjs.org/docs/basic-features/data-fetching#getstaticprops-static-generation)
- [`exportPathMap` documentation](https://nextjs.org/docs/api-reference/next.config.js/exportPathMap)
