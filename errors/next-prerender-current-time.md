---
title: Cannot access `Date.now()`, `Date()`, or `new Date()` while prerendering
---

#### Why This Error Occurred

A function is calling a `Date` API that provides the current time. The current time is not prerenderable and must be excluded. The correct solution depends on your use case. You can find more information below about possible ways to resolves this issue.

#### Possible Ways to Fix It

If you are using the current time for performance tracking consider using `performance.now()` and related APIs instead.

Before:

```jsx filename="app/page.js"
export default async function Page() {
  const start = Date.now();
  const data = await somethingSlow();
  const end = Date.now();
  console.log(`somethingSlow took ${end - start} milliseconds to complete`)
  return ...
}
```

After:

```jsx filename="app/page.js"
export default async function Page() {
  const start = performance.now();
  const data = await somethingSlow();
  const end = performance.now();
  console.log(`somethingSlow took ${end - start} milliseconds to complete`)
  return ...
}
```

If you want the current time to be reactive so it can change and update consider moving this usage to a Client Component. Note that Server Side Rendering timestamps is also problematic because hydration will fail so you must only set the time after hydration has completed using `useEffect()`.

Before:

```jsx filename="app/page.js"
export default async function Page() {
  return (
    <main>
      ...
      <Timestamp />
    </main>
  )
}

function Timestamp() {
  return 'current time: ' + new Date().toString()
}
```

After:

```jsx filename="app/client-components.js"
'use client'

import { useState, useEffect } from 'react'

export function Timestamp() {
  const [time, setTime] = useState(null)
  useEffect(() => {
    // You can determine when and how often to update
    // the time here. In this example we update it only once
    setTime(new Date().toString())
  }, [])
  if (time) {
    return 'current time: ' + time
  }
  return null
}
```

```jsx filename="app/page.js"
import { Timestamp } from './client-components'

export default async function Page() {
  return (
    <main>
      ...
      <Timestamp />
    </main>
  )
}
```

If you want to server render the current time add `await connection()` before

```jsx filename="app/page.js"
export default async function Page() {
  const currentTime = Date.now()
  if (currentTime > someTriggerDate) {
    return <SpecialBanner />
  } else {
    return <NormalBanner />
  }
}
```

After:

```jsx filename="app/page.js"
import { connection } from 'next/server'

async function BannerSkeleton() {
  ...
}

export default async function Page() {
  return <Suspense fallback={<BannerSkeleton />}>
    <DynamicBanner />
  </Suspense>
}

async function DynamicBanner() {
  await connection();
  const currentTime = Date.now();
  if (currentTime > someTriggerDate) {
    return <SpecialBanner />
  } else {
    return <NormalBanner />
  }
}
```

### Useful Links

- [`connection` function](https://nextjs.org/docs/app/api-reference/functions/connection)
- [`performance` Web API](https://developer.mozilla.org/en-US/docs/Web/API/Performance)
- [`Suspense` React API](https://react.dev/reference/react/Suspense)
