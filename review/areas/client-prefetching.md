# Client prefetching

<!-- Example area. Owners: replace the TODOs. -->

## Context

- The client segment cache (`packages/next/src/client/components/segment-cache/`) fetches and caches route data per segment, ahead of navigation
- `links.ts` and `app-dir/link.tsx` decide which links get prefetched, and when
- The server side is `server/app-render/collect-segment-data.tsx`, which produces the per-segment prefetch responses
- TODO: invariants (cache keys, staleness, what has to stay in sync between client and server)

## What failure looks like

- TODO: past regressions, with links
- Prefetching too much: request floods, wasted bandwidth
- Prefetching too little: navigations that should be instant block on the network
- Stale or mismatched data: the cache serves a segment that doesn't match the current params or search params

## Escalate when

- Changes to cache keys or how responses vary (strong)
- Changes to the prefetch request/response format shared by client and server (strong)
- Changes to scheduling or prioritization (medium)
- TODO

## Rules

- Router tests use `createRouterAct` and `LinkAccordion` to control when prefetches happen, with no polling or `retry()` around network activity. Prefer `'no-requests'` assertions when data should come from cache. (comment; see `.agents/skills/router-act/SKILL.md`)

## Preferences

- TODO
