# Url is deprecated

#### Why This Error Occurred

In versions prior to 6.x the `url` property got magically injected into every `Page` component (every page inside the `pages` directory).

The reason this is going away is that we want to make things very predictable and explicit. Having a magical url property coming out of nowhere doesn't aid that goal.

#### Possible Ways to Fix It

https://github.com/zeit/next-codemod#url-to-withrouter

Since Next 5 we provide a way to explicitly inject the Next.js router object into pages and all their decending components.
The `router` property that is injected will hold the same values as `url`, like `pathname`, `asPath`, and `query`.

Here's an example of using `withRouter`:

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

We provide a codemod (a code to code transformation) to automatically change the `url` property usages to `withRouter`.

You can find this codemod and instructions on how to run it here: https://github.com/zeit/next-codemod#url-to-withrouter
