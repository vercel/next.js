# Deprecated target config

#### Why This Error Occurred

The `target` property in `next.config.js` has been deprecated. Please migrate to leverage the default target instead.

#### Possible Ways to Fix It

Start by removing `target` in your `next.config.js`. Then look at one of the approaches below:

- When deploying to [Vercel](https://vercel.com) there are no further steps.
- When deploying to containers (e.g. using Docker) you can leverage [`outputStandalone`](https://nextjs.org/docs/advanced-features/output-file-tracing#automatically-copying-traced-files-experimental) to reduce image size
- For serverless cases you can leverage [Output File Tracing](https://nextjs.org/docs/advanced-features/output-file-tracing)

### Useful Links

- [Output File Tracing Documentation](https://nextjs.org/docs/advanced-features/output-file-tracing)
