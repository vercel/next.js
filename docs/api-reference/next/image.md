---
description: Enable image optimization with the built-in Image component.
---

# next/image

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/basic-image-optimization">Basic Image Optimization</a></li>
  </ul>
</details>

> Before moving forward, we recommend you to read [Image Optimization](/docs/basic-features/image-optimization.md) first.

Image Optimization can be enabled via the `Image` component exported by `next/image`.

For an example, consider a project with the following files:

- `pages/index.js`
- `public/me.png`

We can serve an optimized image like so:

```jsx
import Image from 'next/image'

function Home() {
  return (
    <>
      <h1>My Homepage</h1>
      <Image src="/me.png" alt="me" width={200} height={200} />
      <p>Welcome to my homepage!</p>
    </>
  )
}

export default Home
```

`Image` accepts the following props:

- `src` - The path or URL to the source image. This is required.
- `width` - The width of the source image. This is recommended and required unless `unsized` is true.
- `height` - The height of the source image. This is recommended and required unless `unsized` is true.
- `quality` - The quality of the optimized image, an integer between 1 and 100 where 100 is the best quality.
- `lazy` - When true, the image will not load until scrolled into the viewport.
- `priority` - When true, the image will be considered high priority and preload.
- `unoptimized` - When true, the source image will be served as-is instead of resizing and changing quality.
- `unsized` - When true, the `width` and `height` requirement can by bypassed. Should not be used with `priority` or above-the-fold images.
