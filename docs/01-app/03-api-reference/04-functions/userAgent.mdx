---
title: userAgent
description: The userAgent helper extends the Web Request API with additional properties and methods to interact with the user agent object from the request.
---

{/* The content of this doc is shared between the app and pages router. You can use the `<PagesOnly>Content</PagesOnly>` component to add content that is specific to the Pages Router. Any shared content should not be wrapped in a component. */}

The `userAgent` helper extends the [Web Request API](https://developer.mozilla.org/docs/Web/API/Request) with additional properties and methods to interact with the user agent object from the request.

```ts filename="proxy.ts" switcher
import { NextRequest, NextResponse, userAgent } from 'next/server'

export function proxy(request: NextRequest) {
  const url = request.nextUrl
  const { device } = userAgent(request)

  // device.type can be: 'mobile', 'tablet', 'console', 'smarttv',
  // 'wearable', 'embedded', or undefined (for desktop browsers)
  const viewport = device.type || 'desktop'

  url.searchParams.set('viewport', viewport)
  return NextResponse.rewrite(url)
}
```

```js filename="proxy.js" switcher
import { NextResponse, userAgent } from 'next/server'

export function proxy(request) {
  const url = request.nextUrl
  const { device } = userAgent(request)

  // device.type can be: 'mobile', 'tablet', 'console', 'smarttv',
  // 'wearable', 'embedded', or undefined (for desktop browsers)
  const viewport = device.type || 'desktop'

  url.searchParams.set('viewport', viewport)
  return NextResponse.rewrite(url)
}
```

## `isBot`

A boolean indicating whether the request comes from a known bot.

## `browser`

An object containing information about the browser used in the request.

- `name`: A string representing the browser's name, or `undefined` if not identifiable.
- `version`: A string representing the browser's version, or `undefined`.

## `device`

An object containing information about the device used in the request.

- `model`: A string representing the model of the device, or `undefined`.
- `type`: A string representing the type of the device, such as `console`, `mobile`, `tablet`, `smarttv`, `wearable`, `embedded`, or `undefined`.
- `vendor`: A string representing the vendor of the device, or `undefined`.

## `engine`

An object containing information about the browser's engine.

- `name`: A string representing the engine's name. Possible values include: `Amaya`, `Blink`, `EdgeHTML`, `Flow`, `Gecko`, `Goanna`, `iCab`, `KHTML`, `Links`, `Lynx`, `NetFront`, `NetSurf`, `Presto`, `Tasman`, `Trident`, `w3m`, `WebKit` or `undefined`.
- `version`: A string representing the engine's version, or `undefined`.

## `os`

An object containing information about the operating system.

- `name`: A string representing the name of the OS, or `undefined`.
- `version`: A string representing the version of the OS, or `undefined`.

## `cpu`

An object containing information about the CPU architecture.

- `architecture`: A string representing the architecture of the CPU. Possible values include: `68k`, `amd64`, `arm`, `arm64`, `armhf`, `avr`, `ia32`, `ia64`, `irix`, `irix64`, `mips`, `mips64`, `pa-risc`, `ppc`, `sparc`, `sparc64` or `undefined`
