# Url is deprecated

#### Why This Error Occurred

In version prior to 6.x `url` got magically injected into every page component, since this is confusing and can now be added by the user using a custom `_app.js` we have deprecated this feature. To be removed in Next.js 7.0

#### Possible Ways to Fix It

The easiest way to get the same values that `url` had is to use `withRouter`:

```js
import { withRouter } from 'next/router'

class Page extends React.Component {
  render() {
    const {router} = this.props
    console.log(router)
    return <div>{router.pathname}</div>
  }
}

export default withRouter(Page)
```
