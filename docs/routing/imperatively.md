---
description: Client-side navigations are also possible using the Router API instead of the Link component. Learn more here.
---

# Imperatively

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/zeit/next.js/tree/canary/examples/using-router">Using Router</a></li>
  </ul>
</details>

[`next/link`](/docs/api-reference/next/link.md) should be able to cover most of your routing needs, but you can also do client-side navigations without it, take a look at the [Router API documentation](/docs/api-reference/next/router.md#router-api).

The following example shows the basic usage of the Router API:

```jsx
import Router from 'next/router'

function ReadMore() {
  return (
    <div>
      Click <span onClick={() => Router.push('/about')}>here</span> to read more
    </div>
  )
}

export default ReadMore
```
