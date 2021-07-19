# Static page generation timed out after multiple attempts

#### Why This Error Occurred

Next.js tries to restart the worker pool of the static page generation when no progress happens for a while, to avoid hanging builds.

When restarted it will retry all uncompleted jobs, but if a job was unsuccessfully attempted multiple times, this will lead to an error.

#### Possible Ways to Fix It

- Make sure that there is no infinite loop during execution.
- Make sure all Promises in `getStaticProps` `resolve` or `reject` correctly.
- Avoid very long timeouts for network requests.
- Increase the timeout by changing the `experimental.staticPageGenerationTimeout` configuration option (default `60` in seconds).

### Useful Links

- [`getStaticProps`](https://nextjs.org/docs/basic-features/data-fetching#getstaticprops-static-generation)
