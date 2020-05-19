# getServerSideProps Export Error

#### Why This Error Occurred

You attempted to export a page with `getServerSideProps` which is not allowed. `getServerSideProps` is meant for requesting up to date information on every request which means exporting it defeats the purpose of the method.

#### Possible Ways to Fix It

If you would like the page be static you can leverage the `getStaticProps` method instead.

### Useful Links

- [`getStaticProps` documentation](https://nextjs.org/docs/basic-features/data-fetching#getstaticprops-static-generation)
- [`exportPathMap` documentation](https://nextjs.org/docs/api-reference/next.config.js/exportPathMap)
