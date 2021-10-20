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

| Version   | Changes                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------- |
| `v12.0.0` | `formats` configuration added.<br/>AVIF format added.<br/>Wrapper `<div>` changed to `<span>`.    |
| `v11.1.0` | `onLoadingComplete` and `lazyBoundary` props added.                                               |
| `v11.0.0` | `src` prop support for static import.<br/>`placeholder` prop added.<br/>`blurDataURL` prop added. |
| `v10.0.5` | `loader` prop added.                                                                              |
| `v10.0.1` | `layout` prop added.                                                                              |
| `v10.0.0` | `next/image` introduced.                                                                          |

</details>

> **Note: This is API documentation for the Image Component and Image Optimization. For a feature overview and usage information for images in Next.js, please see [Images](/docs/basic-features/image-optimization.md).**

## Required Props

The `<Image />` component requires the following properties.

### src

Must be one of the following:

1. A [statically imported](/docs/basic-features/image-optimization.md#local-images) image file, or
2. A path string. This can be either an absolute external URL,
   or an internal path depending on the [loader](#loader) prop or [loader configuration](#loader-configuration).

When using an external URL, you must add it to
[domains](#domains) in
`next.config.js`.

### width

The width of the image, in pixels. Must be an integer without a unit.

Required, except for statically imported images, or those with [`layout="fill"`](#layout).

### height

The height of the image, in pixels. Must be an integer without a unit.

Required, except for statically imported images, or those with [`layout="fill"`](#layout).

## Optional Props

The `<Image />` component accepts a number of additional properties beyond those which are required. This section describes the most commonly-used properties of the Image component. Find details about more rarely-used properties in the [Advanced Props](#advanced-props) section.

### layout

The layout behavior of the image as the viewport changes size.

| `layout`              | Behavior                                                 | `srcSet`                                                                                                    | `sizes` |
| --------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------- |
| `intrinsic` (default) | Scale *down* to fit width of container, up to image size | `1x`, `2x` (based on [imageSizes](#image-sizes))                                                            | N/A     |
| `fixed`               | Sized to `width` and `height` exactly                    | `1x`, `2x` (based on [imageSizes](#image-sizes))                                                            | N/A     |
| `responsive`          | Scale to fit width of container                          | `640w`, `750w`, ... `2048w`, `3840w` (based on [imageSizes](#image-sizes) and [deviceSizes](#device-sizes)) | `100vw` |
| `fill`                | Grow in both X and Y axes to fill container              | `640w`, `750w`, ... `2048w`, `3840w` (based on [imageSizes](#image-sizes) and [deviceSizes](#device-sizes)) | `100vw` |

- [Demo the `intrinsic` layout (default)](https://image-component.nextjs.gallery/layout-intrinsic)
  - When `intrinsic`, the image will scale the dimensions down for smaller viewports, but maintain the original dimensions for larger viewports.
- [Demo the `fixed` layout](https://image-component.nextjs.gallery/layout-fixed)
  - When `fixed`, the image dimensions will not change as the viewport changes (no responsiveness) similar to the native `img` element.
- [Demo the `responsive` layout](https://image-component.nextjs.gallery/layout-responsive)
  - When `responsive`, the image will scale the dimensions down for smaller viewports and scale up for larger viewports.
  - Ensure the parent element uses `display: block` in their stylesheet.
- [Demo the `fill` layout](https://image-component.nextjs.gallery/layout-fill)
  - When `fill`, the image will stretch both width and height to the dimensions of the parent element, provided the parent element is relative.
  - This is usually paired with the [`objectFit`](#objectFit) property.
  - Ensure the parent element has `position: relative` in their stylesheet.
- [Demo background image](https://image-component.nextjs.gallery/background)

### loader

A custom function used to resolve URLs. Setting the loader as a prop on the Image component overrides the default loader defined in the [`images` section of `next.config.js`](#loader-configuration).

A `loader` is a function returning a URL string for the image, given the following parameters:

- [`src`](#src)
- [`width`](#width)
- [`quality`](#quality)

Here is an example of using a custom loader with `next/image`:

```js
import Image from 'next/image'

const myLoader = ({ src, width, quality }) => {
  return `https://example.com/${src}?w=${width}&q=${quality || 75}`
}

const MyImage = (props) => {
  return (
    <Image
      loader={myLoader}
      src="me.png"
      alt="Picture of the author"
      width={500}
      height={500}
    />
  )
}
```

### sizes

A string that provides information about how wide the image will be at different breakpoints. Defaults to `100vw` (the full width of the screen) when using `layout="responsive"` or `layout="fill"`.

`sizes` is important for performance when using `layout="responsive"` or `layout="fill"` with images that take up less than the full viewport width.

If you are using `layout="fill"` or `layout="responsive"` and the image will always be less than half the viewport width, include `sizes="50vw"`. Without `sizes`, the image will be sent at twice the necessary resolution, decreasing performance.

[Learn more](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/img#attr-sizes).

### quality

The quality of the optimized image, an integer between `1` and `100` where `100` is the best quality. Defaults to `75`.

### priority

When true, the image will be considered high priority and
[preload](https://web.dev/preload-responsive-images/). Lazy loading is automatically disabled for images using `priority`.

You should use the `priority` attribute on any image which you suspect will be the [Largest Contentful Paint (LCP) element](https://nextjs.org/learn/seo/web-performance/lcp). It may be appropriate to have multiple priority images, as different images may be the LCP element for different viewport sizes.

Should only be used when the image is visible above the fold. Defaults to `false`.

### placeholder

A placeholder to use while the image is loading. Possible values are `blur` or `empty`. Defaults to `empty`.

When `blur`, the [`blurDataURL`](#blurdataurl) property will be used as the placeholder. If `src` is an object from a [static import](#local-images) and the imported image is `.jpg`, `.png`, `.webp`, or `.avif`, then `blurDataURL` will be automatically populated.

For dynamic images, you must provide the [`blurDataURL`](#blurdataurl) property. Solutions such as [Plaiceholder](https://github.com/joe-bell/plaiceholder) can help with `base64` generation.

When `empty`, there will be no placeholder while the image is loading, only empty space.

Try it out:

- [Demo the `blur` placeholder](https://image-component.nextjs.gallery/placeholder)
- [Demo the shimmer effect with `blurDataURL` prop](https://image-component.nextjs.gallery/shimmer)

## Advanced Props

In some cases, you may need more advanced usage. The `<Image />` component optionally accepts the following advanced properties.

### objectFit

Defines how the image will fit into its parent container when using `layout="fill"`.

This value is passed to the [object-fit CSS property](https://developer.mozilla.org/en-US/docs/Web/CSS/object-fit) for the `src` image.

### objectPosition

Defines how the image is positioned within its parent element when using `layout="fill"`.

This value is passed to the [object-position CSS property](https://developer.mozilla.org/en-US/docs/Web/CSS/object-position) applied to the image.

### onLoadingComplete

A callback function that is invoked once the image is completely loaded and the [placeholder](#placeholder) has been removed.

The `onLoadingComplete` function accepts one parameter, an object with the following properties:

- [`naturalWidth`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/naturalWidth)
- [`naturalHeight`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/naturalHeight)

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

### blurDataURL

A [Data URL](https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/Data_URIs) to
be used as a placeholder image before the `src` image successfully loads. Only takes effect when combined
with [`placeholder="blur"`](#placeholder).

Must be a base64-encoded image. It will be enlarged and blurred, so a very small image (10px or
less) is recommended. Including larger images as placeholders may harm your application performance.

Try it out:

- [Demo the default `blurDataURL` prop](https://image-component.nextjs.gallery/placeholder)
- [Demo the shimmer effect with `blurDataURL` prop](https://image-component.nextjs.gallery/shimmer)

You can also [generate a solid color Data URL](https://png-pixel.com) to match the image.

### lazyBoundary

A string (with similar syntax to the margin property) that acts as the bounding box used to detect the intersection of the viewport with the image and trigger lazy [loading](#loading). Defaults to `"200px"`.

[Learn more](https://developer.mozilla.org/en-US/docs/Web/API/IntersectionObserver/rootMargin)

### unoptimized

When true, the source image will be served as-is instead of changing quality,
size, or format. Defaults to `false`.

## Other Props

Other properties on the `<Image />` component will be passed to the underlying
`img` element with the exception of the following:

- `style`. Use `className` instead.
- `srcSet`. Use
  [Device Sizes](#device-sizes)
  instead.
- `ref`. Use [`onLoadingComplete`](#onloadingcomplete) instead.
- `decoding`. It is always `"async"`.

## Configuration Options

### Domains

To protect your application from malicious users, you must define a list of image provider domains that you want to be served from the Next.js Image Optimization API. This is configured in with the `domains` property in your `next.config.js` file, as shown below:

```js
module.exports = {
  images: {
    domains: ['assets.acme.com'],
  },
}
```

### Loader Configuration

If you want to use a cloud provider to optimize images instead of using the Next.js built-in Image Optimization API, you can configure the `loader` and `path` prefix in your `next.config.js` file. This allows you to use relative URLs for the Image [`src`](#src) and automatically generate the correct absolute URL for your provider.

```js
module.exports = {
  images: {
    loader: 'imgix',
    path: 'https://example.com/myaccount/',
  },
}
```

### Built-in Loaders

The following Image Optimization cloud providers are included:

- Default: Works automatically with `next dev`, `next start`, or a custom server
- [Vercel](https://vercel.com): Works automatically when you deploy on Vercel, no configuration necessary. [Learn more](https://vercel.com/docs/next.js/image-optimization)
- [Imgix](https://www.imgix.com): `loader: 'imgix'`
- [Cloudinary](https://cloudinary.com): `loader: 'cloudinary'`
- [Akamai](https://www.akamai.com): `loader: 'akamai'`
- Custom: `loader: 'custom'` use a custom cloud provider by implementing the [`loader`](/docs/api-reference/next/image.md#loader) prop on the `next/image` component

If you need a different provider, you can use the [`loader`](#loader) prop with `next/image`.

> The `next/image` component's default loader is not supported when using [`next export`](/docs/advanced-features/static-html-export.md). However, other loader options will work.

> The `next/image` component's default loader uses [`squoosh`](https://www.npmjs.com/package/@squoosh/lib) because it is quick to install and suitable for a development environment. When using `next start` in your production environment, it is strongly recommended that you install [`sharp`](https://www.npmjs.com/package/sharp) by running `yarn add sharp` in your project directory. This is not necessary for Vercel deployments, as `sharp` is installed automatically.

## Advanced

The following configuration is for advanced use cases and is usually not necessary. If you choose to configure the properties below, you will override any changes to the Next.js defaults in future updates.

### Device Sizes

If you know the expected device widths of your users, you can specify a list of device width breakpoints using the `deviceSizes` property in `next.config.js`. These widths are used when the [`next/image`](/docs/api-reference/next/image.md) component uses `layout="responsive"` or `layout="fill"` to ensure the correct image is served for user's device.

If no configuration is provided, the default below is used.

```js
module.exports = {
  images: {
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
  },
}
```

### Image Sizes

You can specify a list of image widths using the `images.imageSizes` property in your `next.config.js` file. These widths are concatenated with the array of [device sizes](#device-sizes) to form the full array of sizes used to generate image [srcset](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/srcset)s.

The reason there are two seperate lists is that imageSizes is only used for images which provide a [`sizes`](#sizes) prop, which indicates that the image is less than the full width of the screen. **Therefore, the sizes in imageSizes should all be smaller than the smallest size in deviceSizes.**

If no configuration is provided, the default below is used.

```js
module.exports = {
  images: {
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
}
```

## Caching Behavior

The following describes the caching algorithm for the default [loader](#loader). For all other loaders, please refer to your cloud provider's documentation.

Images are optimized dynamically upon request and stored in the `<distDir>/cache/images` directory. The optimized image file will be served for subsequent requests until the expiration is reached. When a request is made that matches a cached but expired file, the cached file is deleted before generating a new optimized image and caching the new file.

The expiration (or rather Max Age) is defined by either the [`minimumCacheTTL`](#minimum-cache-ttl) configuration or the upstream server's `Cache-Control` header, whichever is larger. Specifically, the `max-age` value of the `Cache-Control` header is used. If both `s-maxage` and `max-age` are found, then `s-maxage` is preferred.

- You can configure [`minimumCacheTTL`](#minimum-cache-ttl) to increase the cache duration when the upstream image does not include `Cache-Control` header or the value is very low.
- You can configure [`deviceSizes`](#device-sizes) and [`imageSizes`](#device-sizes) to reduce the total number of possible generated images.
- You can configure [formats](/docs/basic-features/image-optimization.md#acceptable-formats) to disable multiple formats in favor of a single image format.

### Minimum Cache TTL

You can configure the Time to Live (TTL) in seconds for cached optimized images. In many cases, it's better to use a [Static Image Import](/docs/basic-features/image-optimization.md#local-images) which will automatically hash the file contents and cache the image forever with a `Cache-Control` header of `immutable`.

```js
module.exports = {
  images: {
    minimumCacheTTL: 60,
  },
}
```

If you need to add a `Cache-Control` header for the browser (not recommended), you can configure [`headers`](/docs/api-reference/next.config.js/headers) on the upstream image e.g. `/some-asset.jpg` not `/_next/image` itself.

### Disable Static Imports

The default behavior allows you to import static files such as `import icon from './icon.png` and then pass that to the `src` property.

In some cases, you may wish to disable this feature if it conflicts with other plugins that expect the import to behave differently.

You can disable static image imports inside your `next.config.js`:

```js
module.exports = {
  images: {
    disableStaticImages: true,
  },
}
```

### Acceptable Formats

The default [Image Optimization API](#loader-configuration) will automatically detect the browser's supported image formats via the request's `Accept` header.

If the `Accept` matches more than one of the configured formats, the first match in the array is used. Therefore, the array order matters. If there is no match, the Image Optimization API will fallback to the original image's format.

If no configuration is provided, the default below is used.

```js
module.exports = {
  images: {
    formats: ['image/avif', 'image/webp'],
  },
}
```

## Related

For an overview of the Image component features and usage guidelines, see:

<div class="card">
  <a href="/docs/basic-features/image-optimization.md">
    <b>Images</b>
    <small>Learn how to display and optimize images with the Image component.</small>
  </a>
</div>
