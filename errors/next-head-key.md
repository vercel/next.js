# Inline head key

> Enforce `key` attribute on children components of `next/head`.

## Why This Error Occurred

`next/head` children components require an `key` attribute to be defined to track and optimize the head.

## Possible Ways to Fix It

Add an `key` attribute to the `next/head` component.

```jsx
import Head from 'next/head'

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <>
          <meta key="key1" />
          <meta key="key2" />
        </>
      </Head>
      <Component {...pageProps} />
    </>
  )
}
```

## Useful links

- [Docs for Next.js Head component](https://nextjs.org/docs/api-reference/next/head)
