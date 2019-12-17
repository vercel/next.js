# Injecting the router

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/zeit/next.js/tree/canary/examples/dynamic-routing">Dynamic Routing</a></li>
  </ul>
</details>

To use the router in a React component you can use `useRouter` or `withRouter`.

In general we recommend using `useRouter`.

## useRouter

If you want to access the [`router`](/docs/routing/router-object.md) object inside any function component in your app, you can use the `useRouter` hook, take a look at the following example:

```jsx
import { useRouter } from 'next/router'

export default function ActiveLink({ children, href }) {
  const router = useRouter()
  const style = {
    marginRight: 10,
    color: router.pathname === href ? 'red' : 'black',
  }

  const handleClick = e => {
    e.preventDefault()
    router.push(href)
  }

  return (
    <a href={href} onClick={handleClick} style={style}>
      {children}
    </a>
  )
}
```

The `router` object returned by `useRouter()` is defined [here](/docs/routing/router-object.md).

> `useRouter` is a [React Hook](https://reactjs.org/docs/hooks-intro.html), meaning it cannot be used with classes. You can either use [withRouter](#withRouter) or wrap your class in a function component.

## withRouter

If [useRouter](#useRouter) is not the best fit for you, `withRouter` can also add the same [`router`](/docs/routing/router-object.md) object to any component, here's how to use it:

```jsx
import { withRouter } from 'next/router'

function Page({ router }) {
  return <p>{router.pathname}</p>
}

export default withRouter(Page)
```

## Related

For more information on what to do next, we recommend the following sections:

<div class="card">
  <a href="/docs/api-reference/next/router.md">
    <b>next/router</b>
    <small>Learn more about the API for `next/router`.</small>
  </a>
</div>
