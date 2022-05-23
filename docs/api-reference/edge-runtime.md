---
description: The Next.js Edge Runtime is based on standard Web APIs. Learn more about the supported APIs available.
---

# Edge Runtime

The Next.js Edge Runtime is based on standard Web APIs, which is used by [Middleware](/docs/middleware.md).

## Runtime APIs

### Globals

- [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request)
- [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response)
- [`Blob`](https://developer.mozilla.org/en-US/docs/Web/API/Blob)

### Base64

- [`atob`](https://developer.mozilla.org/en-US/docs/Web/API/atob): Decodes a string of data which has been encoded using base-64 encoding
- [`btoa`](https://developer.mozilla.org/en-US/docs/Web/API/btoa): Creates a base-64 encoded ASCII string from a string of binary data

### Encoding

- [`TextEncoder`](https://developer.mozilla.org/en-US/docs/Web/API/TextEncoder): Takes a stream of code points as input and emits a stream of bytes (UTF8)
- [`TextDecoder`](https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder): Takes a stream of bytes as input and emit a stream of code points

### Environment

- `process.env`: Holds an object with all environment variables for both `next dev` and `next build` in the exact same way as any other page or API in Next.js

### Fetch

The [Web Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) can be used from the runtime, enabling you to use Middleware as a proxy, or connect to external storage APIs

A potential caveat to using the Fetch API in a Middleware function is latency. For example, if you have a Middleware function running a fetch request to New York, and a user accesses your site from London, the request will be resolved from the nearest Edge to the user (in this case, London), to the origin of the request, New York. There is a risk this could happen on every request, making your site slow to respond. When using the Fetch API, you _must_ make sure it does not run on every single request made.

### Streams

- [`TransformStream`](https://developer.mozilla.org/en-US/docs/Web/API/TransformStream): Consists of a pair of streams: a writable stream known as its writable side, and a readable stream, known as its readable side. Writes to the writable side, result in new data being made available for reading from the readable side. Support for web streams is quite limited at the moment, although it is more extended in the development environment
- [`ReadableStream`](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream): A readable stream of byte data
- [`WritableStream`](https://developer.mozilla.org/en-US/docs/Web/API/WritableStream): A standard abstraction for writing streaming data to a destination, known as a sink

### Timers

- [`setInterval`](https://developer.mozilla.org/en-US/docs/Web/API/setInterval): Schedules a function to execute every time a given number of milliseconds elapses
- [`clearInterval`](https://developer.mozilla.org/en-US/docs/Web/API/clearInterval): Cancels the repeated execution set using `setInterval()`
- [`setTimeout`](https://developer.mozilla.org/en-US/docs/Web/API/setTimeout): Schedules a function to execute in a given amount of time
- [`clearTimeout`](https://developer.mozilla.org/en-US/docs/Web/API/clearTimeout): Cancels the delayed execution set using `setTimeout()`

### Web

- [`Headers`](https://developer.mozilla.org/en-US/docs/Web/API/Headers): A [WHATWG](https://whatwg.org/) implementation of the headers API
- [`URL`](https://developer.mozilla.org/en-US/docs/Web/API/URL): A WHATWG implementation of the URL API.
- [`URLSearchParams`](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams): A WHATWG implementation of `URLSearchParams`

### Crypto

- [`Crypto`](https://developer.mozilla.org/en-US/docs/Web/API/Crypto): The `Crypto` interface represents basic cryptography features available in the current context
- [`crypto.randomUUID`](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID): Lets you generate a v4 UUID using a cryptographically secure random number generator
- [`crypto.getRandomValues`](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues): Lets you get cryptographically strong random values
- [`crypto.subtle`](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/subtle): A read-only property that returns a [SubtleCrypto](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto) which can then be used to perform low-level cryptographic operations

### Logging

- [`console.debug`](https://developer.mozilla.org/en-US/docs/Web/API/console/debug): Outputs a message to the console with the log level debug
- [`console.info`](https://developer.mozilla.org/en-US/docs/Web/API/console/info): Informative logging of information. You may use string substitution and additional arguments with this method
- [`console.clear`](https://developer.mozilla.org/en-US/docs/Web/API/console/clear): Clears the console
- [`console.dir`](https://developer.mozilla.org/en-US/docs/Web/API/console/dir): Displays an interactive listing of the properties of a specified JavaScript object
- [`console.count`](https://developer.mozilla.org/en-US/docs/Web/API/console/count): Log the number of times this line has been called with the given label
- [`console.time`](https://developer.mozilla.org/en-US/docs/Web/API/console/time): Starts a timer with a name specified as an input parameter

## Unsupported APIs

The Edge Runtime has some restrictions including:

- Native Node.js APIs **are not supported**. For example, you can't read or write to the filesystem
- Node Modules _can_ be used, as long as they implement ES Modules and do not use any native Node.js APIs
- Calling `require` directly is **not allowed**. Use ES Modules instead

The following JavaScript language features are disabled, and **will not work:**

- [`eval`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/eval): Evaluates JavaScript code represented as a string
- [`new Function(evalString)`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function): Creates a new function with the code provided as an argument

## Related

<div class="card">
  <a href="/docs/middleware.md">
    <b>Middleware</b>
    <small>Run code before a request is completed.</small>
  </a>
</div>

<div class="card">
  <a href="/docs/api-reference/next/server.md">
    <b>Middleware API Reference</b>
    <small>Learn more about the supported APIs for Middleware.</small>
  </a>
</div>
