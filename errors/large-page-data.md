# Large Page Data

#### Why This Error Occurred

For one of your pages, a large amount of page data (>= 128KB) was returned which can negatively impact performance as the data needs to parsed on the client before a page can be hydrated.

#### Possible Ways to Fix It

Reduce the amount of data returned from `getStaticProps`, `getServerSideProps`, or `getInitialProps` to only the essential data to render the page.

### Useful Links

- [data-fetching documentation](https://nextjs.org/docs/basic-features/data-fetching)
