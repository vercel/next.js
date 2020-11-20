# Redirect During getStaticProps Prerendering

#### Why This Error Occurred

The `redirect` value was returned from `getStaticProps` during prerendering which is invalid.

#### Possible Ways to Fix It

Remove any paths that result in a redirect from being prerendered in `getStaticPaths` and enable `fallback: true` to handle redirecting for these pages.

### Useful Links

- [Data Fetching Documentation](https://nextjs.org/docs/basic-features/data-fetching#getstaticprops-static-generation)
