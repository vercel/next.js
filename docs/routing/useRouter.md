# useRouter

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/zeit/next.js/tree/canary/examples/dynamic-routing">Dynamic Routing</a></li>
  </ul>
</details>
<br/>

If you want to access the [`router`](https://www.notion.so/zeithq/Router-Object-580270ec245444ed9253c529b1db0315) object inside any function component in your app, you can use the `useRouter` hook, take a look at the following example:

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

The `router` object returned by `useRouter()` is defined [here](https://www.notion.so/zeithq/Router-Object-580270ec245444ed9253c529b1db0315).

> `useRouter` is a [React Hook](https://reactjs.org/docs/hooks-intro.html), meaning it cannot be used with classes. You can either use [withRouter](https://www.notion.so/zeithq/withRouter-ebcdae351eae4b8f84db2f2a26d0e505) or wrap your class in a function component.
