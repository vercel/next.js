# Router.beforePopState

In some cases (for example, if using a [Custom Server](https://www.notion.so/zeithq/Custom-Server-7cc0448e06204feaa02d769b4c961615)), you may wish to listen to [popstate](https://developer.mozilla.org/en-US/docs/Web/Events/popstate) and do something before the router acts on it.

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

- `cb`: The function to execute on incoming `popstate` events. The function receives the state of the event as an object with the following props:
  - `url`: `String` - the route for the new state. This is usually the name of a `page`
  - `as`: `String` - the url that will be shown in the browser
  - `options`: `Object` - Additional options sent by [Router.push](https://www.notion.so/zeithq/Router-push-769f057793c549e3a7190c7f1896c602)

If the function you pass into `beforePopState` returns `false`, `Router` will not handle `popstate` and you'll be responsible for handling it, in that case. See [Disabling file-system routing](https://www.notion.so/zeithq/Custom-Server-7cc0448e06204feaa02d769b4c961615#bfcb1b7be5774ccead1b10dd4c435239).
