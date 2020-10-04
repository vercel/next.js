# Non-Standard NODE_ENV

#### Why This Error Occurred

Your environment has a non-standard `NODE_ENV` value configured.

This may be by accident, so if you're unaware where the value is coming from, check the following:

- The `.env*` files in your project, if present
- Your `~/.bash_profile`, if present
- Your `~/.zshrc`, if present

The greater React ecosystem treats `NODE_ENV` as a convention, only permitting three (3) values:

- `production`: When your application is built with `next build`
- `development`: When your application is ran with `next dev`
- `test`: When your application is being tested (e.g. `jest`)

Setting a non-standard `NODE_ENV` value may cause dependencies to behave unexpectedly, or worse, **break dead code elimination**.

#### Possible Ways to Fix It

To fix this error, identify the source of the erroneous `NODE_ENV` value and get rid of it: Next.js automatically sets the correct value for you.

If you need the concept of different environments in your application, e.g. `staging`, you should use a different environment variable name like `APP_ENV`.

### Useful Links

- [Environment Variables](https://en.wikipedia.org/wiki/Environment_variable)
