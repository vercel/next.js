# SWC Failed to Load

#### Why This Message Occurred

Next.js now uses Rust-based compiler [SWC](https://swc.rs/) to compile JavaScript/TypeScript. This new compiler is up to 17x faster than Babel when compiling individual files and up to 5x faster Fast Refresh.

SWC requires a binary be downloaded that is compatible specific to your system. In some cases this binary may fail to load either from failing to download or an incompatibility with your architecture.

#### Possible Ways to Fix It

When on an M1 Mac and switching from a Node.js version without M1 support e.g. v14 to a version with e.g. v16, you may need a different swc dependency which can require re-installing `node_modules` (`npm i --force` or `yarn install --force`).

On Windows make sure you have Microsoft Visual C++ Redistributable installed. https://docs.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist

Alternatively, you might need to allow optional packages to be installed by your package manager (remove `--no-optional` flag) for the package to download correctly.

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
