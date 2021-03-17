---
description: Client-side navigations are also possible using the Next.js Router instead of the Link component. Learn more here.
---

# Imperatively

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/using-router">Using Router</a></li>
  </ul>
</details>

[`next/link`](/docs/api-reference/next/link.md) should be able to cover most of your routing needs, but you can also do client-side navigations without it, take a look at the [documentation for `next/router`](/docs/api-reference/next/router.md).

The following example shows how to do basic page navigations with [`useRouter`](/docs/api-reference/next/router.md#useRouter):

```jsx
import { useRouter } from 'next/router'

function ReadMore() {
  const router = useRouter()

  return (
    <span onClick={() => router.push('/about')}>Click here to read more</span>
  )
}

export default ReadMore
```
