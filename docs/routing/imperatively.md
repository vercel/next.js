# Imperatively

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/zeit/next.js/tree/canary/examples/using-router">Using Router</a></li>
  </ul>
</details>
<br/>

`<Link>` should be able to cover most of your routing needs, but you can also do client-side navigations without it, take a look at the [Router API documentation](https://www.notion.so/zeithq/Router-push-769f057793c549e3a7190c7f1896c602).

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
