# Opening a new Issue

#### Why This Message Occurred

When `next info` was run, Next.js detected that it's was not on the latest canary release.

`next@canary` is the canary version of Next.js that ships daily. It includes all features and fixes that have not been released to the stable version yet. Think of canary as a public beta.

Some issues might have already been fixed there, so before opening a new issue on the repository, make sure to verify if the issue hasn't been fixed in the canary version already.

Run the following in the codebase:

```sh
npm install next@canary
```

or

```sh
yarn add next@canary
```

And go through the prepared reproduction steps once again, and check if the issue still exists.

### Useful Links

- [Video: How to Contribute to Open Source (Next.js)](https://www.youtube.com/watch?v=cuoNzXFLitc)
- [Contributing to Next.js](https://github.com/vercel/next.js/blob/canary/contributing.md)
