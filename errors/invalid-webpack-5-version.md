# Invalid webpack 5 version

#### Why This Error Occurred

While leveraging webpack 5 support in Next.js the minimum required version of `v5.15.0` was not met. This version is needed while leveraging webpack 5 support with Next.js as early versions are missing patches that cause unexpected behavior.

#### Possible Ways to Fix It

Upgrade the version of webpack 5 being used with Next.js to at least `v5.15.0` by updating your resolutions field for `webpack` in your `package.json`.

### Useful Links

- [Yarn Selective Dependency Resolutions Documentation](https://classic.yarnpkg.com/en/docs/selective-version-resolutions/)
