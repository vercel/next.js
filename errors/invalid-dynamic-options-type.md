# Invalid options type in a `next/dynamic` call

#### Why This Error Occurred

You have an invalid options type in a `next/dynamic` call. The options must be an object literal.

#### Possible Ways to Fix It

**Before**

```jsx
import dynamic from 'next/dynamic'

const options = { loading: () => <p>...</p>, ssr: false }
const DynamicComponent = dynamic(() => import('../components/hello'), options)
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
