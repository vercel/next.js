# Dynamic `href` is not supported in the `/app` directory

#### Why This Error Occurred

You have tried to use a dynamic `href` with `next/link` in the `/app` directory. This is not supported.

#### Possible Ways to Fix It

**Before**

```jsx
<Link
  href={{
    pathname: '/route/[slug]',
    query: { slug: '1' },
  }}
>
  link
</Link>
```

**After**

```jsx
<Link href="/route/1">link</Link>
```

### Useful Links

[`next/link` documentation](https://beta.nextjs.org/docs/api-reference/components/link#href)
