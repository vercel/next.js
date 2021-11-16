# React Hydration Error

#### Why This Error Occurred

While rendering your application, different content was returned on the server than on the first render on the client (hydration).

This can cause the react tree to be out of sync with the DOM and result in unexpected content/attributes being present.

#### Possible Ways to Fix It

Look for any differences in rendering on the server that rely on `typeof window` or `process.browser` checks that could cause a difference when rendered in the browser and delay these until after the component has mounted (after hydration).

Ensure consistent values are being used, for example, don't render `Date.now()` directly in the component tree and instead set an initial value in `getStaticProps` which is updated after hydration `useEffect(() => {}, [])`.

### Useful Links

- [React Hydration Documentation](https://reactjs.org/docs/react-dom.html#hydrate)
