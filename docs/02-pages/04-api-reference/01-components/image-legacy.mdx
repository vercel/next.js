---
title: Image (Legacy)
description: Backwards compatible Image Optimization with the Legacy Image component.
version: legacy
---

Starting with Next.js 13, the `next/image` component was rewritten to improve both the performance and developer experience. In order to provide a backwards compatible upgrade solution, the old `next/image` was renamed to `next/legacy/image`.

> **Warning**: `next/legacy/image` is deprecated and will be removed in a future version of Next.js. Please use [`next/image`](/docs/app/api-reference/components/image) instead.

## Comparison

Compared to `next/legacy/image`, the new `next/image` component has the following changes:

- Removes `<span>` wrapper around `<img>` in favor of [native computed aspect ratio](https://caniuse.com/mdn-html_elements_img_aspect_ratio_computed_from_attributes)
- Adds support for canonical `style` prop
  - Removes `layout` prop in favor of `style` or `className`
  - Removes `objectFit` prop in favor of `style` or `className`
  - Removes `objectPosition` prop in favor of `style` or `className`
- Removes `IntersectionObserver` implementation in favor of [native lazy loading](https://caniuse.com/loading-lazy-attr)
  - Removes `lazyBoundary` prop since there is no native equivalent
  - Removes `lazyRoot` prop since there is no native equivalent
- Removes `loader` config in favor of [`loader`](#loader) prop
- Changed `alt` prop from optional to required
- Changed `onLoadingComplete` callback to receive reference to `<img>` element

## Required Props

The `<Image />` component requires the following properties.

### src

Must be one of the following:

- A [statically imported](/docs/pages/api-reference/components/image#src) image file
- A path string. This can be either an absolute external URL, or an internal path depending on the [loader](#loader) prop or [loader configuration](#loader-configuration).

When using the default [loader](#loader), also consider the following for source images:

- When src is an external URL, you must also configure [remotePatterns](#remote-patterns)
- When src is [animated](#animated-images) or not a known format (JPEG, PNG, WebP, AVIF, GIF, TIFF) the image will be served as-is
- When src is SVG format, it will be blocked unless `unoptimized` or `dangerouslyAllowSVG` is enabled

### width

The `width` property can represent either the _rendered_ width or _original_ width in pixels, depending on the [`layout`](#layout) and [`sizes`](#sizes) properties.

When using `layout="intrinsic"` or `layout="fixed"` the `width` property represents the _rendered_ width in pixels, so it will affect how large the image appears.

When using `layout="responsive"`, `layout="fill"`, the `width` property represents the _original_ width in pixels, so it will only affect the aspect ratio.

The `width` property is required, except for [statically imported images](/docs/pages/api-reference/components/image#src), or those with `layout="fill"`.

### height

The `height` property can represent either the _rendered_ height or _original_ height in pixels, depending on the [`layout`](#layout) and [`sizes`](#sizes) properties.

When using `layout="intrinsic"` or `layout="fixed"` the `height` property represents the _rendered_ height in pixels, so it will affect how large the image appears.

When using `layout="responsive"`, `layout="fill"`, the `height` property represents the _original_ height in pixels, so it will only affect the aspect ratio.

The `height` property is required, except for [statically imported images](/docs/pages/api-reference/components/image#src), or those with `layout="fill"`.

## Optional Props

The `<Image />` component accepts a number of additional properties beyond those which are required. This section describes the most commonly-used properties of the Image component. Find details about more rarely-used properties in the [Advanced Props](#advanced-props) section.

### layout

The layout behavior of the image as the viewport changes size.

| `layout`              | Behavior                                                 | `srcSet`                                                                                                    | `sizes` | Has wrapper and sizer |
| --------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------- | --------------------- |
| `intrinsic` (default) | Scale _down_ to fit width of container, up to image size | `1x`, `2x` (based on [imageSizes](#image-sizes))                                                            | N/A     | yes                   |
| `fixed`               | Sized to `width` and `height` exactly                    | `1x`, `2x` (based on [imageSizes](#image-sizes))                                                            | N/A     | yes                   |
| `responsive`          | Scale to fit width of container                          | `640w`, `750w`, ... `2048w`, `3840w` (based on [imageSizes](#image-sizes) and [deviceSizes](#device-sizes)) | `100vw` | yes                   |
| `fill`                | Grow in both X and Y axes to fill container              | `640w`, `750w`, ... `2048w`, `3840w` (based on [imageSizes](#image-sizes) and [deviceSizes](#device-sizes)) | `100vw` | yes                   |

- [Demo the `intrinsic` layout (default)](https://image-legacy-component.nextjs.gallery/layout-intrinsic)
  - When `intrinsic`, the image will scale the dimensions down for smaller viewports, but maintain the original dimensions for larger viewports.
- [Demo the `fixed` layout](https://image-legacy-component.nextjs.gallery/layout-fixed)
  - When `fixed`, the image dimensions will not change as the viewport changes (no responsiveness) similar to the native `img` element.
- [Demo the `responsive` layout](https://image-legacy-component.nextjs.gallery/layout-responsive)
  - When `responsive`, the image will scale the dimensions down for smaller viewports and scale up for larger viewports.
  - Ensure the parent element uses `display: block` in their stylesheet.
- [Demo the `fill` layout](https://image-legacy-component.nextjs.gallery/layout-fill)
  - When `fill`, the image will stretch both width and height to the dimensions of the parent element, provided the parent element is relative.
  - This is usually paired with the [`objectFit`](#objectfit) property.
  - Ensure the parent element has `position: relative` in their stylesheet.
- [Demo background image](https://image-legacy-component.nextjs.gallery/background)

### loader

A custom function used to resolve URLs. Setting the loader as a prop on the Image component overrides the default loader defined in the [`images` section of `next.config.js`](#loader-configuration).

A `loader` is a function returning a URL string for the image, given the following parameters:

- [`src`](#src)
- [`width`](#width)
- [`quality`](#quality)

Here is an example of using a custom loader:

```js
import Image from 'next/legacy/image'

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

A string that provides information about how wide the image will be at different breakpoints. The value of `sizes` will greatly affect performance for images using `layout="responsive"` or `layout="fill"`. It will be ignored for images using `layout="intrinsic"` or `layout="fixed"`.

The `sizes` property serves two important purposes related to image performance:

First, the value of `sizes` is used by the browser to determine which size of the image to download, from `next/legacy/image`'s automatically-generated source set. When the browser chooses, it does not yet know the size of the image on the page, so it selects an image that is the same size or larger than the viewport. The `sizes` property allows you to tell the browser that the image will actually be smaller than full screen. If you don't specify a `sizes` value, a default value of `100vw` (full screen width) is used.

Second, the `sizes` value is parsed and used to trim the values in the automatically-created source set. If the `sizes` property includes sizes such as `50vw`, which represent a percentage of the viewport width, then the source set is trimmed to not include any values which are too small to ever be necessary.

For example, if you know your styling will cause an image to be full-width on mobile devices, in a 2-column layout on tablets, and a 3-column layout on desktop displays, you should include a sizes property such as the following:

```js
import Image from 'next/legacy/image'
const Example = () => (
  <div className="grid-element">
    <Image
      src="/example.png"
      layout="fill"
      sizes="(max-width: 768px) 100vw,
              (max-width: 1200px) 50vw,
              33vw"
    />
  </div>
)
```

This example `sizes` could have a dramatic effect on performance metrics. Without the `33vw` sizes, the image selected from the server would be 3 times as wide as it needs to be. Because file size is proportional to the square of the width, without `sizes` the user would download an image that's 9 times larger than necessary.

Learn more about `srcset` and `sizes`:

- [web.dev](https://web.dev/learn/design/responsive-images/#sizes)
- [mdn](https://developer.mozilla.org/docs/Web/HTML/Element/img#attr-sizes)

### quality

The quality of the optimized image, an integer between `1` and `100` where `100` is the best quality. Defaults to `75`.

### priority

When true, the image will be considered high priority and
[preload](https://web.dev/preload-responsive-images/). Lazy loading is automatically disabled for images using `priority`.

You should use the `priority` property on any image detected as the [Largest Contentful Paint (LCP)](https://nextjs.org/learn/seo/web-performance/lcp) element. It may be appropriate to have multiple priority images, as different images may be the LCP element for different viewport sizes.

Should only be used when the image is visible above the fold. Defaults to `false`.

### placeholder

A placeholder to use while the image is loading. Possible values are `blur` or `empty`. Defaults to `empty`.

When `blur`, the [`blurDataURL`](#blurdataurl) property will be used as the placeholder. If `src` is an object from a [static import](/docs/pages/api-reference/components/image#src) and the imported image is `.jpg`, `.png`, `.webp`, or `.avif`, then `blurDataURL` will be automatically populated.

For dynamic images, you must provide the [`blurDataURL`](#blurdataurl) property. Solutions such as [Plaiceholder](https://github.com/joe-bell/plaiceholder) can help with `base64` generation.

When `empty`, there will be no placeholder while the image is loading, only empty space.

Try it out:

- [Demo the `blur` placeholder](https://image-legacy-component.nextjs.gallery/placeholder)
- [Demo the shimmer effect with `blurDataURL` prop](https://image-legacy-component.nextjs.gallery/shimmer)
- [Demo the color effect with `blurDataURL` prop](https://image-legacy-component.nextjs.gallery/color)

## Advanced Props

In some cases, you may need more advanced usage. The `<Image />` component optionally accepts the following advanced properties.

### style

Allows [passing CSS styles](https://developer.mozilla.org/docs/Web/HTML/Element/style) to the underlying image element.

Note that all `layout` modes apply their own styles to the image element, and these automatic styles take precedence over the `style` prop.

Also keep in mind that the required `width` and `height` props can interact with your styling. If you use styling to modify an image's `width`, you must set the `height="auto"` style as well, or your image will be distorted.

### objectFit

Defines how the image will fit into its parent container when using `layout="fill"`.

This value is passed to the [object-fit CSS property](https://developer.mozilla.org/docs/Web/CSS/object-fit) for the `src` image.

### objectPosition

Defines how the image is positioned within its parent element when using `layout="fill"`.

This value is passed to the [object-position CSS property](https://developer.mozilla.org/docs/Web/CSS/object-position) applied to the image.

### onLoadingComplete

A callback function that is invoked once the image is completely loaded and the [placeholder](#placeholder) has been removed.

The `onLoadingComplete` function accepts one parameter, an object with the following properties:

- [`naturalWidth`](https://developer.mozilla.org/docs/Web/API/HTMLImageElement/naturalWidth)
- [`naturalHeight`](https://developer.mozilla.org/docs/Web/API/HTMLImageElement/naturalHeight)

### loading

The loading behavior of the image. Defaults to `lazy`.

When `lazy`, defer loading the image until it reaches a calculated distance from
the viewport.

When `eager`, load the image immediately.

[Learn more](https://developer.mozilla.org/docs/Web/HTML/Element/img#attr-loading)

### blurDataURL

A [Data URL](https://developer.mozilla.org/docs/Web/HTTP/Basics_of_HTTP/Data_URIs) to
be used as a placeholder image before the `src` image successfully loads. Only takes effect when combined
with [`placeholder="blur"`](#placeholder).

Must be a base64-encoded image. It will be enlarged and blurred, so a very small image (10px or
less) is recommended. Including larger images as placeholders may harm your application performance.

Try it out:

- [Demo the default `blurDataURL` prop](https://image-legacy-component.nextjs.gallery/placeholder)
- [Demo the shimmer effect with `blurDataURL` prop](https://image-legacy-component.nextjs.gallery/shimmer)
- [Demo the color effect with `blurDataURL` prop](https://image-legacy-component.nextjs.gallery/color)

You can also [generate a solid color Data URL](https://png-pixel.com) to match the image.

### lazyBoundary

A string (with similar syntax to the margin property) that acts as the bounding box used to detect the intersection of the viewport with the image and trigger lazy [loading](#loading). Defaults to `"200px"`.

If the image is nested in a scrollable parent element other than the root document, you will also need to assign the [lazyRoot](#lazyroot) prop.

[Learn more](https://developer.mozilla.org/docs/Web/API/IntersectionObserver/rootMargin)

### lazyRoot

A React [Ref](https://react.dev/learn/referencing-values-with-refs) pointing to the scrollable parent element. Defaults to `null` (the document viewport).

The Ref must point to a DOM element or a React component that [forwards the Ref](https://react.dev/reference/react/forwardRef) to the underlying DOM element.

**Example pointing to a DOM element**

```jsx
import Image from 'next/legacy/image'
import React from 'react'

const Example = () => {
  const lazyRoot = React.useRef(null)

  return (
    <div ref={lazyRoot} style={{ overflowX: 'scroll', width: '500px' }}>
      <Image lazyRoot={lazyRoot} src="/one.jpg" width="500" height="500" />
      <Image lazyRoot={lazyRoot} src="/two.jpg" width="500" height="500" />
    </div>
  )
}
```

**Example pointing to a React component**

```jsx
import Image from 'next/legacy/image'
import React from 'react'

const Container = React.forwardRef((props, ref) => {
  return (
    <div ref={ref} style={{ overflowX: 'scroll', width: '500px' }}>
      {props.children}
    </div>
  )
})

const Example = () => {
  const lazyRoot = React.useRef(null)

  return (
    <Container ref={lazyRoot}>
      <Image lazyRoot={lazyRoot} src="/one.jpg" width="500" height="500" />
      <Image lazyRoot={lazyRoot} src="/two.jpg" width="500" height="500" />
    </Container>
  )
}
```

[Learn more](https://developer.mozilla.org/docs/Web/API/IntersectionObserver/root)

### unoptimized

When true, the source image will be served as-is from the `src` instead of changing quality, size, or format. Defaults to `false`.

This is useful for images that do not benefit from optimization such as small images (less than 1KB), vector images (SVG), or animated images (GIF).

```js
import Image from 'next/image'

const UnoptimizedImage = (props) => {
  return <Image {...props} unoptimized />
}
```

Since Next.js 12.3.0, this prop can be assigned to all images by updating `next.config.js` with the following configuration:

```js filename="next.config.js"
module.exports = {
  images: {
    unoptimized: true,
  },
}
```

## Other Props

Other properties on the `<Image />` component will be passed to the underlying
`img` element with the exception of the following:

- `srcSet`. Use
  [Device Sizes](#device-sizes)
  instead.
- `ref`. Use [`onLoadingComplete`](#onloadingcomplete) instead.
- `decoding`. It is always `"async"`.

## Configuration Options

### Remote Patterns

To protect your application from malicious users, configuration is required in order to use external images. This ensures that only external images from your account can be served from the Next.js Image Optimization API. These external images can be configured with the `remotePatterns` property in your `next.config.js` file, as shown below:

```js filename="next.config.js"
module.exports = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'example.com',
        port: '',
        pathname: '/account123/**',
        search: '',
      },
    ],
  },
}
```

> **Good to know**: The example above will ensure the `src` property of `next/legacy/image` must start with `https://example.com/account123/` and must not have a query string. Any other protocol, hostname, port, or unmatched path will respond with 400 Bad Request.

Below is an example of the `remotePatterns` property in the `next.config.js` file using a wildcard pattern in the `hostname`:

```js filename="next.config.js"
module.exports = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.example.com',
        port: '',
        search: '',
      },
    ],
  },
}
```

> **Good to know**: The example above will ensure the `src` property of `next/legacy/image` must start with `https://img1.example.com` or `https://me.avatar.example.com` or any number of subdomains. It cannot have a port or query string. Any other protocol or unmatched hostname will respond with 400 Bad Request.

Wildcard patterns can be used for both `pathname` and `hostname` and have the following syntax:

- `*` match a single path segment or subdomain
- `**` match any number of path segments at the end or subdomains at the beginning

The `**` syntax does not work in the middle of the pattern.

> **Good to know**: When omitting `protocol`, `port`, `pathname`, or `search` then the wildcard `**` is implied. This is not recommended because it may allow malicious actors to optimize urls you did not intend.

Below is an example of the `remotePatterns` property in the `next.config.js` file using `search`:

```js filename="next.config.js"
module.exports = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'assets.example.com',
        search: '?v=1727111025337',
      },
    ],
  },
}
```

> **Good to know**: The example above will ensure the `src` property of `next/legacy/image` must start with `https://assets.example.com` and must have the exact query string `?v=1727111025337`. Any other protocol or query string will respond with 400 Bad Request.

### Domains

> **Warning**: Deprecated since Next.js 14 in favor of strict [`remotePatterns`](#remote-patterns) in order to protect your application from malicious users. Only use `domains` if you own all the content served from the domain.

Similar to [`remotePatterns`](#remote-patterns), the `domains` configuration can be used to provide a list of allowed hostnames for external images.

However, the `domains` configuration does not support wildcard pattern matching and it cannot restrict protocol, port, or pathname.

Below is an example of the `domains` property in the `next.config.js` file:

```js filename="next.config.js"
module.exports = {
  images: {
    domains: ['assets.acme.com'],
  },
}
```

### Loader Configuration

If you want to use a cloud provider to optimize images instead of using the Next.js built-in Image Optimization API, you can configure the `loader` and `path` prefix in your `next.config.js` file. This allows you to use relative URLs for the Image [`src`](#src) and automatically generate the correct absolute URL for your provider.

```js filename="next.config.js"
module.exports = {
  images: {
    loader: 'imgix',
    path: 'https://example.com/myaccount/',
  },
}
```

#### Customizing the Built-in Image Path

If you want to change or prefix the default path for the built-in Next.js image optimization, you can do so with the `path` property. The default value for `path` is `/_next/image`.

```js filename="next.config.js"
module.exports = {
  images: {
    path: '/my-prefix/_next/image',
  },
}
```

### Built-in Loaders

The following Image Optimization cloud providers are included:

- Default: Works automatically with `next dev`, `next start`, or a custom server
- [Vercel](https://vercel.com): Works automatically when you deploy on Vercel, no configuration necessary. [Learn more](https://vercel.com/docs/concepts/image-optimization?utm_source=next-site&utm_medium=docs&utm_campaign=next-website)
- [Imgix](https://www.imgix.com): `loader: 'imgix'`
- [Cloudinary](https://cloudinary.com): `loader: 'cloudinary'`
- [Akamai](https://www.akamai.com): `loader: 'akamai'`
- Custom: `loader: 'custom'` use a custom cloud provider by implementing the [`loader`](#loader) prop on the `next/legacy/image` component

If you need a different provider, you can use the [`loader`](#loader) prop with `next/legacy/image`.

> Images can not be optimized at build time using [`output: 'export'`](/docs/pages/guides/static-exports), only on-demand. To use `next/legacy/image` with `output: 'export'`, you will need to use a different loader than the default. [Read more in the discussion.](https://github.com/vercel/next.js/discussions/19065)

## Advanced

The following configuration is for advanced use cases and is usually not necessary. If you choose to configure the properties below, you will override any changes to the Next.js defaults in future updates.

### Device Sizes

If you know the expected device widths of your users, you can specify a list of device width breakpoints using the `deviceSizes` property in `next.config.js`. These widths are used when the `next/legacy/image` component uses `layout="responsive"` or `layout="fill"` to ensure the correct image is served for user's device.

If no configuration is provided, the default below is used.

```js filename="next.config.js"
module.exports = {
  images: {
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
  },
}
```

### Image Sizes

You can specify a list of image widths using the `images.imageSizes` property in your `next.config.js` file. These widths are concatenated with the array of [device sizes](#device-sizes) to form the full array of sizes used to generate image [srcset](https://developer.mozilla.org/docs/Web/API/HTMLImageElement/srcset)s.

The reason there are two separate lists is that imageSizes is only used for images which provide a [`sizes`](#sizes) prop, which indicates that the image is less than the full width of the screen. **Therefore, the sizes in imageSizes should all be smaller than the smallest size in deviceSizes.**

If no configuration is provided, the default below is used.

```js filename="next.config.js"
module.exports = {
  images: {
    imageSizes: [32, 48, 64, 96, 128, 256, 384],
  },
}
```

### Acceptable Formats

The default [Image Optimization API](#loader-configuration) will automatically detect the browser's supported image formats via the request's `Accept` header in order to determine the best output format.

If the `Accept` header matches more than one of the configured formats, the first match in the array is used. Therefore, the array order matters. If there is no match (or the source image is [animated](#animated-images)), the Image Optimization API will fallback to the original image's format.

If no configuration is provided, the default below is used.

```js filename="next.config.js"
module.exports = {
  images: {
    formats: ['image/webp'],
  },
}
```

You can enable AVIF support, which will fallback to the original format of the src image if the browser [does not support AVIF](https://caniuse.com/avif):

```js filename="next.config.js"
module.exports = {
  images: {
    formats: ['image/avif'],
  },
}
```

> **Good to know**:
>
> - We still recommend using WebP for most use cases.
> - AVIF generally takes 50% longer to encode but it compresses 20% smaller compared to WebP. This means that the first time an image is requested, it will typically be slower and then subsequent requests that are cached will be faster.
> - If you self-host with a Proxy/CDN in front of Next.js, you must configure the Proxy to forward the `Accept` header.

## Caching Behavior

The following describes the caching algorithm for the default [loader](#loader). For all other loaders, please refer to your cloud provider's documentation.

Images are optimized dynamically upon request and stored in the `<distDir>/cache/images` directory. The optimized image file will be served for subsequent requests until the expiration is reached. When a request is made that matches a cached but expired file, the expired image is served stale immediately. Then the image is optimized again in the background (also called revalidation) and saved to the cache with the new expiration date.

The cache status of an image can be determined by reading the value of the `x-nextjs-cache` (`x-vercel-cache` when deployed on Vercel) response header. The possible values are the following:

- `MISS` - the path is not in the cache (occurs at most once, on the first visit)
- `STALE` - the path is in the cache but exceeded the revalidate time so it will be updated in the background
- `HIT` - the path is in the cache and has not exceeded the revalidate time

The expiration (or rather Max Age) is defined by either the [`minimumCacheTTL`](#minimum-cache-ttl) configuration or the upstream image `Cache-Control` header, whichever is larger. Specifically, the `max-age` value of the `Cache-Control` header is used. If both `s-maxage` and `max-age` are found, then `s-maxage` is preferred. The `max-age` is also passed-through to any downstream clients including CDNs and browsers.

- You can configure [`minimumCacheTTL`](#minimum-cache-ttl) to increase the cache duration when the upstream image does not include `Cache-Control` header or the value is very low.
- You can configure [`deviceSizes`](#device-sizes) and [`imageSizes`](#image-sizes) to reduce the total number of possible generated images.
- You can configure [formats](#acceptable-formats) to disable multiple formats in favor of a single image format.

### Minimum Cache TTL

You can configure the Time to Live (TTL) in seconds for cached optimized images. In many cases, it's better to use a [Static Image Import](/docs/pages/api-reference/components/image#src) which will automatically hash the file contents and cache the image forever with a `Cache-Control` header of `immutable`.

If no configuration is provided, the default below is used.

```js filename="next.config.js"
module.exports = {
  images: {
    minimumCacheTTL: 14400, // 4 hours
  },
}
```

You can increase the TTL to reduce the number of revalidations and potentially lower cost:

```js filename="next.config.js"
module.exports = {
  images: {
    minimumCacheTTL: 2678400, // 31 days
  },
}
```

The expiration (or rather Max Age) of the optimized image is defined by either the `minimumCacheTTL` or the upstream image `Cache-Control` header, whichever is larger.

If you need to change the caching behavior per image, you can configure [`headers`](/docs/pages/api-reference/config/next-config-js/headers) to set the `Cache-Control` header on the upstream image (e.g. `/some-asset.jpg`, not `/_next/image` itself).

There is no mechanism to invalidate the cache at this time, so its best to keep `minimumCacheTTL` low. Otherwise you may need to manually change the [`src`](#src) prop or delete `<distDir>/cache/images`.

### Disable Static Imports

The default behavior allows you to import static files such as `import icon from './icon.png'` and then pass that to the `src` property.

In some cases, you may wish to disable this feature if it conflicts with other plugins that expect the import to behave differently.

You can disable static image imports inside your `next.config.js`:

```js filename="next.config.js"
module.exports = {
  images: {
    disableStaticImages: true,
  },
}
```

### Dangerously Allow SVG

The default [loader](#loader) does not optimize SVG images for a few reasons. First, SVG is a vector format meaning it can be resized losslessly. Second, SVG has many of the same features as HTML/CSS, which can lead to vulnerabilities without proper [Content Security Policy (CSP) headers](/docs/app/api-reference/config/next-config-js/headers#content-security-policy).

Therefore, we recommended using the [`unoptimized`](#unoptimized) prop when the [`src`](#src) prop is known to be SVG. This happens automatically when `src` ends with `".svg"`.

However, if you need to serve SVG images with the default Image Optimization API, you can set `dangerouslyAllowSVG` inside your `next.config.js`:

```js filename="next.config.js"
module.exports = {
  images: {
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
}
```

In addition, it is strongly recommended to also set `contentDispositionType` to force the browser to download the image, as well as `contentSecurityPolicy` to prevent scripts embedded in the image from executing.

### `contentDispositionType`

The default [loader](#loader) sets the [`Content-Disposition`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Disposition#as_a_response_header_for_the_main_body) header to `attachment` for added protection since the API can serve arbitrary remote images.

The default value is `attachment` which forces the browser to download the image when visiting directly. This is particularly important when [`dangerouslyAllowSVG`](#dangerously-allow-svg) is true.

You can optionally configure `inline` to allow the browser to render the image when visiting directly, without downloading it.

```js filename="next.config.js"
module.exports = {
  images: {
    contentDispositionType: 'inline',
  },
}
```

### Animated Images

The default [loader](#loader) will automatically bypass Image Optimization for animated images and serve the image as-is.

Auto-detection for animated files is best-effort and supports GIF, APNG, and WebP. If you want to explicitly bypass Image Optimization for a given animated image, use the [unoptimized](#unoptimized) prop.

## Version History

| Version   | Changes                                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------- |
| `v16.0.0` | `next/legacy/image` deprecated and will be removed in a future version of Next.js. Please use `next/image` instead. |
| `v13.0.0` | `next/image` renamed to `next/legacy/image`                                                                         |
