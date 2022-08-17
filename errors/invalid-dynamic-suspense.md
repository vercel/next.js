# Invalid Usage of `suspense` Option of `next/dynamic`

#### Why This Error Occurred

- You are using `{ suspense: true }` with React version older than 18.
- You are using `{ suspense: true, ssr: false }`.

#### Possible Ways to Fix It

**If you are using `{ suspense: true }` with React version older than 18**

- You can try upgrading to React 18 or newer
- If upgrading React is not an option, remove `{ suspense: true }` from `next/dynamic` usages.

**If you are using `{ suspense: true, ssr: false }`**

Next.js will use `React.lazy` when `suspense` is set to true. React 18 or newer will always try to resolve the Suspense boundary on the server. This behavior can not be disabled, thus the `ssr: false` is ignored with `suspense: true`.

- You should write code that works in both client-side and server-side.
- If rewriting the code is not an option, remove `{ suspense: true }` from `next/dynamic` usages.

### Useful Links

- [Dynamic Import Suspense Usage](https://nextjs.org/docs/advanced-features/dynamic-import#with-suspense)
