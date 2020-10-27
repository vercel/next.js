---
description: Enable Image Optimization with the built-in Image component.
---

# next/image

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/image-component">Image Component</a></li>
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
      <Image
        src="/me.png"
        alt="Picture of the author"
        width={500}
        height={500}
      />
      <p>Welcome to my homepage!</p>
    </>
  )
}

export default Home
```

`Image` accepts the following props:

- `src` - The path or URL to the source image. This is required.
- `width` - The intrinsic width of the source image in pixels. Must be an integer without a unit. Required unless `unsized` is true.
- `height` - The intrinsic height of the source image, in pixels. Must be an integer without a unit. Required unless `unsized` is true.
- `sizes` - Defines what proportion of the screen you expect the image to take up. Recommended, as it helps serve the correct sized image to each device. [More info](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/img#attr-sizes).
- `quality` - The quality of the optimized image, an integer between 1 and 100 where 100 is the best quality. Default 75.
- `loading` - The loading behavior. When `lazy`, defer loading the image until it reaches a calculated distance from the viewport. When `eager`, load the image immediately. Default `lazy`. [More info](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/img#attr-loading)
- `priority` - When true, the image will be considered high priority and [preload](https://web.dev/preload-responsive-images/).
- `unoptimized` - When true, the source image will be served as-is instead of resizing and changing quality.
- `unsized` - When true, the `width` and `height` requirement can by bypassed. Should _not_ be used with above-the-fold images. Should _not_ be used with `priority`.

All other properties on the `<Image>` component will be passed to the underlying `<img>` element.
