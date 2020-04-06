# getStaticProps/getServerSideProps `pageProps` Conflict

#### Why This Error Occurred

In your `_app` you returned `pageProps` for a page that uses `getStaticProps` or `getServerSideProps`.

The `pageProps` value will be overridden with the result from `getStaticProps` or `getServerSideProps`

#### Possible Ways to Fix It

Only return `pageProps` from your custom `_app` when needed for a page with `getInitialProps`
