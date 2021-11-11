# SWC Failed to Load

#### Why This Message Occurred

Next.js now uses Rust-based compiler [SWC](https://swc.rs/) to compile JavaScript/TypeScript. This new compiler is up to 17x faster than Babel when compiling individual files and up to 5x faster Fast Refresh.

SWC requires a binary be downloaded that is compatible specific to your system. In some cases this binary may fail to load either from failing to download or an incompatibility with your architecture.

#### Possible Ways to Fix It

You might need to allow optional packages to be installed by your package manager (remove `--no-optional` flag) for the package to download correctly.

If SWC continues to fail to load you can opt-out by disabling `swcMinify` in your `next.config.js` or by adding a `.babelrc` to your project with the following content:

```json
{
  "presets": ["next/babel"]
}
```

Be sure to report the issue on [the feedback thread](https://github.com/vercel/next.js/discussions/30468) so that we can investigate it further.

### Useful Links

- [SWC Feedback Thread](https://github.com/vercel/next.js/discussions/30468)
- [SWC Disabled Document](https://nextjs.org/docs/messages/swc-disabled)
