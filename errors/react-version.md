# Minimum React Version

#### Why This Error Occurred

Your project is using an old version of `react` or `react-dom` that does not
meet the suggested minimum version requirement.

Next.js suggests using, at a minimum, `react@17.0.1` and `react-dom@17.0.1`.
Older versions of `react` and `react-dom` do work with Next.js, however, they do
not enable all of Next.js' features.

For example, the following features are not enabled with old React versions:

- [Fast Refresh](https://nextjs.org/docs/basic-features/fast-refresh): instantly
  view edits to your app without losing component state
- Component stack trace in development: see the component tree that lead up to
  an error
- Hydration mismatch warnings: trace down discrepancies in your React tree that
  cause performance problems

This list is not exhaustive, but illustrative in the value of upgrading React!

#### Possible Ways to Fix It

**Via npm**

```bash
npm upgrade react@latest react-dom@latest
```

**Via Yarn**

```bash
yarn add react@latest react-dom@latest
```

**Manually** Open your `package.json` and upgrade `react` and `react-dom`:

```json
{
  "dependencies": {
    "react": "^17.0.1",
    "react-dom": "^17.0.1"
  }
}
```

### Useful Links

- [Fast Refresh blog post](https://nextjs.org/blog/next-9-4#fast-refresh)
- [Fast Refresh docs](https://nextjs.org/docs/basic-features/fast-refresh)
