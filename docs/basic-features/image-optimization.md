---
description: Next.js supports built-in image optimization as well as 3rd party loaders for Imgix, Cloudinary, and more! Learn more here.
---

# Image Optimization

<details open>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/basic-image-optimization">Basic Image Optimization</a></li>
  </ul>
</details>

Since version **10.0.0**, Next.js provides an Image component that will automatically optimize the source image based on the browser. The optimization includes resizing the image based on the browser's viewport as well as selecting the best format, such as [WebP](https://developer.mozilla.org/en-US/docs/Web/Media/Formats/Image_types), based on the browser's [`Accept`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Accept) header.

The objective of the Image component is to improve performance of Next.js applications, with a particular focus on improving their Core Web Vitals scores.

## Default Behavior

To add an image to your application, import the Image component on your [page](./pages).

```jsx
import Image from 'next/image'

function Home() {
  return (
    <>
      <h1>My Homepage</h1>
      <Image src="/me.png" width={200} height={200} />
      <p>Welcome to my homepage!</p>
    </>
  )
}

export default Home
```

## Configuration

If you want to configure Image Optimization you can do so by using `images` in `next.config.js`.

### Sizes

You can specify which size widths you wish to allow using the `sizes` property. Since images will maintain aspect ratio using the `width` and `height` of the source image, there is no need to specify height, only the width. You can think of these as breakpoints.

```js
module.exports = {
  images: {
    sizes: [320, 420, 768, 1024, 1200],
  },
}
```

### Domains

If you want to optimize images hosted on an external website, you would use an absolute url for the Image `src` and specify which
`domains` are allowed to be optimized.

```js
module.exports = {
  images: {
    domains: ['example.com'],
  },
}
```

### Loader

If you want to use a cloud provider to optimize images instead of using the Next.js API, you can configure the loader and path prefix. This allows you to use relative urls for the Image `src` and automatically generate the correct absolute url for your provider.

```js
module.exports = {
  images: {
    loader: 'imgix',
    path: 'https://example.com/myaccount/',
  },
}
```

## FAQ

### Can I bring my own cloud provider?

The following image optimization cloud providers are supported:

- Imgix: `loader: 'imgix'`
- Cloudinary: `loader: 'cloudinary'`
- Akamai: `loader: 'akamai'`
- Vercel: no configuration necesary

## Related

For more information on what to do next, we recommend the following sections:

<div class="card">
  <a href="/docs/advanced-features/customizing-postcss-config.md">
    <b>Customizing PostCSS Config:</b>
    <small>Extend the PostCSS config and plugins added by Next.js with your own.</small>
  </a>
</div>
