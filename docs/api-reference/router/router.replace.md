# Router.replace

Similar to the `replace` prop in [`<Link>`](https://www.notion.so/zeithq/Using-Link-9656279e431e4497a25db38c75e31126), `Router.replace` will prevent adding a new URL entry into the `history` stack, take a look at the following example:

```jsx
import Router from 'next/router'

Router.replace('/home')
```

The API for `Router.replace` is exactly the same as that used for `Router.push`, so please refer to its [documentation](https://www.notion.so/zeithq/Router-push-769f057793c549e3a7190c7f1896c602).
