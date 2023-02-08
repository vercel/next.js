# Version Staleness

#### Why This Error Occurred

In the error overlay, a message was shown that the detected Next.js version was out-of-date.

To get the newest features and bug fixes, it is recommended to stay up to date.

#### Possible Ways to Fix It

If you are testing out a canary release, upgrade Next.js with one of the following:

```sh
npm i next@canary
```

```sh
yarn add next@canary
```

```sh
pnpm add next@canary
```

If you are using a stable release, upgrade Next.js with one of the following:

```sh
npm i next@latest
```

```sh
yarn add next@latest
```

```sh
pnpm add next@latest
```

If you are coming from an older major version, check out our [upgrade guides](https://nextjs.org/docs/upgrading).

### Note

If you want to report a bug on GitHub, you should upgrade to the newest canary release of Next.js first, to see if the bug has already been fixed in canary.

### Useful Links

- [Upgrade guide](https://nextjs.org/docs/upgrading)
- [Video: How to Contribute to Open Source (Next.js)](https://www.youtube.com/watch?v=cuoNzXFLitc)
- [Contributing to Next.js](https://github.com/vercel/next.js/blob/canary/contributing.md)
- [Triaging issues](https://github.com/vercel/next.js/blob/canary/contributing/repository/triaging.md)
- [Verifiying canary](https://github.com/vercel/next.js/blob/canary/.github/actions/issue-validator/canary.md)
- [Adding a reproduction](https://github.com/vercel/next.js/blob/canary/.github/actions/issue-validator/repro.md)
