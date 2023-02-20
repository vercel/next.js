# NextRouter was not mounted

#### Why This Error Occurred

A component used `useRouter` outside a Next.js application, or was rendered outside a Next.js application. This can happen when doing unit testing on components that use the `useRouter` hook as they are not configured with Next.js' contexts.

#### Possible Ways to Fix It

If used in a test, mock out the router by mocking the `next/router`'s `useRouter()` hook.

### Useful Links

- [next-router-mock](https://www.npmjs.com/package/next-router-mock)
