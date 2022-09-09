# Large Page Data

#### Why This Error Occurred

One of your pages includes a large amount of page data (>= 128kB). This can negatively impact performance since page data must be parsed by the client before the page is hydrated.

#### Possible Ways to Fix It

Reduce the amount of data returned from `getStaticProps`, `getServerSideProps`, or `getInitialProps` to only the essential data to render the page. The default threshold of 128kB can be configured in `largePageDataBytes` if absolutely necessary and the performance implications are understood.

### Useful Links

- [Data Fetching Documentation](https://nextjs.org/docs/basic-features/data-fetching/overview)
