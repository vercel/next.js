# Experimental `@next/third-parties`

`@next/third-parties` is a collection of components and utilities that can be used to efficiently load third-party libraries into your Next.js application.

> Note: `@next/third-parties` is still experimental and under active development.

# Usage

## Google Third-Parties

### YouTube Embed

The `YouTubeEmbed` component is used to load and display a YouTube embed. This component loads faster by using [lite-youtube-embed](https://github.com/paulirish/lite-youtube-embed) under the hood.

```js
import { YouTubeEmbed } from '@next/third-parties/google'

export default function Page() {
  return <YouTubeEmbed videoid="ogfYd705cRs" height={400} />
}
```

### Google Maps Embed

The `GoogleMapsEmbed` component can be used to add a [Google Maps Embed](https://developers.google.com/maps/documentation/embed/get-started) to your page. By default, it uses the `loading` attribute to lazy-load below the fold.

```js
import { GoogleMapsEmbed } from '@next/third-parties/google'

export default function Page() {
  return (
    <GoogleMapsEmbed
      apiKey="XYZ"
      height={200}
      width="100%"
      mode="place"
      q="Brooklyn+Bridge,New+York,NY"
    />
  )
}
```

## Meta Third-Parties

### Meta Pixel

The `MetaPixel` component can be used to easily integrate [Meta (Facebook) Pixel](https://developers.facebook.com/docs/meta-pixel/) into your Next.js application. By default, it tracks a `PageView` event when the page loads, but you can specify other standard events as well.

```js
import { MetaPixel, sendMetaPixelEvent } from '@next/third-parties/meta'

export default function Page() {
  return <MetaPixel pixelId="YOUR_PIXEL_ID" />
}
```

#### Tracking other events

To track other standard events (like `AddToCart`), pass the `trackEvent` prop:

```js
<MetaPixel pixelId="YOUR_PIXEL_ID" trackEvent="AddToCart" />
```

You can also track events dynamically using the `sendMetaPixelEvent` helper:

```js
import { sendMetaPixelEvent } from '@next/third-parties/meta'

// For standard events
sendMetaPixelEvent('Purchase', {
  value: 29.99,
  currency: 'USD',
})

// For custom events
sendMetaPixelEvent('MyCustomEvent', {
  someParam: 'value',
})
```

The following standard events are supported:

- `PageView`
- `ViewContent`
- `Search`
- `AddToCart`
- `AddToWishlist`
- `InitiateCheckout`
- `AddPaymentInfo`
- `Purchase`
- `Lead`
- `CompleteRegistration`
- `Contact`
- `CustomizeProduct`
- `Donate`
- `FindLocation`
- `Schedule`
- `StartTrial`
- `SubmitApplication`
- `Subscribe`

For more details, see the [Meta Pixel docs](https://developers.facebook.com/docs/meta-pixel/reference#standard-events).

To get a better idea of how these components work, take a look at this [demo](https://test-next-script-housseindjirdeh.vercel.app/). <!--- TODO: Replace with a better demo page -->
