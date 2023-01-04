# No children were passed to <Link>

#### Why This Error Occurred

In your application code `next/link` was used without passing a child:

For example:

```js
import Link from 'next/link'

export default function Home() {
  return (
    <Link href="/about"></Link>
    // or
    <Link href='/about' />
  )
}
```

#### Possible Ways to Fix It

Make sure one child is used when using `<Link>`:

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
