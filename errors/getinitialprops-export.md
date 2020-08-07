# getInitialProps Export Warning

#### Why This Warning Occurred

You attempted to statically export your application via `next export`, however, one or more of your pages uses `getInitialProps`.

Next.js discourage you to use `getInitialProps`.

#### Possible Ways to Fix It

Next.js has a proper SSG support, so usage of `next export` should always be paired with `getStaticProps`.

#### Useful Links

- [`getStaticProps` documentation](https://nextjs.org/docs/basic-features/data-fetching#getstaticprops-static-generation)
