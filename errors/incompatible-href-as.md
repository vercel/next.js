# Incompatible `href` and `as` values

#### Why This Error Occurred

Somewhere you are utilizing the `next/link` component, `Router#push`, or `Router#replace` with a dynamic route in your `href` that has an incompatible `as` value. The `as` value is incompatible when the path doesn't provide only the expected parameters for the dynamic route.

Note: this error will only show when the `next/link` component is clicked not when only rendered.

**Incompatible `href` and `as`**

```jsx
import Link from 'next/link'

export default () => (
  <>
    <Link href="/[post]" as="/post-1/comments">
      <a>Invalid link</a>
    </Link>
  </>
)
```

**Compatible `href` and `as`**

```jsx
import Link from 'next/link'

export default () => (
  <>
    <Link href="/[post]" as="/post-1">
      <a>Valid link</a>
    </Link>
  </>
)
```

#### Possible Ways to Fix It

Look for any usage of the `next/link` component, `Router#push`, or `Router#replace` and make sure that the provided `href` and `as` values are compatible

### Useful Links

- [Routing section in Documentation](https://nextjs.org/docs/routing/introduction)
- [Dynamic routing section in Documentation](https://nextjs.org/docs/routing/dynamic-routes)
