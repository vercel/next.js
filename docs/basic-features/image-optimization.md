---
description: Next.js supports built-in image optimization, as well as third party loaders for Imgix, Cloudinary, and more! Learn more here.
---

# Image Component and Image Optimization

<details open>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/image-component">Image Component</a></li>
  </ul>
</details>

Since version **10.0.0** Next.js has a built-in Image Component and Automatic Image Optimization.

The Next.js Image Component (`next/image`) is an extension of the HTML `<img>` element, evolved for the modern web.

The Automatic Image Optimization allows for resizing, optimizing, and serving images in modern formats like [WebP](https://developer.mozilla.org/en-US/docs/Web/Media/Formats/Image_types). This avoids shipping large images to devices with a smaller viewport.

## Image Component

To add an image to your application, import the [`next/image`](/docs/api-reference/next/image.md) component:

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

- `width` and `height` are required to prevent [Cumulative Layout Shift](https://web.dev/cls/), a [Core Web Vital](https://web.dev/vitals/) that Google is going to [use in their search ranking](https://webmasters.googleblog.com/2020/05/evaluating-page-experience.html)
- `width` and `height` are automatically responsive, unlike the HTML `<img>` element
- See [`next/image`](/docs/api-reference/next/image.md) for list of available props.

## Configuration

You can configure Image Optimization by using the `images` property in `next.config.js`.

### Sizes

You can specify a list of image widths to allow using the `sizes` property. Since images maintain their aspect ratio using the `width` and `height` attributes of the source image, there is no need to specify height in `next.config.js` – only the width. You can think of these as breakpoints.

```js
module.exports = {
  images: {
    sizes: [320, 420, 768, 1024, 1200],
  },
}
```

### Domains

To enable Image Optimization for images hosted on an external website, use an absolute url for the Image `src` and specify which
`domains` are allowed to be optimized. This is needed to ensure that external urls can't be abused.

```js
module.exports = {
  images: {
    domains: ['example.com'],
  },
}
```

### Loader

If you want to use a cloud image provider to optimize images instead of using the Next.js' built-in image optimization, you can configure the loader and path prefix. This allows you to use relative urls for the Image `src` and automatically generate the correct absolute url for your provider.

```js
module.exports = {
  images: {
    loader: 'imgix',
    path: 'https://example.com/myaccount/',
  },
}
```

The following Image Optimization cloud providers are supported:

- Vercel - No configuration necessary
- Imgix - `loader: 'imgix'`
- Cloudinary - `loader: 'cloudinary'`
- Akamai - `loader: 'akamai'`

## Related

For more information on what to do next, we recommend the following sections:

<div class="card">
  <a href="/docs/api-reference/next/image.md">
    <b>next/image</b>
    <small>See all available properties for the Image component</small>
  </a>
</div>

- When using `next start` or a custom server image optimization works automatically.
- [Vercel](https://vercel.com): Works automatically when you deploy on Vercel
- [Imgix](https://www.imgix.com): `loader: 'imgix'`
- [Cloudinary](https://cloudinary.com): `loader: 'cloudinary'`
- [Akamai](https://www.akamai.com): `loader: 'akamai'`
