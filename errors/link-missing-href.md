# Link missing href

#### Why This Error Occurred

Either you passed a null or undefined `href` to a `next/link` component or you simply didnt provide one.

#### Possible Ways to Fix It

Make sure you are passing the variables properly:

```js
// pages/index.js
import Link from 'next/link'

export default function Home() {
  return (
    <main>
      Hi
      <Link href="/hi">
        <a></a>
      </Link>
    </main>
  )
}
```

instead of this

```js
// pages/index.js
import Link from 'next/link'

export default function Home() {
  return (
    <main>
      Hi
      <Link>
        <a></a>
      </Link>
    </main>
  )
}
```

### Useful Links

- [Routing section in Documentation](https://nextjs.org/docs#routing)
