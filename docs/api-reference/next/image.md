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

<details>
  <summary><b>Version History</b></summary>

| Version   | Changes                  |
| --------- | ------------------------ |
| `v10.0.5` | `loader` prop added.     |
| `v10.0.1` | `layout` prop added.     |
| `v10.0.0` | `next/image` introduced. |

</details>

> Before moving forward, we recommend you to read
> [Image Optimization](/docs/basic-features/image-optimization.md) first.

Image Optimization can be enabled via the `<Image />` component exported by
`next/image`.

## Usage

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

## Required Props

The `<Image />` component requires the following properties.

### src

The path or URL to the source image. This is required.

When using an external URL, you must add it to
[domains](/docs/basic-features/image-optimization.md#domains) in
`next.config.js`.

### width

The width of the image, in pixels. Must be an integer without a unit.

Required unless [`layout="fill"`](#layout).

### height

The height of the image, in pixels. Must be an integer without a unit.

Required unless [`layout="fill"`](#layout).

## Optional Props

The `<Image />` component optionally accepts the following properties.

### layout

The layout behavior of the image as the viewport changes size. Defaults to
`intrinsic`.

When `fixed`, the image dimensions will not change as the viewport changes (no
responsiveness) similar to the native `img` element.

When `intrinsic`, the image will scale the dimensions down for smaller viewports
but maintain the original dimensions for larger viewports.

When `responsive`, the image will scale the dimensions down for smaller
viewports and scale up for larger viewports.

When `fill`, the image will stretch both width and height to the dimensions of
the parent element, usually paired with the [`objectFit`](#objectFit) property.

Try it out:

- [Demo the `fixed` layout](https://image-component.nextjs.gallery/layout-fixed)
- [Demo the `intrinsic` layout](https://image-component.nextjs.gallery/layout-intrinsic)
- [Demo the `responsive` layout](https://image-component.nextjs.gallery/layout-responsive)
- [Demo the `fill` layout](https://image-component.nextjs.gallery/layout-fill)
- [Demo background image](https://image-component.nextjs.gallery/background)

### loader

A custom function used to resolve URLs. Defaults to [`images` object in `next.config.js`](/docs/basic-features/image-optimization.md#loader).

`loader` is a function returning a string, given the following parameters:

- [`src`](#src)
- [`width`](#width)
- [`quality`](#quality)

```js
import Image from 'next/image'

const myLoader = ({ src, width, quality }) => {
  return `https://example.com/${src}?w=${width}&q=${quality || 75}`
}

const MyImage = (props) => {
  return (
    <Image
      loader={myLoader}
      src="/me.png"
      alt="Picture of the author"
      width={500}
      height={500}
    />
  )
}
```

### sizes

A string mapping media queries to device sizes. Defaults to `100vw`.

We recommend setting `sizes` when using `layout="responsive"` or `layout="fill"` and your image will **not** be the same width as the viewport.

[Learn more](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/img#attr-sizes).

### quality

The quality of the optimized image, an integer between `1` and `100` where `100`
is the best quality. Defaults to `75`.

### priority

When true, the image will be considered high priority and
[preload](https://web.dev/preload-responsive-images/).

Should only be used when the image is visible above the fold. Defaults to
`false`.

## Advanced Props

In some cases, you may need more advanced usage. The `<Image />` component
optionally accepts the following advanced properties.

### objectFit

The image fit when using `layout="fill"`.

[Learn more](https://developer.mozilla.org/en-US/docs/Web/CSS/object-fit)

### objectPosition

The image position when using `layout="fill"`.

[Learn more](https://developer.mozilla.org/en-US/docs/Web/CSS/object-position)

### loading

> **Attention**: This property is only meant for advanced usage. Switching an
> image to load with `eager` will normally **hurt performance**.
>
> We recommend using the [`priority`](#priority) property instead, which
> properly loads the image eagerly for nearly all use cases.

The loading behavior of the image. Defaults to `lazy`.

When `lazy`, defer loading the image until it reaches a calculated distance from
the viewport.

When `eager`, load the image immediately.

[Learn more](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/img#attr-loading)

### unoptimized

When true, the source image will be served as-is instead of changing quality,
size, or format. Defaults to `false`.

## Other Props

Other properties on the `<Image />` component will be passed to the underlying
`img` element with the exception of the following:

- `style`. Use `className` instead.
- `srcSet`. Use
  [Device Sizes](/docs/basic-features/image-optimization.md#device-sizes)
  instead.
- `decoding`. It is always `"async"`.

## Related

For more information on what to do next, we recommend the following sections:

<div class="card">
  <a href="/docs/basic-features/image-optimization.md">
    <b>Image Optimization</b>
    <small>See how to configure domains and loaders.</small>
  </a>
</div>
