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

Since version **10.0.0**, Next.js has a built-in Image Component and Automatic Image Optimization.

The Next.js Image Component, [`next/image`](/docs/api-reference/next/image.md), is an extension of the HTML `<img>` element, evolved for the modern web.

The Automatic Image Optimization allows for resizing, optimizing, and serving images in modern formats like [WebP](https://developer.mozilla.org/en-US/docs/Web/Media/Formats/Image_types) when the browser supports it. This avoids shipping large images to devices with a smaller viewport. It also allows Next.js to automatically adopt future image formats and serve them to browsers that support those formats.

Automatic Image Optimization works with any image source. Even if the image is hosted by an external data source, like a CMS, it can still be optimized.

Instead of optimizing images at build time, Next.js optimizes images on-demand, as users request them. Unlike static site generators and static-only solutions, your build times aren't increased, whether shipping 10 images or 10 million images.

Images are lazy loaded by default. That means your page speed isn't penalized for images outside the viewport. Images load as they are scrolled into viewport.

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
- `quality` can be configured per image, default 75
- See [`next/image`](/docs/api-reference/next/image.md) for list of available props.

## Configuration

You can optionally configure Image Optimization by using the `images` property in `next.config.js`.

If no configuration is provided, the following default configuration will be used.

```js
module.exports = {
  images: {
    deviceSizes: [320, 420, 768, 1024, 1200],
    imageSizes: [],
    domains: [],
    path: '/_next/image',
    loader: 'default',
  },
}
```

If a specific property is omitted, such as `deviceSizes`, that property will use the default above.

This means you only need to configure the properties you wish to change.

### Device Sizes

You can specify a list of device width breakpoints using the `deviceSizes` property. Since images maintain their aspect ratio using the `width` and `height` attributes of the source image, there is no need to specify height in `next.config.js` – only the width. These values will be used by the browser to determine which size image should load.

```js
module.exports = {
  images: {
    deviceSizes: [320, 420, 768, 1024, 1200],
  },
}
```

### Image Sizes

You can specify a list of exact image widths using the `imageSizes` property. These widths should be different than the widths defined in `deviceSizes`. The purpose is for images that don't scale with the browser window, such as icons, badges, or profile images. If the `width` property of a [`next/image`](/docs/api-reference/next/image.md) component matches a value in `imageSizes`, the image will be rendered at that exact width.

```js
module.exports = {
  images: {
    imageSizes: [16, 32, 64],
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

- When using `next start` or a custom server image optimization works automatically.
- [Vercel](https://vercel.com): Works automatically when you deploy on Vercel, no configuration necessary.
- [Imgix](https://www.imgix.com): `loader: 'imgix'`
- [Cloudinary](https://cloudinary.com): `loader: 'cloudinary'`
- [Akamai](https://www.akamai.com): `loader: 'akamai'`

## Caching

The following describes the caching algorithm for the default [loader](#loader). For all other loaders, please refer to your cloud provider's documentation.

Images are optimized dynamically upon request and stored in the `<distDir>/cache/images` directory. The optimized image file will be served for subsequent requests until the expiration is reached. When a request is made that matches a cached but expired file, the cached file is deleted before generating a new optimized image and caching the new file.

The expiration (or rather Max Age) is defined by the upstream server's `Cache-Control` header.

If `s-maxage` is found in `Cache-Control`, it is used. If no `s-maxage` is found, then `max-age` is used. If no `max-age` is found, then 60 seconds is used.

You can configure [`deviceSizes`](#device-sizes) to reduce the total number of possible generated images.

## Related

For more information on what to do next, we recommend the following sections:

<div class="card">
  <a href="/docs/api-reference/next/image.md">
    <b>next/image</b>
    <small>See all available properties for the Image component</small>
  </a>
</div>
