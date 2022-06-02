# Built-in CSS Support Disabled

#### Why This Error Occurred

Custom CSS configuration was added in `next.config.js` which disables the built-in CSS/SCSS support to prevent conflicting configuration.

A legacy plugin such as `@zeit/next-css` being added in `next.config.js` can cause this message.

#### Possible Ways to Fix It

If you would like to leverage the built-in CSS/SCSS support you can remove any custom CSS configuration or any plugins like `@zeit/next-css` or `@zeit/next-sass` in your `next.config.js`.

If you would prefer not to leverage the built-in support you can ignore this message.

### Useful Links

- [Built-in CSS Support docs](https://nextjs.org/docs/basic-features/built-in-css-support)
- [Custom webpack config docs](https://nextjs.org/docs/api-reference/next.config.js/custom-webpack-config)
