# Router Events

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
import Router from 'router/events'

const handleRouteChange = url => {
  console.log('App is changing to: ', url)
}

Router.events.on('routeChangeStart', handleRouteChange)
```

If you no longer want to listen to the event, unsubscribe with the `off` method:

```jsx
import Router from 'router/events'

Router.events.off('routeChangeStart', handleRouteChange)
```

If a route load is cancelled (for example, by clicking two links rapidly in succession), `routeChangeError` will fire. And the passed `err` will contain a `cancelled` property set to `true`, as in the following example:

```jsx
import Router from 'router/events'

Router.events.on('routeChangeError', (err, url) => {
  if (err.cancelled) {
    console.log(`Route to ${url} was cancelled!`)
  }
})
```

Router events should be registered when a component mounts ([useEffect](https://reactjs.org/docs/hooks-effect.html) or [componentDidMount](https://reactjs.org/docs/react-component.html#componentdidmount) / [componentWillUnmount](https://reactjs.org/docs/react-component.html#componentwillunmount)) or imperatively when an event happens, as in the following example:

```jsx
import Router from 'router/events'

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
