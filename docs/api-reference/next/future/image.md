---
description: Try the latest Image Optimization with the new `next/future/image` component.
---

# next/future/image

<details>
  <summary><b>Version History</b></summary>

| Version   | Changes                                                                                                                                                          |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `v12.3.0` | `next/future/image` component stable. `remotePatterns` config stable. `unoptimized` config stable. `alt` property required. `onLoadingComplete` receives `<img>` |
| `v12.2.4` | `fill` property added.                                                                                                                                           |
| `v12.2.0` | Experimental `next/future/image` component introduced.                                                                                                           |

</details>

The `next/future/image` component improves both the performance and developer experience of `next/image` by using the native `<img>` element with better default behavior.

This component uses browser native [lazy loading](https://caniuse.com/loading-lazy-attr), which may fallback to eager loading for older browsers before Safari 15.4. When using the blur-up placeholder, older browsers before Safari 12 will fallback to empty placeholder. When using styles with `width`/`height` of `auto`, it is possible to cause [Layout Shift](https://web.dev/cls/) on older browsers before Safari 15 that don't [preserve the aspect ratio](https://caniuse.com/mdn-html_elements_img_aspect_ratio_computed_from_attributes). For more details, see [this MDN video](https://www.youtube.com/watch?v=4-d_SoCHeWE).

## Comparison

Compared to `next/image`, the new `next/future/image` component has the following changes:

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

## Known Browser Bugs

- [Safari 15+](https://bugs.webkit.org/show_bug.cgi?id=243601) displays a gray border while loading. Possible solutions:
  - Use CSS `@media not all and (min-resolution:.001dpcm) { img[loading="lazy"] { clip-path: inset(0.5px) } }`
  - Use [`priority`](#priority) if the image is above the fold
- [Firefox 67+](https://bugzilla.mozilla.org/show_bug.cgi?id=1556156) displays a white background while loading progressive jpeg. Possible solutions:
  - Enable [AVIF `formats`](#acceptable-formats)
  - Use [`placeholder="blur"`](#placeholder)

## Migration

Although `layout` is not available, you can migrate `next/image` to `next/future/image` using a few props. The following code snippets compare the two components:

#### before: `next/image`

```jsx
import Image from 'next/image'
import img from '../img.png'

function Page() {
  return <Image src={img} />
}
```

#### after: `next/future/image`

```jsx
import Image from 'next/future/image'
import img from '../img.png'

const css = { maxWidth: '100%', height: 'auto' }
function Page() {
  return <Image src={img} style={css} />
}
```

#### before: `next/image`

```jsx
import Image from 'next/image'
import img from '../img.png'

function Page() {
  return <Image src={img} layout="responsive" />
}
```

#### after: `next/future/image`

```jsx
import Image from 'next/future/image'
import img from '../img.png'

const css = { width: '100%', height: 'auto' }
function Page() {
  return <Image src={img} sizes="100vw" style={css} />
}
```

#### before: `next/image`

```jsx
import Image from 'next/image'
import img from '../img.png'

function Page() {
  return <Image src={img} layout="fill" />
}
```

#### after: `next/future/image`

```jsx
import Image from 'next/future/image'
import img from '../img.png'

function Page() {
  return <Image src={img} sizes="100vw" fill />
}
```

#### before: `next/image`

```jsx
import Image from 'next/image'
import img from '../img.png'

function Page() {
  return <Image src={img} layout="fixed" />
}
```

#### after: `next/future/image`

```jsx
import Image from 'next/future/image'
import img from '../img.png'

function Page() {
  return <Image src={img} />
}
```

You can also use `className` instead of `style`.

## Required Props

The `<Image />` component requires the following properties.

### src

Must be one of the following:

1. A [statically imported](/docs/basic-features/image-optimization.md#local-images) image file, or
2. A path string. This can be either an absolute external URL,
   or an internal path depending on the [loader](#loader) prop.

When using an external URL, you must add it to [remotePatterns](#remote-patterns) in `next.config.js`.

### width

The `width` property represents the _rendered_ width in pixels, so it will affect how large the image appears.

Required, except for [statically imported images](/docs/basic-features/image-optimization.md#local-images) or images with the [`fill` property](#fill).

### height

The `height` property represents the _rendered_ height in pixels, so it will affect how large the image appears.

Required, except for [statically imported images](/docs/basic-features/image-optimization.md#local-images) or images with the [`fill` property](#fill).

### alt

The `alt` property is used to describe the image for screen readers and search engines. It is also the fallback text if images have been disabled or an error occurs while loading the image.

It should contain text that could replace the image [without changing the meaning of the page](https://html.spec.whatwg.org/multipage/images.html#general-guidelines). It is not meant to supplement the image and should not repeat information that is already provided in the captions above or below the image.

If the image is [purely decorative](https://html.spec.whatwg.org/multipage/images.html#a-purely-decorative-image-that-doesn't-add-any-information) or [not intended for the user](https://html.spec.whatwg.org/multipage/images.html#an-image-not-intended-for-the-user), the `alt` property should be an empty string (`alt=""`).

[Learn more](https://html.spec.whatwg.org/multipage/images.html#alt)

## Optional Props

The `<Image />` component accepts a number of additional properties beyond those which are required. This section describes the most commonly-used properties of the Image component. Find details about more rarely-used properties in the [Advanced Props](#advanced-props) section.

### loader

A custom function used to resolve image URLs.

A `loader` is a function returning a URL string for the image, given the following parameters:

- [`src`](#src)
- [`width`](#width)
- [`quality`](#quality)

Here is an example of using a custom loader:

```js
import Image from 'next/future/image'

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

### fill

A boolean that causes the image to fill the parent element instead of setting [`width`](#width) and [`height`](#height).

The parent element _must_ assign `position: "relative"`, `position: "fixed"`, or `position: "absolute"` style.

By default, the img element will automatically be assigned the `position: "absolute"` style.

The default image fit behavior will stretch the image to fit the container. You may prefer to set `object-fit: "contain"` for an image which is letterboxed to fit the container and preserve aspect ratio.

Alternatively, `object-fit: "cover"` will cause the image to fill the entire container and be cropped to preserve aspect ratio. For this to look correct, the `overflow: "hidden"` style should be assigned to the parent element.

See also:

- [position](https://developer.mozilla.org/en-US/docs/Web/CSS/position)
- [object-fit](https://developer.mozilla.org/en-US/docs/Web/CSS/object-fit)
- [object-position](https://developer.mozilla.org/en-US/docs/Web/CSS/object-position)

### sizes

A string that provides information about how wide the image will be at different breakpoints. The value of `sizes` will greatly affect performance for images using [`fill`](#fill) or which are styled to have a responsive size.

The `sizes` property serves two important purposes related to image performance:

First, the value of `sizes` is used by the browser to determine which size of the image to download, from `next/future/image`'s automatically-generated source set. When the browser chooses, it does not yet know the size of the image on the page, so it selects an image that is the same size or larger than the viewport. The `sizes` property allows you to tell the browser that the image will actually be smaller than full screen. If you don't specify a `sizes` value in an image with the `fill` property, a default value of `100vw` (full screen width) is used.

Second, the `sizes` property configures how `next/future/image` automatically generates an image source set. If no `sizes` value is present, a small source set is generated, suitable for a fixed-size image. If `sizes` is defined, a large source set is generated, suitable for a responsive image. If the `sizes` property includes sizes such as `50vw`, which represent a percentage of the viewport width, then the source set is trimmed to not include any values which are too small to ever be necessary.

For example, if you know your styling will cause an image to be full-width on mobile devices, in a 2-column layout on tablets, and a 3-column layout on desktop displays, you should include a sizes property such as the following:

```js
import Image from 'next/image'
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
- [mdn](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/img#attr-sizes)

### quality

The quality of the optimized image, an integer between `1` and `100`, where `100` is the best quality and therefore largest file size. Defaults to `75`.

### priority

When true, the image will be considered high priority and
[preload](https://web.dev/preload-responsive-images/). Lazy loading is automatically disabled for images using `priority`.

You should use the `priority` property on any image detected as the [Largest Contentful Paint (LCP)](https://nextjs.org/learn/seo/web-performance/lcp) element. It may be appropriate to have multiple priority images, as different images may be the LCP element for different viewport sizes.

Should only be used when the image is visible above the fold. Defaults to `false`.

### placeholder

A placeholder to use while the image is loading. Possible values are `blur` or `empty`. Defaults to `empty`.

When `blur`, the [`blurDataURL`](#blurdataurl) property will be used as the placeholder. If `src` is an object from a [static import](/docs/basic-features/image-optimization.md#local-images) and the imported image is `.jpg`, `.png`, `.webp`, or `.avif`, then `blurDataURL` will be automatically populated.

For dynamic images, you must provide the [`blurDataURL`](#blurdataurl) property. Solutions such as [Plaiceholder](https://github.com/joe-bell/plaiceholder) can help with `base64` generation.

When `empty`, there will be no placeholder while the image is loading, only empty space.

Try it out:

- [Demo the `blur` placeholder](https://image-component.nextjs.gallery/placeholder)
- [Demo the shimmer effect with `blurDataURL` prop](https://image-component.nextjs.gallery/shimmer)
- [Demo the color effect with `blurDataURL` prop](https://image-component.nextjs.gallery/color)

## Advanced Props

In some cases, you may need more advanced usage. The `<Image />` component optionally accepts the following advanced properties.

### style

Allows [passing CSS styles](https://reactjs.org/docs/dom-elements.html#style) to the underlying image element.

Also keep in mind that the required `width` and `height` props can interact with your styling. If you use styling to modify an image's `width`, you must set the `height="auto"` style as well, or your image will be distorted.

### onLoadingComplete

A callback function that is invoked once the image is completely loaded and the [placeholder](#placeholder) has been removed.

The callback function will be called with one argument, a reference to the underlying `<img>` element.

### onLoad

A callback function that is invoked when the image is loaded.

Note that the load event might occur before the placeholder is removed and the image is fully decoded.

Instead, use [`onLoadingComplete`](#onloadingcomplete).

### onError

A callback function that is invoked if the image fails to load.

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
- [Demo the color effect with `blurDataURL` prop](https://image-component.nextjs.gallery/color)

You can also [generate a solid color Data URL](https://png-pixel.com) to match the image.

### unoptimized

When true, the source image will be served as-is instead of changing quality,
size, or format. Defaults to `false`.

This prop can be assigned to all images by updating `next.config.js` with the following configuration:

```js
module.exports = {
  images: {
    unoptimized: true,
  },
}
```

## Other Props

Other properties on the `<Image />` component will be passed to the underlying
`img` element with the exception of the following:

- `srcSet`. Use [Device Sizes](#device-sizes) instead.
- `ref`. Use [`onLoadingComplete`](#onloadingcomplete) instead.
- `decoding`. It is always `"async"`.

## Configuration Options

### Remote Patterns

To protect your application from malicious users, configuration is required in order to use external images. This ensures that only external images from your account can be served from the Next.js Image Optimization API. These external images can be configured with the `remotePatterns` property in your `next.config.js` file, as shown below:

```js
module.exports = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'example.com',
        port: '',
        pathname: '/account123/**',
      },
    ],
  },
}
```

> Note: The example above will ensure the `src` property of `next/future/image` must start with `https://example.com/account123/`. Any other protocol, hostname, port, or unmatched path will respond with 400 Bad Request.

Below is another example of the `remotePatterns` property in the `next.config.js` file:

```js
module.exports = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.example.com',
      },
    ],
  },
}
```

> Note: The example above will ensure the `src` property of `next/future/image` must start with `https://img1.example.com` or `https://me.avatar.example.com` or any number of subdomains. Any other protocol or unmatched hostname will respond with 400 Bad Request.

Wildcard patterns can be used for both `pathname` and `hostname` and have the following syntax:

- `*` match a single path segment or subdomain
- `**` match any number of path segments at the end or subdomains at the beginning

The `**` syntax does not work in the middle of the pattern.

### Domains

> Note: We recommend using [`remotePatterns`](#remote-patterns) instead so you can restrict protocol and pathname.

Similar to [`remotePatterns`](#remote-patterns), the `domains` configuration can be used to provide a list of allowed hostnames for external images.

However, the `domains` configuration does not support wildcard pattern matching and it cannot restrict protocol, port, or pathname.

Below is an example of the `domains` property in the `next.config.js` file:

```js
module.exports = {
  images: {
    domains: ['assets.acme.com'],
  },
}
```

## Advanced

The following configuration is for advanced use cases and is usually not necessary. If you choose to configure the properties below, you will override any changes to the Next.js defaults in future updates.

### Device Sizes

If you know the expected device widths of your users, you can specify a list of device width breakpoints using the `deviceSizes` property in `next.config.js`. These widths are used when the `next/future/image` component uses [`sizes`](#sizes) prop to ensure the correct image is served for user's device.

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

The reason there are two separate lists is that imageSizes is only used for images which provide a [`sizes`](#sizes) prop, which indicates that the image is less than the full width of the screen. **Therefore, the sizes in imageSizes should all be smaller than the smallest size in deviceSizes.**

If no configuration is provided, the default below is used.

```js
module.exports = {
  images: {
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
}
```

### Acceptable Formats

The default [Image Optimization API](#loader) will automatically detect the browser's supported image formats via the request's `Accept` header.

If the `Accept` head matches more than one of the configured formats, the first match in the array is used. Therefore, the array order matters. If there is no match (or the source image is [animated](#animated-images)), the Image Optimization API will fallback to the original image's format.

If no configuration is provided, the default below is used.

```js
module.exports = {
  images: {
    formats: ['image/webp'],
  },
}
```

You can enable AVIF support with the following configuration.

```js
module.exports = {
  images: {
    formats: ['image/avif', 'image/webp'],
  },
}
```

> Note: AVIF generally takes 20% longer to encode but it compresses 20% smaller compared to WebP. This means that the first time an image is requested, it will typically be slower and then subsequent requests that are cached will be faster.

> Note: If you self-host with a Proxy/CDN in front of Next.js, you must configure the Proxy to forward the `Accept` header.

## Caching Behavior

The following describes the caching algorithm for the default [loader](#loader). For all other loaders, please refer to your cloud provider's documentation.

Images are optimized dynamically upon request and stored in the `<distDir>/cache/images` directory. The optimized image file will be served for subsequent requests until the expiration is reached. When a request is made that matches a cached but expired file, the expired image is served stale immediately. Then the image is optimized again in the background (also called revalidation) and saved to the cache with the new expiration date.

The cache status of an image can be determined by reading the value of the `x-nextjs-cache` response header. The possible values are the following:

- `MISS` - the path is not in the cache (occurs at most once, on the first visit)
- `STALE` - the path is in the cache but exceeded the revalidate time so it will be updated in the background
- `HIT` - the path is in the cache and has not exceeded the revalidate time

The expiration (or rather Max Age) is defined by either the [`minimumCacheTTL`](#minimum-cache-ttl) configuration or the upstream image `Cache-Control` header, whichever is larger. Specifically, the `max-age` value of the `Cache-Control` header is used. If both `s-maxage` and `max-age` are found, then `s-maxage` is preferred. The `max-age` is also passed-through to any downstream clients including CDNs and browsers.

- You can configure [`minimumCacheTTL`](#minimum-cache-ttl) to increase the cache duration when the upstream image does not include `Cache-Control` header or the value is very low.
- You can configure [`deviceSizes`](#device-sizes) and [`imageSizes`](#device-sizes) to reduce the total number of possible generated images.
- You can configure [formats](#acceptable-formats) to disable multiple formats in favor of a single image format.

### Minimum Cache TTL

You can configure the Time to Live (TTL) in seconds for cached optimized images. In many cases, it's better to use a [Static Image Import](/docs/basic-features/image-optimization.md#local-images) which will automatically hash the file contents and cache the image forever with a `Cache-Control` header of `immutable`.

```js
module.exports = {
  images: {
    minimumCacheTTL: 60,
  },
}
```

The expiration (or rather Max Age) of the optimized image is defined by either the `minimumCacheTTL` or the upstream image `Cache-Control` header, whichever is larger.

If you need to change the caching behavior per image, you can configure [`headers`](/docs/api-reference/next.config.js/headers) to set the `Cache-Control` header on the upstream image (e.g. `/some-asset.jpg`, not `/_next/image` itself).

There is no mechanism to invalidate the cache at this time, so its best to keep `minimumCacheTTL` low. Otherwise you may need to manually change the [`src`](#src) prop or delete `<distDir>/cache/images`.

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

### Dangerously Allow SVG

The default [loader](#loader) does not optimize SVG images for a few reasons. First, SVG is a vector format meaning it can be resized losslessly. Second, SVG has many of the same features as HTML/CSS, which can lead to vulnerabilities without proper [Content Security Policy (CSP) headers](/docs/advanced-features/security-headers.md).

If you need to serve SVG images with the default Image Optimization API, you can set `dangerouslyAllowSVG` and `contentSecurityPolicy` inside your `next.config.js`:

```js
module.exports = {
  images: {
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
}
```

### Animated Images

The default [loader](#loader) will automatically bypass Image Optimization for animated images and serve the image as-is.

Auto-detection for animated files is best-effort and supports GIF, APNG, and WebP. If you want to explicitly bypass Image Optimization for a given animated image, use the [unoptimized](#unoptimized) prop.

## Related

For an overview of the Image component features and usage guidelines, see:

<div class="card">
  <a href="/docs/basic-features/image-optimization.md">
    <b>Images</b>
    <small>Learn how to display and optimize images with the Image component.</small>
  </a>
</div>
