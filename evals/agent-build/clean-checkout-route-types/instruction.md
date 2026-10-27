CI fails on every fresh clone at the typecheck step, but `npm run typecheck` passes on my machine, so something about a clean checkout is different. This is the relevant part of the CI log:

```
> relay-status@0.3.0 typecheck
> tsc --noEmit

app/(marketing)/layout.tsx(5,4): error TS2304: Cannot find name 'LayoutProps'.
app/api/projects/[project]/route.ts(5,15): error TS2304: Cannot find name 'RouteContext'.
app/dashboard/layout.tsx(7,4): error TS2304: Cannot find name 'LayoutProps'.
app/dashboard/projects/[project]/page.tsx(10,4): error TS2304: Cannot find name 'PageProps'.
app/docs/[...slug]/page.tsx(8,4): error TS2304: Cannot find name 'PageProps'.
app/layout.tsx(8,50): error TS2304: Cannot find name 'LayoutProps'.
```

Make CI green from a clean clone: `npm ci`, `npm run typecheck`, then `npm run build` must pass in that order, and no generated files may be committed. Keep `tsc` running with our current strict settings, keep using the framework's generated route types instead of hand-written or loosened prop types, and fix whatever else turns out to be wrong in our code once those types are available. Every page, both dashboard slots, the docs routes, and the API route must keep working as they do today.
