# getStaticPaths Used on Non-Dynamic Page

#### Why This Error Occurred

On a non-dynamic SSG page `getStaticPaths` was incorrectly exported as this can only be used on dynamic pages to return the paths to prerender.

#### Possible Ways to Fix It

Remove the `getStaticPaths` export on the non-dynamic page or rename the page to be a dynamic page.

### Useful Links

- [Dynamic Routes Documentation](https://nextjs.org/docs/routing/dynamic-routes)
- [`getStaticPaths` Documentation](https://nextjs.org/docs/routing/dynamic-routes)
