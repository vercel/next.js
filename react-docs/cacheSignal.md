---
title: cacheSignal
---

<RSC>

`cacheSignal` is currently only used with [React Server Components](/blog/2023/03/22/react-labs-what-we-have-been-working-on-march-2023#react-server-components).

</RSC>

<Intro>

`cacheSignal` allows you to know when the `cache()` lifetime is over.

```js
const signal = cacheSignal()
```

</Intro>

<InlineToc />

---

## Reference {/_reference_/}

### `cacheSignal` {/_cachesignal_/}

Call `cacheSignal` to get an `AbortSignal`.

```js {3,7}
import { cacheSignal } from 'react'
async function Component() {
  await fetch(url, { signal: cacheSignal() })
}
```

When React has finished rendering, the `AbortSignal` will be aborted. This allows you to cancel any in-flight work that is no longer needed.
Rendering is considered finished when:

- React has successfully completed rendering
- the render was aborted
- the render has failed

#### Parameters {/_parameters_/}

This function does not accept any parameters.

#### Returns {/_returns_/}

`cacheSignal` returns an `AbortSignal` if called during rendering. Otherwise `cacheSignal()` returns `null`.

#### Caveats {/_caveats_/}

- `cacheSignal` is currently for use in [React Server Components](/reference/rsc/server-components) only. In Client Components, it will always return `null`. In the future it will also be used for Client Component when a client cache refreshes or invalidates. You should not assume it'll always be null on the client.
- If called outside of rendering, `cacheSignal` will return `null` to make it clear that the current scope isn't cached forever.

---

## Usage {/_usage_/}

### Cancel in-flight requests {/_cancel-in-flight-requests_/}

Call <CodeStep step={1}>`cacheSignal`</CodeStep> to abort in-flight requests.

```js [[1, 4, "cacheSignal()"]]
import { cache, cacheSignal } from 'react'
const dedupedFetch = cache(fetch)
async function Component() {
  await dedupedFetch(url, { signal: cacheSignal() })
}
```

<Pitfall>
You can't use `cacheSignal` to abort async work that was started outside of rendering e.g.

```js
import { cacheSignal } from 'react'
// 🚩 Pitfall: The request will not actually be aborted if the rendering of `Component` is finished.
const response = fetch(url, { signal: cacheSignal() })
async function Component() {
  await response
}
```

</Pitfall>

### Ignore errors after React has finished rendering {/_ignore-errors-after-react-has-finished-rendering_/}

If a function throws, it may be due to cancellation (e.g. <CodeStep step={1}>the Database connection</CodeStep> has been closed). You can use the <CodeStep step={2}>`aborted` property</CodeStep> to check if the error was due to cancellation or a real error. You may want to <CodeStep step={3}>ignore errors</CodeStep> that were due to cancellation.

```js [[1, 2, "./database"], [2, 8, "cacheSignal()?.aborted"], [3, 12, "return null"]]
import { cacheSignal } from 'react'
import { queryDatabase, logError } from './database'

async function getData(id) {
  try {
    return await queryDatabase(id)
  } catch (x) {
    if (!cacheSignal()?.aborted) {
      // only log if it's a real error and not due to cancellation
      logError(x)
    }
    return null
  }
}

async function Component({ id }) {
  const data = await getData(id)
  if (data === null) {
    return <div>No data available</div>
  }
  return <div>{data.name}</div>
}
```
