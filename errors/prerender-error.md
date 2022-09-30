# Prerender Error

#### Why This Error Occurred

While prerendering a page an error occurred. This can occur for many reasons from adding non-pages e.g. `components` to your `pages` folder or expecting props to be populated which are not.

#### Possible Ways to Fix It

- Make sure to move any non-pages out of the `pages` folder
- Check for any code that assumes a prop is available, even when it might not be
- Set default values for all dynamic pages' props (avoid `undefined`, use `null` instead so it can be serialized)
- Check for any out of date modules that you might be relying on
- Make sure your component handles `fallback` if it is enabled in `getStaticPaths`. [Fallback docs](https://nextjs.org/docs/api-reference/data-fetching/get-static-paths#fallback-false)
- Make sure you are not trying to export (`next export`) pages that have server-side rendering enabled [(getServerSideProps)](https://nextjs.org/docs/basic-features/data-fetching/get-server-side-props)
