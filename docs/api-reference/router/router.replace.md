# Router.replace

Similar to the `replace` prop in [`Link`](/docs/routing/using-link.md), `Router.replace` will prevent adding a new URL entry into the `history` stack, take a look at the following example:

```jsx
import Router from 'next/router'

Router.replace('/home')
```

The API for `Router.replace` is exactly the same as that used for `Router.push`, so please refer to its [documentation](/docs/api-reference/router/router.push.md).
