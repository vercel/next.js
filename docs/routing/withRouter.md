# withRouter

If [useRouter](/docs/routing/useRouter.md) is not the best fit for you, `withRouter` can also add the same `[router](/docs/routing/router-object.md)` object to any component, here's how to use it:

```jsx
import { withRouter } from 'next/router'

function Page({ router }) {
  return <p>{router.pathname}</p>
}

export default withRouter(Page)
```
