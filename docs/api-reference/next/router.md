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
    color: router.asPath === href ? 'red' : 'black',
  }

  const handleClick = (e) => {
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

## `router` object

The following is the definition of the `router` object returned by both [`useRouter`](#useRouter) and [`withRouter`](#withRouter):

- `pathname`: `String` - Current route. That is the path of the page in `/pages`, the configured `basePath` or `locale` is not included.
- `query`: `Object` - The query string parsed to an object. It will be an empty object during prerendering if the page doesn't have [data fetching requirements](/docs/basic-features/data-fetching.md). Defaults to `{}`
- `asPath`: `String` - The path (including the query) shown in the browser without the configured `basePath` or `locale`.
- `isFallback`: `boolean` - Whether the current page is in [fallback mode](/docs/basic-features/data-fetching.md#fallback-pages).
- `basePath`: `String` - The active [basePath](/docs/api-reference/next.config.js/basepath.md) (if enabled).
- `locale`: `String` - The active locale (if enabled).
- `locales`: `String[]` - All supported locales (if enabled).
- `defaultLocale`: `String` - The current default locale (if enabled).
- `domainLocales`: `Array<{domain, defaultLocale, locales}>` - Any configured domain locales.
- `isReady`: `boolean` - Whether the router fields are updated client-side and ready for use. Should only be used inside of `useEffect` methods and not for conditionally rendering on the server.
- `isPreview`: `boolean` - Whether the application is currently in [preview mode](/docs/advanced-features/preview-mode.md).

Additionally, the following methods are also included inside `router`:

### router.push

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/using-router">Using Router</a></li>
  </ul>
</details>

Handles client-side transitions, this method is useful for cases where [`next/link`](/docs/api-reference/next/link.md) is not enough.

```jsx
router.push(url, as, options)
```

- `url` - The URL to navigate to
- `as` - Optional decorator for the URL that will be shown in the browser. Before Next.js 9.5.3 this was used for dynamic routes, check our [previous docs](https://nextjs.org/docs/tag/v9.5.2/api-reference/next/link#dynamic-routes) to see how it worked
- `options` - Optional object with the following configuration options:
  - `scroll` - Optional boolean, controls scrolling to the top of the page after navigation. Defaults to `true`
  - [`shallow`](/docs/routing/shallow-routing.md): Update the path of the current page without rerunning [`getStaticProps`](/docs/basic-features/data-fetching.md#getstaticprops-static-generation), [`getServerSideProps`](/docs/basic-features/data-fetching.md#getserversideprops-server-side-rendering) or [`getInitialProps`](/docs/api-reference/data-fetching/getInitialProps.md). Defaults to `false`
  - `locale` - Optional string, indicates locale of the new page

> You don't need to use `router.push` for external URLs. [window.location](https://developer.mozilla.org/en-US/docs/Web/API/Window/location) is better suited for those cases.

#### Usage

Navigating to `pages/about.js`, which is a predefined route:

```jsx
import { useRouter } from 'next/router'

export default function Page() {
  const router = useRouter()

  return (
    <button type="button" onClick={() => router.push('/about')}>
      Click me
    </button>
  )
}
```

Navigating `pages/post/[pid].js`, which is a dynamic route:

```jsx
import { useRouter } from 'next/router'

export default function Page() {
  const router = useRouter()

  return (
    <button type="button" onClick={() => router.push('/post/abc')}>
      Click me
    </button>
  )
}
```

> **Note:** When navigating to the same page in Next.js, the page's state **will not** be reset by default, as the top-level React component is the same. You can manually ensure the state is updated using `useEffect`.

Redirecting the user to `pages/login.js`, useful for pages behind [authentication](/docs/authentication):

```jsx
import { useEffect } from 'react'
import { useRouter } from 'next/router'

// Here you would fetch and return the user
const useUser = () => ({ user: null, loading: false })

export default function Page() {
  const { user, loading } = useUser()
  const router = useRouter()

  useEffect(() => {
    if (!(user || loading)) {
      router.push('/login')
    }
  }, [user, loading])

  return <p>Redirecting...</p>
}
```

#### With URL object

You can use a URL object in the same way you can use it for [`next/link`](/docs/api-reference/next/link.md#with-url-object). Works for both the `url` and `as` parameters:

```jsx
import { useRouter } from 'next/router'

export default function ReadMore({ post }) {
  const router = useRouter()

  return (
    <button
      type="button"
      onClick={() => {
        router.push({
          pathname: '/post/[pid]',
          query: { pid: post.id },
        })
      }}
    >
      Click here to read more
    </button>
  )
}
```

### router.replace

Similar to the `replace` prop in [`next/link`](/docs/api-reference/next/link.md), `router.replace` will prevent adding a new URL entry into the `history` stack.

```jsx
router.replace(url, as, options)
```

- The API for `router.replace` is exactly the same as the API for [`router.push`](#router.push).

#### Usage

Take a look at the following example:

```jsx
import { useRouter } from 'next/router'

export default function Page() {
  const router = useRouter()

  return (
    <button type="button" onClick={() => router.replace('/home')}>
      Click me
    </button>
  )
}
```

### router.prefetch

Prefetch pages for faster client-side transitions. This method is only useful for navigations without [`next/link`](/docs/api-reference/next/link.md), as `next/link` takes care of prefetching pages automatically.

> This is a production only feature. Next.js doesn't prefetch pages on development.

```jsx
router.prefetch(url, as)
```

- `url` - The URL to prefetch, that is, a path with a matching page
- `as` - Optional decorator for `url`. Before Next.js 9.5.3 this was used to prefetch dynamic routes, check our [previous docs](https://nextjs.org/docs/tag/v9.5.2/api-reference/next/link#dynamic-routes) to see how it worked

#### Usage

Let's say you have a login page, and after a login, you redirect the user to the dashboard. For that case, we can prefetch the dashboard to make a faster transition, like in the following example:

```jsx
import { useCallback, useEffect } from 'react'
import { useRouter } from 'next/router'

export default function Login() {
  const router = useRouter()
  const handleSubmit = useCallback((e) => {
    e.preventDefault()

    fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        /* Form data */
      }),
    }).then((res) => {
      // Do a fast client-side transition to the already prefetched dashboard page
      if (res.ok) router.push('/dashboard')
    })
  }, [])

  useEffect(() => {
    // Prefetch the dashboard page
    router.prefetch('/dashboard')
  }, [])

  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
      <button type="submit">Login</button>
    </form>
  )
}
```

### router.beforePopState

In some cases (for example, if using a [Custom Server](/docs/advanced-features/custom-server.md)), you may wish to listen to [popstate](https://developer.mozilla.org/en-US/docs/Web/Events/popstate) and do something before the router acts on it.

```jsx
router.beforePopState(cb)
```

- `cb` - The function to run on incoming `popstate` events. The function receives the state of the event as an object with the following props:
  - `url`: `String` - the route for the new state. This is usually the name of a `page`
  - `as`: `String` - the url that will be shown in the browser
  - `options`: `Object` - Additional options sent by [router.push](#router.push)

If `cb` returns `false`, the Next.js router will not handle `popstate`, and you'll be responsible for handling it in that case. See [Disabling file-system routing](/docs/advanced-features/custom-server.md#disabling-file-system-routing).

#### Usage

You could use `beforePopState` to manipulate the request, or force a SSR refresh, as in the following example:

```jsx
import { useEffect } from 'react'
import { useRouter } from 'next/router'

export default function Page() {
  const router = useRouter()

  useEffect(() => {
    router.beforePopState(({ url, as, options }) => {
      // I only want to allow these two routes!
      if (as !== '/' && as !== '/other') {
        // Have SSR render bad routes as a 404.
        window.location.href = as
        return false
      }

      return true
    })
  }, [])

  return <p>Welcome to the page</p>
}
```

### router.back

Navigate back in history. Equivalent to clicking the browser’s back button. It executes `window.history.back()`.

#### Usage

```jsx
import { useRouter } from 'next/router'

export default function Page() {
  const router = useRouter()

  return (
    <button type="button" onClick={() => router.back()}>
      Click here to go back
    </button>
  )
}
```

### router.reload

Reload the current URL. Equivalent to clicking the browser’s refresh button. It executes `window.location.reload()`.

#### Usage

```jsx
import { useRouter } from 'next/router'

export default function Page() {
  const router = useRouter()

  return (
    <button type="button" onClick={() => router.reload()}>
      Click here to reload
    </button>
  )
}
```

### router.events

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-loading">With a page loading indicator</a></li>
  </ul>
</details>

You can listen to different events happening inside the Next.js Router. Here's a list of supported events:

- `routeChangeStart(url, { shallow })` - Fires when a route starts to change
- `routeChangeComplete(url, { shallow })` - Fires when a route changed completely
- `routeChangeError(err, url, { shallow })` - Fires when there's an error when changing routes, or a route load is cancelled
  - `err.cancelled` - Indicates if the navigation was cancelled
- `beforeHistoryChange(url, { shallow })` - Fires before changing the browser's history
- `hashChangeStart(url, { shallow })` - Fires when the hash will change but not the page
- `hashChangeComplete(url, { shallow })` - Fires when the hash has changed but not the page

> **Note:** Here `url` is the URL shown in the browser, including the [`basePath`](/docs/api-reference/next.config.js/basepath.md).

#### Usage

For example, to listen to the router event `routeChangeStart`, open or create `pages/_app.js` and subscribe to the event, like so:

```jsx
import { useEffect } from 'react'
import { useRouter } from 'next/router'

export default function MyApp({ Component, pageProps }) {
  const router = useRouter()

  useEffect(() => {
    const handleRouteChange = (url, { shallow }) => {
      console.log(
        `App is changing to ${url} ${
          shallow ? 'with' : 'without'
        } shallow routing`
      )
    }

    router.events.on('routeChangeStart', handleRouteChange)

    // If the component is unmounted, unsubscribe
    // from the event with the `off` method:
    return () => {
      router.events.off('routeChangeStart', handleRouteChange)
    }
  }, [])

  return <Component {...pageProps} />
}
```

> We use a [Custom App](/docs/advanced-features/custom-app.md) (`pages/_app.js`) for this example to subscribe to the event because it's not unmounted on page navigations, but you can subscribe to router events on any component in your application.

Router events should be registered when a component mounts ([useEffect](https://reactjs.org/docs/hooks-effect.html) or [componentDidMount](https://reactjs.org/docs/react-component.html#componentdidmount) / [componentWillUnmount](https://reactjs.org/docs/react-component.html#componentwillunmount)) or imperatively when an event happens.

If a route load is cancelled (for example, by clicking two links rapidly in succession), `routeChangeError` will fire. And the passed `err` will contain a `cancelled` property set to `true`, as in the following example:

```jsx
import { useEffect } from 'react'
import { useRouter } from 'next/router'

export default function MyApp({ Component, pageProps }) {
  const router = useRouter()

  useEffect(() => {
    const handleRouteChangeError = (err, url) => {
      if (err.cancelled) {
        console.log(`Route to ${url} was cancelled!`)
      }
    }

    router.events.on('routeChangeError', handleRouteChangeError)

    // If the component is unmounted, unsubscribe
    // from the event with the `off` method:
    return () => {
      router.events.off('routeChangeError', handleRouteChangeError)
    }
  }, [])

  return <Component {...pageProps} />
}
```

## withRouter

If [`useRouter`](#useRouter) is not the best fit for you, `withRouter` can also add the same [`router` object](#router-object) to any component.

### Usage

```jsx
import { withRouter } from 'next/router'

function Page({ router }) {
  return <p>{router.pathname}</p>
}

export default withRouter(Page)
```

### TypeScript

To use class components with `withRouter`, the component needs to accept a router prop:

```tsx
import React from 'react'
import { withRouter, NextRouter } from 'next/router'

interface WithRouterProps {
  router: NextRouter
}

interface MyComponentProps extends WithRouterProps {}

class MyComponent extends React.Component<MyComponentProps> {
  render() {
    return <p>{this.props.router.pathname}</p>
  }
}

export default withRouter(MyComponent)
```
