# Optimization decisions

Read this after the stage-contract RED is trustworthy. This reference adds the
optimizer's selection and cost decisions.

## 1. Choose a valid target

A useful target:

1. reveals meaningfully more UI than the App Shell;
2. can be identified as committed UI in the exact-link test;
3. has a freshness policy that makes it prefetchable.

The primary candidates depend on `params`, `searchParams`, or the full URL.
Examples are a product title/price for one slug or results for one query. A
session-backed exception is also possible when the exact default/full-link
differential proves additional UI.

Do not target static content already in the App Shell, uncached real-time
content that must run after every click, or an environment-dependent empty
state. [`use cache: private`](https://nextjs.org/docs/app/api-reference/directives/use-cache-private)
currently requires `stale` of at least 30 seconds for runtime prefetching.
Verify the app's installed-version docs before changing a lifetime.

See: [Optimizing prefetching](https://nextjs.org/docs/app/guides/optimizing-prefetching).

## 2. Bounded links: use full prefetch

For a bounded set of high-intent links, `prefetch={true}` requests the App Shell plus the
per-link data and cached content the runtime render can reach.

Make no local wrapper when the prop expresses the policy. The
optimizer's additional job is to prove the exact link's UI and confirm the
bounded count justifies the possible server render per link.

See: [`Link` `prefetch`](https://nextjs.org/docs/app/api-reference/components/link#prefetch)
and [optimizing prefetching](https://nextjs.org/docs/app/guides/optimizing-prefetching).

## 3. High-cardinality links: upgrade on intent

See:

- [Hover-triggered prefetch](https://nextjs.org/docs/app/guides/prefetching#hover-triggered-prefetch)
- [`Link` `prefetch`](https://nextjs.org/docs/app/api-reference/components/link#prefetch)
- [Per-link prefetching trade-offs](https://nextjs.org/docs/app/guides/optimizing-prefetching#trade-offs)

The hover pattern restores the default policy with `null`. For full runtime
prefetch on intent, preserve the Partial Prefetching App Shell with `null`, then
upgrade the interacted link to `true`:

```tsx
'use client'

import Link from 'next/link'
import { useState } from 'react'

export function IntentPrefetchLink({ href, children }: Props) {
  const [intent, setIntent] = useState(false)

  return (
    <Link
      href={href}
      prefetch={intent ? true : null}
      onMouseEnter={() => setIntent(true)}
      onFocus={() => setIntent(true)}
    >
      {children}
    </Link>
  )
}
```

Preserve existing handlers and accessibility behavior in a real wrapper. The
state is cumulative: every distinct link hovered or focused can issue a full
prefetch during the session. Budget distinct intent-triggered links, not only
links active at the same moment. Keyboard users exercise the focus path; touch
users normally receive the App Shell because they have no pre-click hover
signal. Add a touch trigger only when the product deliberately accepts its
smaller lead time and extra requests.

## 4. Cache and session decisions

For URL-dependent work, resolve the runtime value outside cached work and pass
it in. Suspense bounds what the prefetch can commit.
Select `cacheLife` from the app's real freshness and invalidation contract;
never invent a lifetime to make the test green.

For session data, use extract-and-pass or `use cache: private` as appropriate.
Verify authorization and cache isolation under
`next start`; a passing build is not enough.

If a route has no URL-dependent region, prefer growing or correcting its
per-session App Shell. Keep session-backed UI in this optimizer only when the
exact default/full-link differential proves more UI and the user accepts the
cost.

See: [Optimizing prefetching](https://nextjs.org/docs/app/guides/optimizing-prefetching)
and [`use cache: private`](https://nextjs.org/docs/app/guides/optimizing-prefetching#use-cache-private).

## 5. Use documented stage boundaries

When the selected contract needs an explicit stage, follow the installed
version's [`unstable_prefetch()`](https://nextjs.org/docs/app/api-reference/functions/unstable_prefetch)
or [`unstable_navigation()`](https://nextjs.org/docs/app/api-reference/functions/unstable_navigation)
API reference. If the matching reference is unavailable, do not introduce the
API or infer its behavior from this skill. Keep the `instant()` assertions as
the product contract until the framework documentation lands.

## 6. Know when to stop

Leave the default link alone when the full strategy reaches the same Suspense
fallback as the App Shell. The change would add server work without adding UI.
Likewise, skip rare links and targets whose expected compute time is longer
than the user's likely hover-to-click interval.

Use automatic prefetching with no prop as the link-policy baseline. Do not add
`prefetch={false}` to make the target disappear under test.

The strongest successful differential is:

```text
automatic (no prop):  shell visible, target absent
prefetch={true}:      shell visible, target visible
```
