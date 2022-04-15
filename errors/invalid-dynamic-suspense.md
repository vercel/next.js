# Invalid Usage of `suspense` Option of `next/dynamic`

#### Why This Error Occurred

`<Suspense>` is not allowed under legacy render mode when using React older than v18.

#### Possible Ways to Fix It

Remove `suspense: true` option in `next/dynamic` usages.

### Useful Links

- [Dynamic Import Suspense Usage](https://nextjs.org/docs/advanced-features/dynamic-import#with-suspense)
