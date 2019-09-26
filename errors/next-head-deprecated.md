# `next/head` is deprecated

#### Why This Error Occurred

You are using `next/head`. This has been deprecated because it is incompatible with two major React features and performance optimizations:

- Streaming Rendering: `<Head>` could appear anywhere in the component hierarchy, making it impossible to stream a response until the tree has been fully rendered
- Concurrent Mode: `<Head>` relies on being rendered in a precise order, which cannot be guaranteed in this mode

#### Possible Ways to Fix It

Hoist head generation to the page level by exporting a `Head` component:

```jsx
export default function MyPage() {
  return <span>Hello World</span>
}

export function Head() (
  <>
    <title>Valid Head</title>
  </>
)
```

The `Head` component will be rendered with the same props as the page component, so you can use `getInitialProps` to e.g. fetch a dynamic title value.
