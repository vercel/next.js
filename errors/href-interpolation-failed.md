# `href` Interpolation Failed

#### Why This Error Occurred

Somewhere you are utilizing the `next/link` component, `Router#push`, or `Router#replace` with `href` interpolation to build dynamic routes but did not provide all of the needed dynamic route params to properly interpolate the `href`.

Note: this error will only show when the `next/link` component is clicked not when only rendered.

**Invalid `href` interpolation**

```jsx
import Link from 'next/link'

export default function BlogLink() {
  return (
    <Link
      href={{
        pathname: '/blog/[post]/[comment]',
        query: { post: 'post-1' },
      }}
    >
      <a>Invalid link</a>
    </Link>
  )
}
```

**Valid `href` interpolation**

```jsx
import Link from 'next/link'

export default function BlogLink() {
  return (
    <Link
      href={{
        pathname: '/blog/[post]/[comment]',
        query: { post: 'post-1', comment: 'comment-1' },
      }}
    >
      <a>Valid link</a>
    </Link>
  )
}
```

#### Possible Ways to Fix It

Look for any usage of the `next/link` component, `Router#push`, or `Router#replace` and make sure that the provided `href` has all needed dynamic params in the query.

### Useful Links

- [Routing section in Documentation](https://nextjs.org/docs/routing/introduction)
- [Dynamic routing section in Documentation](https://nextjs.org/docs/routing/dynamic-routes)
