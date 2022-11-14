# `NextRouter` was not mounted

#### Why This Error Occurred

A component that used `useRouter` was rendered outside the `pages/` directory. This can happen when migrating to the `app/` directory. Situations where you also render components outside a Next.js application (like in unit tests) can also trigger this error.

#### Possible Ways to Fix It

If you're migrating components over from `pages/` to `app/`, you can take advantage of the compatibility hooks that are designed to be used in transition when components are shared between `pages/` and `app/`. Instead of writing:

```tsx
import { useRouter } from 'next/router'
```

You would write:

```tsx
import { useRouter } from 'next/compat/router'
```

When the router context is not available, this hook will return `null` instead of throwing an error. Developers should migrate over to the new router hook available at `next/navigation` which is fully supported in `app/`.

If you're unit testing components that rely on these hooks, you should mock the the `next/router`'s `useRouter()` hook instead.

### Useful Links

- [`next-router-mock`](https://www.npmjs.com/package/next-router-mock)
- [`useRouter` from `next/navigation`](https://beta.nextjs.org/docs/api-reference/use-router)
