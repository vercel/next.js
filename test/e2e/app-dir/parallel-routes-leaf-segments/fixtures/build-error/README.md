# Build Error Scenarios

This fixture contains scenarios that **SHOULD throw `MissingDefaultParallelRouteError`** during build.

## Why These Should Error

All scenarios in this fixture have:
1. ✅ Parallel routes (slots starting with `@`)
2. ❌ **NO** `default.tsx` files for those parallel routes
3. ✅ **Child routes** that make these **non-leaf segments**

The presence of child routes means `default.tsx` files are required for the parallel slots.

---

## Scenario 1: Non-Leaf Segment with Children

**Path:** `/with-children`

```
app/with-children/
├── @header/
│   └── page.tsx              ← Has page.tsx
│   ❌ NO default.tsx!        ← Missing default.tsx
├── @sidebar/
│   └── page.tsx              ← Has page.tsx
│   ❌ NO default.tsx!        ← Missing default.tsx
├── layout.tsx                ← Uses @header and @sidebar
├── page.tsx                  ← Parent page
└── child/
    └── page.tsx              ← ⚠️ CHILD ROUTE EXISTS!
```

**Expected Error:**
```
MissingDefaultParallelRouteError:
  Missing required default.js file for parallel route at /with-children/@header
  The parallel route slot "@header" is missing a default.js file.
```

**Why it errors:**
- When navigating from `/with-children` to `/with-children/child`, the routing system needs to know what to render for the `@header` and `@sidebar` slots
- Since `/with-children/child` doesn't define these parallel routes, Next.js looks for `default.tsx` files
- No `default.tsx` files exist → ERROR!

---

## Scenario 2: Non-Leaf with Route Groups and Children

**Path:** `/with-groups-and-children`

```
app/with-groups-and-children/(dashboard)/(overview)/
├── @analytics/
│   └── page.tsx              ← Has page.tsx
│   ❌ NO default.tsx!        ← Missing default.tsx
├── @metrics/
│   └── page.tsx              ← Has page.tsx
│   ❌ NO default.tsx!        ← Missing default.tsx
├── layout.tsx                ← Uses @analytics and @metrics
├── page.tsx                  ← Parent page
└── nested/
    └── page.tsx              ← ⚠️ CHILD ROUTE EXISTS!
```

**Route Groups:** `(dashboard)` and `(overview)` don't affect the URL

**Expected Error:**
```
MissingDefaultParallelRouteError:
  Missing required default.js file for parallel route at /with-groups-and-children/(dashboard)/(overview)/@analytics
  The parallel route slot "@analytics" is missing a default.js file.
```

**Why it errors:**
- Even with route groups, the segment has a child route (`/nested`)
- The `hasChildRoutesForSegment()` helper correctly:
  1. Filters out route groups `(dashboard)` and `(overview)`
  2. Detects the `nested/page.tsx` child route
  3. Identifies this as a **non-leaf segment**
- No `default.tsx` files exist → ERROR!

---

## How to Fix These Errors

To make these scenarios build successfully, add `default.tsx` files:

### For Scenario 1:
```tsx
// app/with-children/@header/default.tsx
export default function HeaderDefault() {
  return <div>Header Fallback</div>
}

// app/with-children/@sidebar/default.tsx
export default function SidebarDefault() {
  return <div>Sidebar Fallback</div>
}
```

### For Scenario 2:
```tsx
// app/with-groups-and-children/(dashboard)/(overview)/@analytics/default.tsx
export default function AnalyticsDefault() {
  return <div>Analytics Fallback</div>
}

// app/with-groups-and-children/(dashboard)/(overview)/@metrics/default.tsx
export default function MetricsDefault() {
  return <div>Metrics Fallback</div>
}
```

---

## Contrast with `no-build-error` Fixture

The `no-build-error` fixture has similar parallel routes but:
- ❌ **NO child routes** (leaf segments)
- ✅ `default.tsx` files are **NOT required**

This fixture (build-error) has:
- ✅ **Child routes exist** (non-leaf segments)
- ❌ `default.tsx` files **ARE required** but missing → **ERROR!**
