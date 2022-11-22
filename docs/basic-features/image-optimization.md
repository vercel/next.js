---
description: Next.js supports built-in image optimization, as well as third party loaders for Imgix, Cloudinary, and more! Learn more here.
---

# Optimizing Images

The Next.js Image component extends the HTML `<img>` element with:

- **Size Optimization:** Automatically serve correctly sized images for each device, using modern image formats like WebP and AVIF.
- **Visual Stability:** Prevent [layout shift](https://nextjs.org/learn/seo/web-performance/cls) automatically when images are loading.
- **Faster Page Loads:** Images are only loaded when they enter the viewport using native browser lazy loading, with optional blur-up placeholders.

## Usage

To add an image to your application, import the [`next/image`](/docs/api-reference/next/image.md) component:

```jsx
import Image from 'next/image'
```

Now, you can define the `src` for your image (either local or remote).

### Local Images

To use a local image, `import` your `.jpg`, `.png`, or `.webp` image files.

Next.js will automatically determine the `width` and `height` of your image based on the imported file. These values are used to prevent [Cumulative Layout Shift](https://nextjs.org/learn/seo/web-performance/cls) while your image is loading.

```js
import Image from 'next/image'
import profilePic from '../public/me.png'

export default function Page() {
  return (
    <Image
      src={profilePic}
      alt="Picture of the author"
      // width={500} automatically provided
      // height={500} automatically provided
      // blurDataURL="data:..." automatically provided
      // placeholder="blur" // Optional blur-up while loading
    />
  )
}
```

> **Warning:** Dynamic `await import()` or `require()` are _not_ supported. The `import` must be static so it can be analyzed at build time.

### Remote Images

To use a remote image, the `src` property should be a URL string, which can be [relative](#loaders) or [absolute](/docs/api-reference/next/image.md#remotepatterns).

Since Next.js does not have access to remote files during the build process, you'll need to provide the [`width`](/docs/api-reference/next/image.md#width), [`height`](/docs/api-reference/next/image.md#height) and optional [`blurDataURL`](/docs/api-reference/next/image.md#blurdataurl) props manually:

```jsx
import Image from 'next/image'

export default function Page() {
  return (
    <Image
      src="https://s3.amazonaws.com/my-bucket/profile.png"
      alt="Picture of the author"
      width={500}
      height={500}
    />
  )
}
```

Next, define a list of supported URL patterns you want to allow optimizing images from. Be as specific as possible to prevent malicious usage. For example, the following configuration will only allow images from a specific AWS S3 bucket:

```jsx:next.config.js
module.exports = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 's3.amazonaws.com',
        port: '',
        pathname: '/my-bucket/**',
      },
    ],
  },
};
```

Learn more about [`remotePatterns`](/docs/api-reference/next/image.md#remotepatterns) configuration. If you want to use relative URLs for the image `src`, use a [`loader`](/docs/api-reference/next/image.md#loader).

## Image Sizing

One of the ways that images commonly hurt the user experience is through _layout shift_, where the image pushes other elements around on the page as it loads. This experience can be measured with [Cumulative Layout Shift](https://web.dev/cls/).

You can avoid image-based layout shift by [always sizing your images](https://web.dev/optimize-cls/#images-without-dimensions). This allows the browser to reserve precisely enough space for the image before it loads.

Since `next/image` is designed to guarantee good performance results, it cannot be used in a way that will contribute to layout shift, and **must** be sized in one of three ways:

1. Automatically, using a [static import](#local-images).
2. Explicitly, by including a [`width`](/docs/api-reference/next/image.md#width) and [`height`](/docs/api-reference/next/image.md#height) property.
3. Implicitly, by using [fill](/docs/api-reference/next/image.md#fill) which causes the image to expand to fill its parent element.

If none of the suggested methods works for sizing your images, the `next/image` component is designed to work well on a page alongside standard `<img>` elements.

## Styling

Styling the Image component is similar to styling a normal `<img>` element, but there are a few guidelines to keep in mind:

- Use `className` or `style`, not `styled-jsx`.
  - In most cases, we recommend using the `className` prop. This can be an imported [CSS Module](/docs/basic-features/built-in-css-support.md), a [global stylesheet](/docs/basic-features/built-in-css-support.md#adding-a-global-stylesheet), etc.
  - You can also use the `style` prop to assign inline styles.
  - You cannot use [styled-jsx](/docs/basic-features/built-in-css-support.md#css-in-js) because it's scoped to the current component (unless you mark the style as `global`).
- When using `fill`, the parent element must have `position: relative`
  - This is necessary for the proper rendering of the image element in that layout mode.
- When using `fill`, the parent element must have `display: block`
  - This is the default for `<div>` elements but should be specified otherwise.

For examples, see the [Image Component Demo](https://image-component.nextjs.gallery).

## Priority Images

You should add the `priority` property to the image that will be the [Largest Contentful Paint (LCP) element](https://web.dev/lcp/#what-elements-are-considered) for each page. This allows Next.js to prioritize the image for loading (e.g. through preload tags or priority hints), leading to a meaningful boost in LCP.

The LCP element is typically the largest image or text block visible within the viewport of the page. When you run `next dev`, you'll see a console warning if the LCP element is an `<Image>` without the `priority` property.

Once you've identified the LCP image, you can add the property like this:

```jsx
import Image from 'next/image'
import profilePic from '../public/me.png'

export default function Page() {
  return <Image src={profilePic} alt="Picture of the author" priority />
}
```

## Next Steps

<div class="card">
  <a href="/docs/api-reference/next/image.md">
    <b>Image Component API Reference</b>
    <small>See the API Reference for the Image Component.</small>
  </a>
</div>

<div class="card">
  <a href="https://github.com/vercel/next.js/tree/canary/examples/image-component">
    <b>Image Component Example</b>
    <small>See an example on how to use the Image Component in Next.js</small>
  </a>
</div>
