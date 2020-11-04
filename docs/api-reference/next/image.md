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

## Image Optimization

Before moving forward, we recommend you to read [Image Optimization](/docs/basic-features/image-optimization.md) first.

## Usage

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

## Props

The `Image` component accepts the following properties.

### src

The path or URL to the source image. This is required.

### width

The width of the image, in pixels. Must be an integer without a unit.

Required unless [layout="fill"`](#layout).

### height

The height of the image, in pixels. Must be an integer without a unit.

Required unless [layout="fill"`](#layout).

### layout

The layout behavior of the image as the viewport changes size.

When `fixed`, the image dimensions will not change as the viewport changes (no responsiveness) similar to the native `<img>` element.

When `intrinsic`, the image will scale the dimensions down for smaller viewports but maintain the original dimensions for larger viewports.

When `responsive`, the image will scale the dimensions down for smaller viewports and scale up for larger viewports.

When `fill`, the image will stretch both width and height to the dimensions of the parent element, usually paired with [object-fit](https://developer.mozilla.org/en-US/docs/Web/CSS/object-fit).

Default `intrinsic`.

Try it out:

- [Demo the `fixed` layout](https://image-component.nextjs.gallery/layout-fixed)
- [Demo the `intrinsic` layout](https://image-component.nextjs.gallery/layout-intrinsic)
- [Demo the `responsive` layout](https://image-component.nextjs.gallery/layout-responsive)
- [Demo the `fill` layout](https://image-component.nextjs.gallery/layout-fill)
- [Demo background image](https://image-component.nextjs.gallery/background)

### sizes

Defines what proportion of the screen you expect the image to take up.

Recommended, as it helps serve the correct sized image to each device.

[Learn more](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/img#attr-sizes).

### quality

The quality of the optimized image, an integer between 1 and 100 where 100 is the best quality.

Default 75.

### loading

The loading behavior of the image.

When `lazy`, defer loading the image until it reaches a calculated distance from the viewport.

When `eager`, load the image immediately.

Default `lazy`.

[Learn more](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/img#attr-loading)

### priority

When true, the image will be considered high priority and [preload](https://web.dev/preload-responsive-images/).

Should only be used when the image is visible above the fold.

### unoptimized

When true, the source image will be served as-is instead of changing quality, size, or format.

### unsized

**Deprecated** - Use the [layout](#layout) property instead.

When true, the `width` and `height` requirement can by bypassed.

### Other Properties

All other properties on the `<Image>` component will be passed to the underlying `<img>` element.

## Related

We recommend you to read [Image Optimization](/docs/basic-features/image-optimization.md).
