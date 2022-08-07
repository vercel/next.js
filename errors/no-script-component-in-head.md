# No Script Component in Head

> Prevent usage of `next/script` in `next/head` component.

#### Why This Error Occurred

The `next/script` component should not be used in a `next/head` component.

#### Possible Ways to Fix It

Move the `<Script />` component outside of `<Head>` instead.

**Before**

```js
import Script from 'next/script'
import Head from 'next/head'

export default function Index() {
  return (
    <Head>
      <title>Next.js</title>
      <Script src="/my-script.js" />
    </Head>
  )
}
```

**After**

```js
import Script from 'next/script'
import Head from 'next/head'

export default function Index() {
  return (
    <>
      <Head>
        <title>Next.js</title>
      </Head>
      <Script src="/my-script.js" />
    </>
  )
}
```

### Useful links

- [next/head](https://nextjs.org/docs/api-reference/next/head)
- [next/script](https://nextjs.org/docs/basic-features/script#usage)
