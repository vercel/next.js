---
description: Learn more about the API of the Next.js Router, and access the router instance in your page with the useRouter hook.
---

# next/router

> Before moving forward, we recommend you to read [Routing Introduction](/docs/routing/introduction.md) first.

## useRouter

If you want to access the [`router` object](#router-object) inside any function component in your app, you can use the `useRouter` hook, take a look at the following example:

```jsx
import { useRouter } from 'next/router'

function ActiveLink({ children, href }) {
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

export default ActiveLink
```

> `useRouter` is a [React Hook](https://reactjs.org/docs/hooks-intro.html), meaning it cannot be used with classes. You can either use [withRouter](#withRouter) or wrap your class in a function component.

### router object

The following is the definition of the `router` object returned by both [`useRouter`](#useRouter) and [`withRouter`](#withRouter):

- `route`: `String` - Current route
- `pathname`: `String` - Current path excluding the query string
- `query`: `Object` - The query string parsed to an object. Defaults to `{}`
- `asPath`: `String` - Actual path (including the query) shown in the browser

Additionally, the [`Router API`](#router-api) is also included inside the object.

> The `query` object will be empty during prerendering if the page is [statically optimized](/docs/advanced-features/automatic-static-optimization.md).

## withRouter

If [`useRouter`](#useRouter) is not the best fit for you, `withRouter` can also add the same [`router` object](#router-object) to any component, here's how to use it:

```jsx
import { withRouter } from 'next/router'

function Page({ router }) {
  return <p>{router.pathname}</p>
}

export default withRouter(Page)
```

## Router API

The API of `Router`, exported by `next/router`, is defined below.

### Router.push

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/zeit/next.js/tree/canary/examples/using-router">Using Router</a></li>
  </ul>
</details>

Handles client-side transitions, this method is useful for cases where [`next/link`](/docs/api-reference/next/link.md) is not enough.

```jsx
import Router from 'next/router'

Router.push(url, as, options)
```

- `url` - The URL to navigate to. This is usually the name of a `page`
- `as` - Optional decorator for the URL that will be shown in the browser. Defaults to `url`
- `options` - Optional object with the following configuration options:
  - [`shallow`](/docs/routing/shallow-routing.md): Update the path of the current page without rerunning `getInitialProps`. Defaults to `false`

> You don't need to use `Router` for external URLs, [window.location](https://developer.mozilla.org/en-US/docs/Web/API/Window/location) is better suited for those cases.

#### Usage

Navigating to `pages/about.js`, which is a predefined route:

```jsx
import Router from 'next/router'

function Page() {
  return <span onClick={() => Router.push('/about')}>Click me</span>
}
```

Navigating `pages/post/[pid].js`, which is a dynamic route:

```jsx
import Router from 'next/router'

function Page() {
  return (
    <span onClick={() => Router.push('/post/[pid]', '/post/abc')}>
      Click me
    </span>
  )
}
```

#### With URL object

You can use an URL object in the same way you can use it for [`next/link`](/docs/api-reference/next/link.md#with-url-object). Works for both the `url` and `as` parameters:

```jsx
import Router from 'next/router'

const handler = () => {
  Router.push({
    pathname: '/about',
    query: { name: 'Zeit' },
  })
}

function ReadMore() {
  return (
    <div>
      Click <span onClick={handler}>here</span> to read more
    </div>
  )
}

export default ReadMore
```

### Router.replace

Similar to the `replace` prop in [`next/link`](/docs/api-reference/next/link.md), `Router.replace` will prevent adding a new URL entry into the `history` stack, take a look at the following example:

```jsx
import Router from 'next/router'

Router.replace('/home')
```

The API for `Router.replace` is exactly the same as that used for [`Router.push`](#router.push).

### Router.beforePopState

In some cases (for example, if using a [Custom Server](/docs/advanced-features/custom-server.md)), you may wish to listen to [popstate](https://developer.mozilla.org/en-US/docs/Web/Events/popstate) and do something before the router acts on it.

You could use this to manipulate the request, or force a SSR refresh, as in the following example:

```jsx
import Router from 'next/router'

Router.beforePopState(({ url, as, options }) => {
  // I only want to allow these two routes!
  if (as !== '/' && as !== '/other') {
    // Have SSR render bad routes as a 404.
    window.location.href = as
    return false
  }

  return true
})
```

`Router.beforePopState(cb: () => boolean)`

- `cb` - The function to execute on incoming `popstate` events. The function receives the state of the event as an object with the following props:
  - `url`: `String` - the route for the new state. This is usually the name of a `page`
  - `as`: `String` - the url that will be shown in the browser
  - `options`: `Object` - Additional options sent by [Router.push](#router.push)

If the function you pass into `beforePopState` returns `false`, `Router` will not handle `popstate` and you'll be responsible for handling it, in that case. See [Disabling file-system routing](/docs/advanced-features/custom-server.md#disabling-file-system-routing).

### Router.events

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/zeit/next.js/tree/canary/examples/with-loading">With a page loading indicator</a></li>
  </ul>
</details>

You can listen to different events happening inside the Router. Here's a list of supported events:

- `routeChangeStart(url)` - Fires when a route starts to change
- `routeChangeComplete(url)` - Fires when a route changed completely
- `routeChangeError(err, url)` - Fires when there's an error when changing routes, or a route load is cancelled
  - `err.cancelled` - Indicates if the navigation was cancelled
- `beforeHistoryChange(url)` - Fires just before changing the browser's history
- `hashChangeStart(url)` - Fires when the hash will change but not the page
- `hashChangeComplete(url)` - Fires when the hash has changed but not the page

> Here `url` is the URL shown in the browser. If you call `Router.push(url, as)` (or similar), then the value of `url` will be `as`.

For example, to listen to the router event `routeChangeStart`, do the following:

```jsx
import Router from 'next/router'

const handleRouteChange = url => {
  console.log('App is changing to: ', url)
}

Router.events.on('routeChangeStart', handleRouteChange)
```

If you no longer want to listen to the event, unsubscribe with the `off` method:

```jsx
import Router from 'next/router'

Router.events.off('routeChangeStart', handleRouteChange)
```

If a route load is cancelled (for example, by clicking two links rapidly in succession), `routeChangeError` will fire. And the passed `err` will contain a `cancelled` property set to `true`, as in the following example:

```jsx
import Router from 'next/router'

Router.events.on('routeChangeError', (err, url) => {
  if (err.cancelled) {
    console.log(`Route to ${url} was cancelled!`)
  }
})
```

Router events should be registered when a component mounts ([useEffect](https://reactjs.org/docs/hooks-effect.html) or [componentDidMount](https://reactjs.org/docs/react-component.html#componentdidmount) / [componentWillUnmount](https://reactjs.org/docs/react-component.html#componentwillunmount)) or imperatively when an event happens, as in the following example:

```jsx
import Router from 'next/router'

useEffect(() => {
  const handleRouteChange = url => {
    console.log('App is changing to: ', url)
  }

  Router.events.on('routeChangeStart', handleRouteChange)
  return () => {
    Router.events.off('routeChangeStart', handleRouteChange)
  }
}, [])
```
