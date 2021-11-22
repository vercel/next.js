# Invalid argument in `next/dynamic` call

#### Why This Error Occurred

You have passed an invalid argument to a `next/dynamic` call.

- The `import()` call must be inside the `dynamic()` call.
- The options object literal must be created inside the `dynamic()` call.

#### Possible Ways to Fix It

**Before**

```jsx
import dynamic from 'next/dynamic'

const module = () => import('../components/hello')
const options = { loading: () => <p>...</p>, ssr: false }
const DynamicComponent = dynamic(module, options)
```

**After**

```jsx
import dynamic from 'next/dynamic'

const DynamicComponent = dynamic(() => import('../components/hello'), {
  loading: () => <p>...</p>,
  ssr: false,
})
```

### Useful Links

- [Dynamic Import](https://nextjs.org/docs/advanced-features/dynamic-import)
