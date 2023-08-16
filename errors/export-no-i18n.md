# Export Internationalization (i18n)

#### Why This Error Occurred

In your `next.config.js` you defined `i18n`, along with `output: 'export'` (or you ran `next export`).

#### Possible Ways to Fix It

- Remove `i18n` from your `next.config.js` to disable Internationalization or
- Remove `output: 'export'` (or `next export`) in favor of [`next start`](https://nextjs.org/docs/api-reference/cli#production) to run a production server

### Useful Links

- [Deployment Documentation](https://nextjs.org/docs/deployment)
- [`output: 'export'` Documentation](https://nextjs.org/docs/advanced-features/static-html-export)
- [Internationalized Routing](https://nextjs.org/docs/advanced-features/i18n-routing)
