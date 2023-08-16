# No Script Tags In Head Component

### Why This Error Occurred

A `<script>` tag was added using the `next/head` component.

For the best performance, we recommend using `next/script`. Using `next/script` also ensures compatibility with React Suspense and streaming server-rendering.

### Possible Ways to Fix It

#### Script Component

The **Script component**, [`next/script`](/docs/api-reference/next/script.md), allows you to optimally load third-party scripts anywhere in your Next.js application. It is an extension of the HTML `<script>` element and enables you to choose between multiple loading strategies to fit your use case.

```jsx
import Script from 'next/script'

export default function Dashboard() {
  return (
    <>
      <Script src="https://example.com/script.js" />
    </>
  )
}
```

### Useful Links

- [Optimizing Scripts](https://nextjs.org/docs/basic-features/script/)
- [`next/script` API Reference](https://nextjs.org/docs/api-reference/next/script)
