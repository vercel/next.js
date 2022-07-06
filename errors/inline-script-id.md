# Inline script id

> Enforce `id` attribute on `next/script` components with inline content.

## Why This Error Occurred

`next/script` components with inline content require an `id` attribute to be defined to track and optimize the script.

## Possible Ways to Fix It

Add an `id` attribute to the `next/script` component.

```jsx
import Script from 'next/script'

export default function App({ Component, pageProps }) {
  return (
    <>
      <Script id="my-script">{`console.log('Hello world!');`}</Script>
      <Component {...pageProps} />
    </>
  )
}
```

## Useful links

- [Docs for Next.js Script component](https://nextjs.org/docs/basic-features/script)
