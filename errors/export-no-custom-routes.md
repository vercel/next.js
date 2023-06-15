# Export Custom Routes

#### Why This Error Occurred

In your `next.config.js` you defined `rewrites`, `redirects`, or `headers` along with `output: 'export'` (or you ran `next export`).

These configs do not apply when exporting your Next.js application manually.

#### Possible Ways to Fix It

- Remove `rewrites`, `redirects`, and `headers` from your `next.config.js` to disable these features or
- Remove `output: 'export'` (or `next export`) in favor of [`next start`](https://nextjs.org/docs/api-reference/cli#production) to run a production server

### Useful Links

- [Deployment Documentation](https://nextjs.org/docs/deployment)
- [`output: 'export'` Documentation](https://nextjs.org/docs/advanced-features/static-html-export)
- [Rewrites Documentation](https://nextjs.org/docs/api-reference/next.config.js/rewrites)
- [Redirects Documentation](https://nextjs.org/docs/api-reference/next.config.js/redirects)
- [Headers Documentation](https://nextjs.org/docs/api-reference/next.config.js/headers)
