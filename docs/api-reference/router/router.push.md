# Router.push

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/zeit/next.js/tree/canary/examples/using-router">Using Router</a></li>
  </ul>
</details>
<br/>

Handles client-side transitions, this method is useful for cases where [`<Link>`](https://www.notion.so/zeithq/Using-Link-9656279e431e4497a25db38c75e31126) is not enough.

```jsx
import Router from 'next/router'

Router.push(url, (as = url), options)
```

- `url`: The URL to navigate to. This is usually the name of a `page`
- `as`: Decorator for the URL that will be shown in the browser. Defaults to `url`
- `options`: Optional object with the following configuration options:
  - [`shallow`](#shallow-routing): Update the path of the current page without rerunning `getInitialProps`. Defaults to `false`

> You don't need to use `Router` for external URLs, [window.location](https://developer.mozilla.org/en-US/docs/Web/API/Window/location) is better suited for those cases.

## Usage

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

## With URL object

You can use an URL object in the same way you can use it for [`<Link>`](https://www.notion.so/zeithq/Using-Link-9656279e431e4497a25db38c75e31126). Works for both the `url` and `as` parameters:

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

## Shallow Routing

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/zeit/next.js/tree/canary/examples/with-shallow-routing">Shallow Routing</a></li>
  </ul>
</details>
<br/>

Shallow routing allows you to change the URL without running `getInitialProps`.

You'll receive the updated `pathname` and the `query` via the [`router`](https://www.notion.so/zeithq/Router-Object-580270ec245444ed9253c529b1db0315) object (added by[`useRouter`](https://www.notion.so/zeithq/useRouter-9366b2aaca924f3db8bed5a43aa887ad) or [`withRouter`](https://www.notion.so/zeithq/withRouter-ebcdae351eae4b8f84db2f2a26d0e505)), without losing state.

To enable shallow routing, set the `shallow` option to `true`. Consider the following example:

```jsx
// Current URL is '/'
Router.push('/?counter=10', null, { shallow: true })
```

The URL will get updated to `/?counter=10`. and the page won't get replaced, only the state of the route is changed.

You can watch for URL changes via [`componentDidUpdate`](https://reactjs.org/docs/react-component.html#componentdidupdate) as shown below:

```jsx
componentDidUpdate(prevProps) {
  const { pathname, query } = this.props.router
  // verify props have changed to avoid an infinite loop
  if (query.id !== prevProps.router.query.id) {
    // fetch data based on the new query
  }
}
```

The same can be achieved with the [useEffect](https://reactjs.org/docs/hooks-effect.html) hook.

### Caveats

Shallow routing **only** works for same page URL changes. For example, let's assume we have another page called `pages/about.js`, and you run this:

```jsx
Router.push('/?counter=10', '/about?counter=10', { shallow: true })
```

Since that's a new page, it'll unload the current page, load the new one and call `getInitialProps` even though we asked to do shallow routing.
