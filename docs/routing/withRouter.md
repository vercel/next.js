# withRouter

If [useRouter](https://www.notion.so/zeithq/useRouter-9366b2aaca924f3db8bed5a43aa887ad) is not the best fit for you, `withRouter` can also add the same `[router](https://www.notion.so/zeithq/Router-Object-580270ec245444ed9253c529b1db0315)` object to any component, here's how to use it:

```jsx
import { withRouter } from 'next/router'

function Page({ router }) {
  return <p>{router.pathname}</p>
}

export default withRouter(Page)
```
