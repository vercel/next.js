# `Export Custom Routes

#### Why This Error Occurred

In your `next.config.js` you defined `rewrites`, `redirects`, or `headers` along with `output: 'export'` (or you ran `next export`).

These configs do not apply when exporting your Next.js application manually.

#### Possible Ways to Fix It

Disable the `rewrites`, `redirects`, and `headers` from your `next.config.js` when using `output: 'export'` (or `next export`) to deploy your application or deploy your application using [a method](https://nextjs.org/docs/deployment#managed-nextjs-with-vercel) that supports these configs.

### Useful Links

- [Deployment Documentation](https://nextjs.org/docs/deployment)
- [`output: 'export'` Documentation](https://nextjs.org/docs/advanced-features/static-html-export)
- [Rewrites Documentation](https://nextjs.org/docs/api-reference/next.config.js/rewrites)
- [Redirects Documentation](https://nextjs.org/docs/api-reference/next.config.js/redirects)
- [Headers Documentation](https://nextjs.org/docs/api-reference/next.config.js/headers)
