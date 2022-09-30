# Multiple children were passed to <Link>

#### Why This Error Occurred

In your application code multiple children were passed to `next/link` but only one child is supported:

For example:

```js
import Link from 'next/link'

export default function Home() {
  return (
    <Link href="/about">
      <a>To About</a>
      <a>Second To About</a>
    </Link>
  )
}
```

#### Possible Ways to Fix It

Make sure only one child is used when using `<Link>`:

```js
import Link from 'next/link'

export default function Home() {
  return (
    <Link href="/about">
      <a>To About</a>
    </Link>
  )
}
```
