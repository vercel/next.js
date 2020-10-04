---
description: AMP pages are automatically validated by Next.js during development and on build. Learn more about it here.
---

# AMP Validation

AMP pages are automatically validated with [amphtml-validator](https://www.npmjs.com/package/amphtml-validator) during development. Errors and warnings will appear in the terminal where you started Next.js.

Pages are also validated during [Static HTML export](/docs/advanced-features/static-html-export.md) and any warnings / errors will be printed to the terminal. Any AMP errors will cause the export to exit with status code `1` because the export is not valid AMP.

### Custom Validators

You can set up custom AMP validator in `next.config.js` as shown below:

```jsx
module.exports = {
  amp: {
    validator: './custom_validator.js',
  },
}
```

### Skip AMP Validation

To turn off AMP validation add the following code to `next.config.js`

```jsx
experimental: {
  amp: {
    skipValidation: true
  }
}
```
