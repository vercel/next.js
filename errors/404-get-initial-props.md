# 404.js Cannot Have getInitialProps

#### Why This Error Occurred

In your `404.js` page you added `getInitialProps` or `getServerSideProps` which is not allowed as this prevents the page from being static and `404.js` is meant to provide more flexibility for a static 404 page. Having a static 404 page is the most ideal as this page can be served very often and if not static puts extra strain on your server and more invocations for serverless functions which increase the cost of hosting your site unnecessarily.

#### Possible Ways to Fix It

Remove `getInitialProps` from `404.js` and make sure no HOC's used in `404.js` attach `getInitialProps`.

If you want to fetch data for your `404.js` page move it to a client side fetch inside of `componentDidMount` or `useEffect(() => {}, [])`.

### Useful Links

- [Automatic Static Optimization](https://nextjs.org/docs/advanced-features/automatic-static-optimization)
