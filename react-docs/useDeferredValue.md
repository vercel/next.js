---
title: useDeferredValue
---

<Intro>

`useDeferredValue` is a React Hook that lets you defer updating a part of the UI.

```js
const deferredValue = useDeferredValue(value)
```

</Intro>

<InlineToc />

---

## Reference {/_reference_/}

### `useDeferredValue(value, initialValue?)` {/_usedeferredvalue_/}

Call `useDeferredValue` at the top level of your component to get a deferred version of that value.

```js
import { useState, useDeferredValue } from 'react'

function SearchPage() {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  // ...
}
```

[See more examples below.](#usage)

#### Parameters {/_parameters_/}

- `value`: The value you want to defer. It can have any type.
- **optional** `initialValue`: A value to use during the initial render of a component. If this option is omitted, `useDeferredValue` will not defer during the initial render, because there's no previous version of `value` that it can render instead.

#### Returns {/_returns_/}

- `currentValue`: During the initial render, the returned deferred value will be the `initialValue`, or the same as the value you provided. During updates, React will first attempt a re-render with the old value (so it will return the old value), and then try another re-render in the background with the new value (so it will return the updated value).

#### Caveats {/_caveats_/}

- When an update is inside a Transition, `useDeferredValue` always returns the new `value` and does not spawn a deferred render, since the update is already deferred.

- The values you pass to `useDeferredValue` should either be primitive values (like strings and numbers) or objects created outside of rendering. If you create a new object during rendering and immediately pass it to `useDeferredValue`, it will be different on every render, causing unnecessary background re-renders.

- When `useDeferredValue` receives a different value (compared with [`Object.is`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/is)), in addition to the current render (when it still uses the previous value), it schedules a re-render in the background with the new value. The background re-render is interruptible: if there's another update to the `value`, React will restart the background re-render from scratch. For example, if the user is typing into an input faster than a chart receiving its deferred value can re-render, the chart will only re-render after the user stops typing.

- `useDeferredValue` is integrated with [`<Suspense>`.](/reference/react/Suspense) If the background update caused by a new value suspends the UI, the user will not see the fallback. They will see the old deferred value until the data loads.

- `useDeferredValue` does not by itself prevent extra network requests.

- There is no fixed delay caused by `useDeferredValue` itself. As soon as React finishes the original re-render, React will immediately start working on the background re-render with the new deferred value. Any updates caused by events (like typing) will interrupt the background re-render and get prioritized over it.

- The background re-render caused by `useDeferredValue` does not fire Effects until it's committed to the screen. If the background re-render suspends, its Effects will run after the data loads and the UI updates.

---

## Usage {/_usage_/}

### Showing stale content while fresh content is loading {/_showing-stale-content-while-fresh-content-is-loading_/}

Call `useDeferredValue` at the top level of your component to defer updating some part of your UI.

```js [[1, 5, "query"], [2, 5, "deferredQuery"]]
import { useState, useDeferredValue } from 'react'

function SearchPage() {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  // ...
}
```

During the initial render, the <CodeStep step={2}>deferred value</CodeStep> will be the same as the <CodeStep step={1}>value</CodeStep> you provided.

During updates, the <CodeStep step={2}>deferred value</CodeStep> will "lag behind" the latest <CodeStep step={1}>value</CodeStep>. In particular, React will first re-render _without_ updating the deferred value, and then try to re-render with the newly received value in the background.

**Let's walk through an example to see when this is useful.**

<Note>

This example assumes you use a Suspense-enabled data source:

- Data fetching with Suspense-enabled frameworks like [Relay](https://relay.dev/docs/guided-tour/rendering/loading-states/) and [Next.js](https://nextjs.org/docs/app/getting-started/fetching-data#with-suspense)
- Lazy-loading component code with [`lazy`](/reference/react/lazy)
- Reading the value of a Promise with [`use`](/reference/react/use)

[Learn more about Suspense and its limitations.](/reference/react/Suspense)

</Note>

In this example, the `SearchResults` component [suspends](/reference/react/Suspense#displaying-a-fallback-while-content-is-loading) while fetching the search results. Try typing `"a"`, waiting for the results, and then editing it to `"ab"`. The results for `"a"` get replaced by the loading fallback.

<Sandpack>

```js src/App.js
import { Suspense, useState } from 'react'
import SearchResults from './SearchResults.js'

export default function App() {
  const [query, setQuery] = useState('')
  return (
    <>
      <label>
        Search albums:
        <input value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <Suspense fallback={<h2>Loading...</h2>}>
        <SearchResults query={query} />
      </Suspense>
    </>
  )
}
```

```js src/SearchResults.js
import { use } from 'react'
import { fetchData } from './data.js'

export default function SearchResults({ query }) {
  if (query === '') {
    return null
  }
  const albums = use(fetchData(`/search?q=${query}`))
  if (albums.length === 0) {
    return (
      <p>
        No matches for <i>"{query}"</i>
      </p>
    )
  }
  return (
    <ul>
      {albums.map((album) => (
        <li key={album.id}>
          {album.title} ({album.year})
        </li>
      ))}
    </ul>
  )
}
```

```js src/data.js hidden
// Note: the way you would do data fetching depends on
// the framework that you use together with Suspense.
// Normally, the caching logic would be inside a framework.

let cache = new Map()

export function fetchData(url) {
  if (!cache.has(url)) {
    cache.set(url, getData(url))
  }
  return cache.get(url)
}

async function getData(url) {
  if (url.startsWith('/search?q=')) {
    return await getSearchResults(url.slice('/search?q='.length))
  } else {
    throw Error('Not implemented')
  }
}

async function getSearchResults(query) {
  // Add a fake delay to make waiting noticeable.
  await new Promise((resolve) => {
    setTimeout(resolve, 1000)
  })

  const allAlbums = [
    {
      id: 13,
      title: 'Let It Be',
      year: 1970,
    },
    {
      id: 12,
      title: 'Abbey Road',
      year: 1969,
    },
    {
      id: 11,
      title: 'Yellow Submarine',
      year: 1969,
    },
    {
      id: 10,
      title: 'The Beatles',
      year: 1968,
    },
    {
      id: 9,
      title: 'Magical Mystery Tour',
      year: 1967,
    },
    {
      id: 8,
      title: "Sgt. Pepper's Lonely Hearts Club Band",
      year: 1967,
    },
    {
      id: 7,
      title: 'Revolver',
      year: 1966,
    },
    {
      id: 6,
      title: 'Rubber Soul',
      year: 1965,
    },
    {
      id: 5,
      title: 'Help!',
      year: 1965,
    },
    {
      id: 4,
      title: 'Beatles For Sale',
      year: 1964,
    },
    {
      id: 3,
      title: "A Hard Day's Night",
      year: 1964,
    },
    {
      id: 2,
      title: 'With The Beatles',
      year: 1963,
    },
    {
      id: 1,
      title: 'Please Please Me',
      year: 1963,
    },
  ]

  const lowerQuery = query.trim().toLowerCase()
  return allAlbums.filter((album) => {
    const lowerTitle = album.title.toLowerCase()
    return (
      lowerTitle.startsWith(lowerQuery) ||
      lowerTitle.indexOf(' ' + lowerQuery) !== -1
    )
  })
}
```

```css
input {
  margin: 10px;
}
```

</Sandpack>

A common alternative UI pattern is to _defer_ updating the list of results and to keep showing the previous results until the new results are ready. Call `useDeferredValue` to pass a deferred version of the query down:

```js {3,11}
export default function App() {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  return (
    <>
      <label>
        Search albums:
        <input value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <Suspense fallback={<h2>Loading...</h2>}>
        <SearchResults query={deferredQuery} />
      </Suspense>
    </>
  )
}
```

The `query` will update immediately, so the input will display the new value. However, the `deferredQuery` will keep its previous value until the data has loaded, so `SearchResults` will show the stale results for a bit.

Enter `"a"` in the example below, wait for the results to load, and then edit the input to `"ab"`. Notice how instead of the Suspense fallback, you now see the stale result list until the new results have loaded:

<Sandpack>

```js src/App.js
import { Suspense, useState, useDeferredValue } from 'react'
import SearchResults from './SearchResults.js'

export default function App() {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  return (
    <>
      <label>
        Search albums:
        <input value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <Suspense fallback={<h2>Loading...</h2>}>
        <SearchResults query={deferredQuery} />
      </Suspense>
    </>
  )
}
```

```js src/SearchResults.js
import { use } from 'react'
import { fetchData } from './data.js'

export default function SearchResults({ query }) {
  if (query === '') {
    return null
  }
  const albums = use(fetchData(`/search?q=${query}`))
  if (albums.length === 0) {
    return (
      <p>
        No matches for <i>"{query}"</i>
      </p>
    )
  }
  return (
    <ul>
      {albums.map((album) => (
        <li key={album.id}>
          {album.title} ({album.year})
        </li>
      ))}
    </ul>
  )
}
```

```js src/data.js hidden
// Note: the way you would do data fetching depends on
// the framework that you use together with Suspense.
// Normally, the caching logic would be inside a framework.

let cache = new Map()

export function fetchData(url) {
  if (!cache.has(url)) {
    cache.set(url, getData(url))
  }
  return cache.get(url)
}

async function getData(url) {
  if (url.startsWith('/search?q=')) {
    return await getSearchResults(url.slice('/search?q='.length))
  } else {
    throw Error('Not implemented')
  }
}

async function getSearchResults(query) {
  // Add a fake delay to make waiting noticeable.
  await new Promise((resolve) => {
    setTimeout(resolve, 1000)
  })

  const allAlbums = [
    {
      id: 13,
      title: 'Let It Be',
      year: 1970,
    },
    {
      id: 12,
      title: 'Abbey Road',
      year: 1969,
    },
    {
      id: 11,
      title: 'Yellow Submarine',
      year: 1969,
    },
    {
      id: 10,
      title: 'The Beatles',
      year: 1968,
    },
    {
      id: 9,
      title: 'Magical Mystery Tour',
      year: 1967,
    },
    {
      id: 8,
      title: "Sgt. Pepper's Lonely Hearts Club Band",
      year: 1967,
    },
    {
      id: 7,
      title: 'Revolver',
      year: 1966,
    },
    {
      id: 6,
      title: 'Rubber Soul',
      year: 1965,
    },
    {
      id: 5,
      title: 'Help!',
      year: 1965,
    },
    {
      id: 4,
      title: 'Beatles For Sale',
      year: 1964,
    },
    {
      id: 3,
      title: "A Hard Day's Night",
      year: 1964,
    },
    {
      id: 2,
      title: 'With The Beatles',
      year: 1963,
    },
    {
      id: 1,
      title: 'Please Please Me',
      year: 1963,
    },
  ]

  const lowerQuery = query.trim().toLowerCase()
  return allAlbums.filter((album) => {
    const lowerTitle = album.title.toLowerCase()
    return (
      lowerTitle.startsWith(lowerQuery) ||
      lowerTitle.indexOf(' ' + lowerQuery) !== -1
    )
  })
}
```

```css
input {
  margin: 10px;
}
```

</Sandpack>

<DeepDive>

#### How does deferring a value work under the hood? {/_how-does-deferring-a-value-work-under-the-hood_/}

You can think of it as happening in two steps:

1. **First, React re-renders with the new `query` (`"ab"`) but with the old `deferredQuery` (still `"a"`).** The `deferredQuery` value, which you pass to the result list, is _deferred:_ it "lags behind" the `query` value.

2. **In the background, React tries to re-render with _both_ `query` and `deferredQuery` updated to `"ab"`.** If this re-render completes, React will show it on the screen. However, if it suspends (the results for `"ab"` have not loaded yet), React will abandon this rendering attempt, and retry this re-render again after the data has loaded. The user will keep seeing the stale deferred value until the data is ready.

The deferred "background" rendering is interruptible. For example, if you type into the input again, React will abandon it and restart with the new value. React will always use the latest provided value.

Note that there is still a network request per each keystroke. What's being deferred here is displaying results (until they're ready), not the network requests themselves. Even if the user continues typing, responses for each keystroke get cached, so pressing Backspace is instant and doesn't fetch again.

</DeepDive>

---

### Indicating that the content is stale {/_indicating-that-the-content-is-stale_/}

In the example above, there is no indication that the result list for the latest query is still loading. This can be confusing to the user if the new results take a while to load. To make it more obvious to the user that the result list does not match the latest query, you can add a visual indication when the stale result list is displayed:

```js {2}
<div
  style={{
    opacity: query !== deferredQuery ? 0.5 : 1,
  }}
>
  <SearchResults query={deferredQuery} />
</div>
```

With this change, as soon as you start typing, the stale result list gets slightly dimmed until the new result list loads. You can also add a CSS transition to delay dimming so that it feels gradual, like in the example below:

<Sandpack>

```js src/App.js
import { Suspense, useState, useDeferredValue } from 'react'
import SearchResults from './SearchResults.js'

export default function App() {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const isStale = query !== deferredQuery
  return (
    <>
      <label>
        Search albums:
        <input value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <Suspense fallback={<h2>Loading...</h2>}>
        <div
          style={{
            opacity: isStale ? 0.5 : 1,
            transition: isStale
              ? 'opacity 0.2s 0.2s linear'
              : 'opacity 0s 0s linear',
          }}
        >
          <SearchResults query={deferredQuery} />
        </div>
      </Suspense>
    </>
  )
}
```

```js src/SearchResults.js
import { use } from 'react'
import { fetchData } from './data.js'

export default function SearchResults({ query }) {
  if (query === '') {
    return null
  }
  const albums = use(fetchData(`/search?q=${query}`))
  if (albums.length === 0) {
    return (
      <p>
        No matches for <i>"{query}"</i>
      </p>
    )
  }
  return (
    <ul>
      {albums.map((album) => (
        <li key={album.id}>
          {album.title} ({album.year})
        </li>
      ))}
    </ul>
  )
}
```

```js src/data.js hidden
// Note: the way you would do data fetching depends on
// the framework that you use together with Suspense.
// Normally, the caching logic would be inside a framework.

let cache = new Map()

export function fetchData(url) {
  if (!cache.has(url)) {
    cache.set(url, getData(url))
  }
  return cache.get(url)
}

async function getData(url) {
  if (url.startsWith('/search?q=')) {
    return await getSearchResults(url.slice('/search?q='.length))
  } else {
    throw Error('Not implemented')
  }
}

async function getSearchResults(query) {
  // Add a fake delay to make waiting noticeable.
  await new Promise((resolve) => {
    setTimeout(resolve, 1000)
  })

  const allAlbums = [
    {
      id: 13,
      title: 'Let It Be',
      year: 1970,
    },
    {
      id: 12,
      title: 'Abbey Road',
      year: 1969,
    },
    {
      id: 11,
      title: 'Yellow Submarine',
      year: 1969,
    },
    {
      id: 10,
      title: 'The Beatles',
      year: 1968,
    },
    {
      id: 9,
      title: 'Magical Mystery Tour',
      year: 1967,
    },
    {
      id: 8,
      title: "Sgt. Pepper's Lonely Hearts Club Band",
      year: 1967,
    },
    {
      id: 7,
      title: 'Revolver',
      year: 1966,
    },
    {
      id: 6,
      title: 'Rubber Soul',
      year: 1965,
    },
    {
      id: 5,
      title: 'Help!',
      year: 1965,
    },
    {
      id: 4,
      title: 'Beatles For Sale',
      year: 1964,
    },
    {
      id: 3,
      title: "A Hard Day's Night",
      year: 1964,
    },
    {
      id: 2,
      title: 'With The Beatles',
      year: 1963,
    },
    {
      id: 1,
      title: 'Please Please Me',
      year: 1963,
    },
  ]

  const lowerQuery = query.trim().toLowerCase()
  return allAlbums.filter((album) => {
    const lowerTitle = album.title.toLowerCase()
    return (
      lowerTitle.startsWith(lowerQuery) ||
      lowerTitle.indexOf(' ' + lowerQuery) !== -1
    )
  })
}
```

```css
input {
  margin: 10px;
}
```

</Sandpack>

---

### Deferring re-rendering for a part of the UI {/_deferring-re-rendering-for-a-part-of-the-ui_/}

You can also apply `useDeferredValue` as a performance optimization. It is useful when a part of your UI is slow to re-render, there's no easy way to optimize it, and you want to prevent it from blocking the rest of the UI.

Imagine you have a text field and a component (like a chart or a long list) that re-renders on every keystroke:

```js
function App() {
  const [text, setText] = useState('')
  return (
    <>
      <input value={text} onChange={(e) => setText(e.target.value)} />
      <SlowList text={text} />
    </>
  )
}
```

First, optimize `SlowList` to skip re-rendering when its props are the same. To do this, [wrap it in `memo`:](/reference/react/memo#skipping-re-rendering-when-props-are-unchanged)

```js {1,3}
const SlowList = memo(function SlowList({ text }) {
  // ...
})
```

However, this only helps if the `SlowList` props are _the same_ as during the previous render. The problem you're facing now is that it's slow when they're _different,_ and when you actually need to show different visual output.

Concretely, the main performance problem is that whenever you type into the input, the `SlowList` receives new props, and re-rendering its entire tree makes the typing feel janky. In this case, `useDeferredValue` lets you prioritize updating the input (which must be fast) over updating the result list (which is allowed to be slower):

```js {3,7}
function App() {
  const [text, setText] = useState('')
  const deferredText = useDeferredValue(text)
  return (
    <>
      <input value={text} onChange={(e) => setText(e.target.value)} />
      <SlowList text={deferredText} />
    </>
  )
}
```

This does not make re-rendering of the `SlowList` faster. However, it tells React that re-rendering the list can be deprioritized so that it doesn't block the keystrokes. The list will "lag behind" the input and then "catch up". Like before, React will attempt to update the list as soon as possible, but will not block the user from typing.

<Recipes titleText="The difference between useDeferredValue and unoptimized re-rendering" titleId="examples">

#### Deferred re-rendering of the list {/_deferred-re-rendering-of-the-list_/}

In this example, each item in the `SlowList` component is **artificially slowed down** so that you can see how `useDeferredValue` lets you keep the input responsive. Type into the input and notice that typing feels snappy while the list "lags behind" it.

<Sandpack>

```js
import { useState, useDeferredValue } from 'react'
import SlowList from './SlowList.js'

export default function App() {
  const [text, setText] = useState('')
  const deferredText = useDeferredValue(text)
  return (
    <>
      <input value={text} onChange={(e) => setText(e.target.value)} />
      <SlowList text={deferredText} />
    </>
  )
}
```

```js {expectedErrors: {'react-compiler': [19, 20]}} src/SlowList.js
import { memo } from 'react'

const SlowList = memo(function SlowList({ text }) {
  // Log once. The actual slowdown is inside SlowItem.
  console.log('[ARTIFICIALLY SLOW] Rendering 250 <SlowItem />')

  let items = []
  for (let i = 0; i < 250; i++) {
    items.push(<SlowItem key={i} text={text} />)
  }
  return <ul className="items">{items}</ul>
})

function SlowItem({ text }) {
  let startTime = performance.now()
  while (performance.now() - startTime < 1) {
    // Do nothing for 1 ms per item to emulate extremely slow code
  }

  return <li className="item">Text: {text}</li>
}

export default SlowList
```

```css
.items {
  padding: 0;
}

.item {
  list-style: none;
  display: block;
  height: 40px;
  padding: 5px;
  margin-top: 10px;
  border-radius: 4px;
  border: 1px solid #aaa;
}
```

</Sandpack>

<Solution />

#### Unoptimized re-rendering of the list {/_unoptimized-re-rendering-of-the-list_/}

In this example, each item in the `SlowList` component is **artificially slowed down**, but there is no `useDeferredValue`.

Notice how typing into the input feels very janky. This is because without `useDeferredValue`, each keystroke forces the entire list to re-render immediately in a non-interruptible way.

<Sandpack>

```js
import { useState } from 'react'
import SlowList from './SlowList.js'

export default function App() {
  const [text, setText] = useState('')
  return (
    <>
      <input value={text} onChange={(e) => setText(e.target.value)} />
      <SlowList text={text} />
    </>
  )
}
```

```js {expectedErrors: {'react-compiler': [19, 20]}} src/SlowList.js
import { memo } from 'react'

const SlowList = memo(function SlowList({ text }) {
  // Log once. The actual slowdown is inside SlowItem.
  console.log('[ARTIFICIALLY SLOW] Rendering 250 <SlowItem />')

  let items = []
  for (let i = 0; i < 250; i++) {
    items.push(<SlowItem key={i} text={text} />)
  }
  return <ul className="items">{items}</ul>
})

function SlowItem({ text }) {
  let startTime = performance.now()
  while (performance.now() - startTime < 1) {
    // Do nothing for 1 ms per item to emulate extremely slow code
  }

  return <li className="item">Text: {text}</li>
}

export default SlowList
```

```css
.items {
  padding: 0;
}

.item {
  list-style: none;
  display: block;
  height: 40px;
  padding: 5px;
  margin-top: 10px;
  border-radius: 4px;
  border: 1px solid #aaa;
}
```

</Sandpack>

<Solution />

</Recipes>

<Pitfall>

This optimization requires `SlowList` to be wrapped in [`memo`.](/reference/react/memo) This is because whenever the `text` changes, React needs to be able to re-render the parent component quickly. During that re-render, `deferredText` still has its previous value, so `SlowList` is able to skip re-rendering (its props have not changed). Without [`memo`,](/reference/react/memo) it would have to re-render anyway, defeating the point of the optimization.

</Pitfall>

<DeepDive>

#### How is deferring a value different from debouncing and throttling? {/_how-is-deferring-a-value-different-from-debouncing-and-throttling_/}

There are two common optimization techniques you might have used before in this scenario:

- _Debouncing_ means you'd wait for the user to stop typing (e.g. for a second) before updating the list.
- _Throttling_ means you'd update the list every once in a while (e.g. at most once a second).

While these techniques are helpful in some cases, `useDeferredValue` is better suited to optimizing rendering because it is deeply integrated with React itself and adapts to the user's device.

Unlike debouncing or throttling, it doesn't require choosing any fixed delay. If the user's device is fast (e.g. powerful laptop), the deferred re-render would happen almost immediately and wouldn't be noticeable. If the user's device is slow, the list would "lag behind" the input proportionally to how slow the device is.

Also, unlike with debouncing or throttling, deferred re-renders done by `useDeferredValue` are interruptible by default. This means that if React is in the middle of re-rendering a large list, but the user makes another keystroke, React will abandon that re-render, handle the keystroke, and then start rendering in the background again. By contrast, debouncing and throttling still produce a janky experience because they're _blocking:_ they merely postpone the moment when rendering blocks the keystroke.

If the work you're optimizing doesn't happen during rendering, debouncing and throttling are still useful. For example, they can let you fire fewer network requests. You can also use these techniques together.

</DeepDive>
