# Non-Standard Node_env

#### Why This Error Occurred

In your environment you set a non-standard value for `NODE_ENV`.

Next.js automatically sets this environment value for you and also forces the correct value during bundling to ensure the bundles are optimized and code can be tree-shaken correctly.

When you set a non-standard environment value like `staging` this causes inconsistent behavior since we override the value to the standard one during bundling e.g. `production` or `development`.

#### Possible Ways to Fix It

Remove any custom `NODE_ENV` environment variables and let Next.js automatically set the correct value for you.

### Useful Links

- [Environment Variables](https://en.wikipedia.org/wiki/Environment_variable)
