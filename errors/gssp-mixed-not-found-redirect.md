# Mixed `notFound` and `redirect`

#### Why This Error Occurred

In one of your page's `getStaticProps` or `getServerSideProps` `notFound` and `redirect` values were both returned.

These values can not both be returned at the same time and one or the other needs to be returned at a time.

#### Possible Ways to Fix It

Make sure only `notFound` **or** `redirect` is being returned on your page's `getStaticProps` or `getServerSideProps`

### Useful Links

- [`getStaticProps` Documentation](https://nextjs.org/docs/basic-features/data-fetching#getstaticprops-static-generation)
- [`getServerSideProps` Documentation](https://nextjs.org/docs/basic-features/data-fetching#getserversideprops-server-side-rendering)
