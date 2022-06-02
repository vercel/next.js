# Custom /\_error without /404

#### Why This Error Occurred

You added a custom `/_error` page without adding a custom `/404` page. Adding a custom `/_error` typically opts your application out of having the automatic static optimization applied to the 404 page.

#### Possible Ways to Fix It

Add a `pages/404.js` with the 404 page you would like to show.

### Useful Links

- [Automatic Static Optimization](https://nextjs.org/docs/advanced-features/automatic-static-optimization)
- [404 Page](https://nextjs.org/docs/advanced-features/custom-error-page#404-page)
