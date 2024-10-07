# Items

Count: 28

## Item 1: Stmt 0, `ImportOfModule`

```js
import React from 'react';

```

- Hoisted
- Side effects

## Item 2: Stmt 0, `ImportBinding(0)`

```js
import React from 'react';

```

- Hoisted
- Declares: `React`

## Item 3: Stmt 1, `ImportOfModule`

```js
import { DynamicServerError } from '../../client/components/hooks-server-context';

```

- Hoisted
- Side effects

## Item 4: Stmt 1, `ImportBinding(0)`

```js
import { DynamicServerError } from '../../client/components/hooks-server-context';

```

- Hoisted
- Declares: `DynamicServerError`

## Item 5: Stmt 2, `ImportOfModule`

```js
import { StaticGenBailoutError } from '../../client/components/static-generation-bailout';

```

- Hoisted
- Side effects

## Item 6: Stmt 2, `ImportBinding(0)`

```js
import { StaticGenBailoutError } from '../../client/components/static-generation-bailout';

```

- Hoisted
- Declares: `StaticGenBailoutError`

## Item 7: Stmt 3, `ImportOfModule`

```js
import { getPathname } from '../../lib/url';

```

- Hoisted
- Side effects

## Item 8: Stmt 3, `ImportBinding(0)`

```js
import { getPathname } from '../../lib/url';

```

- Hoisted
- Declares: `getPathname`

## Item 9: Stmt 4, `VarDeclarator(0)`

```js
const hasPostpone = typeof React.unstable_postpone === 'function';

```

- Side effects
- Declares: `hasPostpone`
- Reads: `React`
- Write: `React`, `hasPostpone`

## Item 10: Stmt 5, `Normal`

```js
export function createPrerenderState(isDebugSkeleton) {
    return {
        isDebugSkeleton,
        dynamicAccesses: []
    };
}

```

- Hoisted
- Declares: `createPrerenderState`
- Write: `createPrerenderState`

## Item 11: Stmt 6, `Normal`

```js
export function markCurrentScopeAsDynamic(store, expression) {
    const pathname = getPathname(store.urlPathname);
    if (store.isUnstableCacheCallback) {
        return;
    } else if (store.dynamicShouldError) {
        throw new StaticGenBailoutError(`Route ${pathname} with \`dynamic = "error"\` couldn't be rendered statically because it used \`${expression}\`. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`);
    } else if (store.prerenderState) {
        postponeWithTracking(store.prerenderState, expression, pathname);
    } else {
        store.revalidate = 0;
        if (store.isStaticGeneration) {
            const err = new DynamicServerError(`Route ${pathname} couldn't be rendered statically because it used ${expression}. See more info here: https://nextjs.org/docs/messages/dynamic-server-error`);
            store.dynamicUsageDescription = expression;
            store.dynamicUsageStack = err.stack;
            throw err;
        }
    }
}

```

- Hoisted
- Declares: `markCurrentScopeAsDynamic`
- Reads (eventual): `getPathname`, `StaticGenBailoutError`, `postponeWithTracking`, `DynamicServerError`
- Write: `markCurrentScopeAsDynamic`

## Item 12: Stmt 7, `Normal`

```js
export function trackDynamicDataAccessed(store, expression) {
    const pathname = getPathname(store.urlPathname);
    if (store.isUnstableCacheCallback) {
        throw new Error(`Route ${pathname} used "${expression}" inside a function cached with "unstable_cache(...)". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use "${expression}" outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/app/api-reference/functions/unstable_cache`);
    } else if (store.dynamicShouldError) {
        throw new StaticGenBailoutError(`Route ${pathname} with \`dynamic = "error"\` couldn't be rendered statically because it used \`${expression}\`. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`);
    } else if (store.prerenderState) {
        postponeWithTracking(store.prerenderState, expression, pathname);
    } else {
        store.revalidate = 0;
        if (store.isStaticGeneration) {
            const err = new DynamicServerError(`Route ${pathname} couldn't be rendered statically because it used ${expression}. See more info here: https://nextjs.org/docs/messages/dynamic-server-error`);
            store.dynamicUsageDescription = expression;
            store.dynamicUsageStack = err.stack;
            throw err;
        }
    }
}

```

- Hoisted
- Declares: `trackDynamicDataAccessed`
- Reads (eventual): `getPathname`, `StaticGenBailoutError`, `postponeWithTracking`, `DynamicServerError`
- Write: `trackDynamicDataAccessed`

## Item 13: Stmt 8, `Normal`

```js
export function Postpone({ reason, prerenderState, pathname }) {
    postponeWithTracking(prerenderState, reason, pathname);
}

```

- Hoisted
- Declares: `Postpone`
- Reads (eventual): `postponeWithTracking`
- Write: `Postpone`

## Item 14: Stmt 9, `Normal`

```js
export function trackDynamicFetch(store, expression) {
    if (!store.prerenderState || store.isUnstableCacheCallback) return;
    postponeWithTracking(store.prerenderState, expression, store.urlPathname);
}

```

- Hoisted
- Declares: `trackDynamicFetch`
- Reads (eventual): `postponeWithTracking`
- Write: `trackDynamicFetch`

## Item 15: Stmt 10, `Normal`

```js
function postponeWithTracking(prerenderState, expression, pathname) {
    assertPostpone();
    const reason = `Route ${pathname} needs to bail out of prerendering at this point because it used ${expression}. ` + `React throws this special object to indicate where. It should not be caught by ` + `your own try/catch. Learn more: https://nextjs.org/docs/messages/ppr-caught-error`;
    prerenderState.dynamicAccesses.push({
        stack: prerenderState.isDebugSkeleton ? new Error().stack : undefined,
        expression
    });
    React.unstable_postpone(reason);
}

```

- Hoisted
- Declares: `postponeWithTracking`
- Reads (eventual): `assertPostpone`, `React`
- Write: `postponeWithTracking`
- Write (eventual): `React`

## Item 16: Stmt 11, `Normal`

```js
export function usedDynamicAPIs(prerenderState) {
    return prerenderState.dynamicAccesses.length > 0;
}

```

- Hoisted
- Declares: `usedDynamicAPIs`
- Write: `usedDynamicAPIs`

## Item 17: Stmt 12, `Normal`

```js
export function formatDynamicAPIAccesses(prerenderState) {
    return prerenderState.dynamicAccesses.filter((access)=>typeof access.stack === 'string' && access.stack.length > 0).map(({ expression, stack })=>{
        stack = stack.split('\n').slice(4).filter((line)=>{
            if (line.includes('node_modules/next/')) {
                return false;
            }
            if (line.includes(' (<anonymous>)')) {
                return false;
            }
            if (line.includes(' (node:')) {
                return false;
            }
            return true;
        }).join('\n');
        return `Dynamic API Usage Debug - ${expression}:\n${stack}`;
    });
}

```

- Hoisted
- Declares: `formatDynamicAPIAccesses`
- Write: `formatDynamicAPIAccesses`

## Item 18: Stmt 13, `Normal`

```js
function assertPostpone() {
    if (!hasPostpone) {
        throw new Error(`Invariant: React.unstable_postpone is not defined. This suggests the wrong version of React was loaded. This is a bug in Next.js`);
    }
}

```

- Hoisted
- Declares: `assertPostpone`
- Reads (eventual): `hasPostpone`
- Write: `assertPostpone`

## Item 19: Stmt 14, `Normal`

```js
export function createPostponedAbortSignal(reason) {
    assertPostpone();
    const controller = new AbortController();
    try {
        React.unstable_postpone(reason);
    } catch (x) {
        controller.abort(x);
    }
    return controller.signal;
}

```

- Hoisted
- Declares: `createPostponedAbortSignal`
- Reads (eventual): `assertPostpone`, `React`
- Write: `createPostponedAbortSignal`
- Write (eventual): `React`

# Phase 1
```mermaid
graph TD
    Item1;
    Item5;
    Item2;
    Item6;
    Item3;
    Item7;
    Item4;
    Item8;
    Item9;
    Item10;
    Item11;
    Item12;
    Item13;
    Item14;
    Item15;
    Item16;
    Item17;
    Item18;
    Item19;
    Item20;
    Item20["ModuleEvaluation"];
    Item21;
    Item21["export createPrerenderState"];
    Item22;
    Item22["export markCurrentScopeAsDynamic"];
    Item23;
    Item23["export trackDynamicDataAccessed"];
    Item24;
    Item24["export Postpone"];
    Item25;
    Item25["export trackDynamicFetch"];
    Item26;
    Item26["export usedDynamicAPIs"];
    Item27;
    Item27["export formatDynamicAPIAccesses"];
    Item28;
    Item28["export createPostponedAbortSignal"];
    Item2 --> Item1;
    Item3 --> Item1;
    Item3 --> Item2;
    Item4 --> Item1;
    Item4 --> Item2;
    Item4 --> Item3;
```
# Phase 2
```mermaid
graph TD
    Item1;
    Item5;
    Item2;
    Item6;
    Item3;
    Item7;
    Item4;
    Item8;
    Item9;
    Item10;
    Item11;
    Item12;
    Item13;
    Item14;
    Item15;
    Item16;
    Item17;
    Item18;
    Item19;
    Item20;
    Item20["ModuleEvaluation"];
    Item21;
    Item21["export createPrerenderState"];
    Item22;
    Item22["export markCurrentScopeAsDynamic"];
    Item23;
    Item23["export trackDynamicDataAccessed"];
    Item24;
    Item24["export Postpone"];
    Item25;
    Item25["export trackDynamicFetch"];
    Item26;
    Item26["export usedDynamicAPIs"];
    Item27;
    Item27["export formatDynamicAPIAccesses"];
    Item28;
    Item28["export createPostponedAbortSignal"];
    Item2 --> Item1;
    Item3 --> Item1;
    Item3 --> Item2;
    Item4 --> Item1;
    Item4 --> Item2;
    Item4 --> Item3;
    Item9 --> Item5;
    Item9 --> Item1;
    Item9 --> Item2;
    Item9 --> Item3;
    Item9 --> Item4;
    Item9 -.-> Item8;
    Item9 -.-> Item7;
    Item9 -.-> Item15;
    Item9 -.-> Item6;
    Item9 -.-> Item18;
    Item21 --> Item10;
    Item22 --> Item11;
    Item23 --> Item12;
    Item24 --> Item13;
    Item25 --> Item14;
    Item26 --> Item16;
    Item27 --> Item17;
    Item28 --> Item19;
```
# Phase 3
```mermaid
graph TD
    Item1;
    Item5;
    Item2;
    Item6;
    Item3;
    Item7;
    Item4;
    Item8;
    Item9;
    Item10;
    Item11;
    Item12;
    Item13;
    Item14;
    Item15;
    Item16;
    Item17;
    Item18;
    Item19;
    Item20;
    Item20["ModuleEvaluation"];
    Item21;
    Item21["export createPrerenderState"];
    Item22;
    Item22["export markCurrentScopeAsDynamic"];
    Item23;
    Item23["export trackDynamicDataAccessed"];
    Item24;
    Item24["export Postpone"];
    Item25;
    Item25["export trackDynamicFetch"];
    Item26;
    Item26["export usedDynamicAPIs"];
    Item27;
    Item27["export formatDynamicAPIAccesses"];
    Item28;
    Item28["export createPostponedAbortSignal"];
    Item2 --> Item1;
    Item3 --> Item1;
    Item3 --> Item2;
    Item4 --> Item1;
    Item4 --> Item2;
    Item4 --> Item3;
    Item9 --> Item5;
    Item9 --> Item1;
    Item9 --> Item2;
    Item9 --> Item3;
    Item9 --> Item4;
    Item9 -.-> Item8;
    Item9 -.-> Item7;
    Item9 -.-> Item15;
    Item9 -.-> Item6;
    Item9 -.-> Item18;
    Item21 --> Item10;
    Item22 --> Item11;
    Item23 --> Item12;
    Item24 --> Item13;
    Item25 --> Item14;
    Item26 --> Item16;
    Item27 --> Item17;
    Item28 --> Item19;
    Item11 --> Item8;
    Item11 --> Item7;
    Item11 --> Item15;
    Item11 --> Item6;
    Item12 --> Item8;
    Item12 --> Item7;
    Item12 --> Item15;
    Item12 --> Item6;
    Item13 --> Item15;
    Item14 --> Item15;
    Item15 --> Item18;
    Item15 --> Item9;
    Item15 --> Item5;
    Item18 --> Item9;
    Item19 --> Item18;
    Item19 --> Item9;
    Item19 --> Item5;
```
# Phase 4
```mermaid
graph TD
    Item1;
    Item5;
    Item2;
    Item6;
    Item3;
    Item7;
    Item4;
    Item8;
    Item9;
    Item10;
    Item11;
    Item12;
    Item13;
    Item14;
    Item15;
    Item16;
    Item17;
    Item18;
    Item19;
    Item20;
    Item20["ModuleEvaluation"];
    Item21;
    Item21["export createPrerenderState"];
    Item22;
    Item22["export markCurrentScopeAsDynamic"];
    Item23;
    Item23["export trackDynamicDataAccessed"];
    Item24;
    Item24["export Postpone"];
    Item25;
    Item25["export trackDynamicFetch"];
    Item26;
    Item26["export usedDynamicAPIs"];
    Item27;
    Item27["export formatDynamicAPIAccesses"];
    Item28;
    Item28["export createPostponedAbortSignal"];
    Item2 --> Item1;
    Item3 --> Item1;
    Item3 --> Item2;
    Item4 --> Item1;
    Item4 --> Item2;
    Item4 --> Item3;
    Item9 --> Item5;
    Item9 --> Item1;
    Item9 --> Item2;
    Item9 --> Item3;
    Item9 --> Item4;
    Item9 -.-> Item8;
    Item9 -.-> Item7;
    Item9 -.-> Item15;
    Item9 -.-> Item6;
    Item9 -.-> Item18;
    Item21 --> Item10;
    Item22 --> Item11;
    Item23 --> Item12;
    Item24 --> Item13;
    Item25 --> Item14;
    Item26 --> Item16;
    Item27 --> Item17;
    Item28 --> Item19;
    Item11 --> Item8;
    Item11 --> Item7;
    Item11 --> Item15;
    Item11 --> Item6;
    Item12 --> Item8;
    Item12 --> Item7;
    Item12 --> Item15;
    Item12 --> Item6;
    Item13 --> Item15;
    Item14 --> Item15;
    Item15 --> Item18;
    Item15 --> Item9;
    Item15 --> Item5;
    Item18 --> Item9;
    Item19 --> Item18;
    Item19 --> Item9;
    Item19 --> Item5;
    Item20 --> Item1;
    Item20 --> Item2;
    Item20 --> Item3;
    Item20 --> Item4;
    Item20 --> Item9;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(12, Normal)]"];
    N1["Items: [ItemId(Export((&quot;formatDynamicAPIAccesses&quot;, #2), &quot;formatDynamicAPIAccesses&quot;))]"];
    N2["Items: [ItemId(11, Normal)]"];
    N3["Items: [ItemId(Export((&quot;usedDynamicAPIs&quot;, #2), &quot;usedDynamicAPIs&quot;))]"];
    N4["Items: [ItemId(5, Normal)]"];
    N5["Items: [ItemId(Export((&quot;createPrerenderState&quot;, #2), &quot;createPrerenderState&quot;))]"];
    N6["Items: [ItemId(1, ImportBinding(0))]"];
    N7["Items: [ItemId(2, ImportBinding(0))]"];
    N8["Items: [ItemId(3, ImportBinding(0))]"];
    N9["Items: [ItemId(0, ImportBinding(0))]"];
    N10["Items: [ItemId(0, ImportOfModule)]"];
    N11["Items: [ItemId(1, ImportOfModule)]"];
    N12["Items: [ItemId(2, ImportOfModule)]"];
    N13["Items: [ItemId(3, ImportOfModule)]"];
    N14["Items: [ItemId(4, VarDeclarator(0)), ItemId(10, Normal), ItemId(13, Normal)]"];
    N15["Items: [ItemId(ModuleEvaluation)]"];
    N16["Items: [ItemId(14, Normal)]"];
    N17["Items: [ItemId(Export((&quot;createPostponedAbortSignal&quot;, #2), &quot;createPostponedAbortSignal&quot;))]"];
    N18["Items: [ItemId(9, Normal)]"];
    N19["Items: [ItemId(Export((&quot;trackDynamicFetch&quot;, #2), &quot;trackDynamicFetch&quot;))]"];
    N20["Items: [ItemId(8, Normal)]"];
    N21["Items: [ItemId(Export((&quot;Postpone&quot;, #2), &quot;Postpone&quot;))]"];
    N22["Items: [ItemId(7, Normal)]"];
    N23["Items: [ItemId(Export((&quot;trackDynamicDataAccessed&quot;, #2), &quot;trackDynamicDataAccessed&quot;))]"];
    N24["Items: [ItemId(6, Normal)]"];
    N25["Items: [ItemId(Export((&quot;markCurrentScopeAsDynamic&quot;, #2), &quot;markCurrentScopeAsDynamic&quot;))]"];
    N11 --> N10;
    N12 --> N10;
    N12 --> N11;
    N13 --> N10;
    N13 --> N11;
    N13 --> N12;
    N14 --> N9;
    N14 --> N10;
    N14 --> N11;
    N14 --> N12;
    N14 --> N13;
    N14 -.-> N8;
    N14 -.-> N7;
    N14 --> N14;
    N14 -.-> N6;
    N5 --> N4;
    N25 --> N24;
    N23 --> N22;
    N21 --> N20;
    N19 --> N18;
    N3 --> N2;
    N1 --> N0;
    N17 --> N16;
    N24 --> N8;
    N24 --> N7;
    N24 --> N14;
    N24 --> N6;
    N22 --> N8;
    N22 --> N7;
    N22 --> N14;
    N22 --> N6;
    N20 --> N14;
    N18 --> N14;
    N16 --> N14;
    N16 --> N9;
    N15 --> N10;
    N15 --> N11;
    N15 --> N12;
    N15 --> N13;
    N15 --> N14;
```
# Entrypoints

```
{
    Export(
        "createPrerenderState",
    ): 5,
    ModuleEvaluation: 15,
    Export(
        "markCurrentScopeAsDynamic",
    ): 25,
    Export(
        "usedDynamicAPIs",
    ): 3,
    Export(
        "trackDynamicFetch",
    ): 19,
    Export(
        "Postpone",
    ): 21,
    Export(
        "trackDynamicDataAccessed",
    ): 23,
    Export(
        "createPostponedAbortSignal",
    ): 17,
    Export(
        "formatDynamicAPIAccesses",
    ): 1,
    Exports: 26,
}
```


# Modules (dev)
## Part 0
```js
function formatDynamicAPIAccesses(prerenderState) {
    return prerenderState.dynamicAccesses.filter((access)=>typeof access.stack === 'string' && access.stack.length > 0).map(({ expression, stack })=>{
        stack = stack.split('\n').slice(4).filter((line)=>{
            if (line.includes('node_modules/next/')) {
                return false;
            }
            if (line.includes(' (<anonymous>)')) {
                return false;
            }
            if (line.includes(' (node:')) {
                return false;
            }
            return true;
        }).join('\n');
        return `Dynamic API Usage Debug - ${expression}:\n${stack}`;
    });
}
export { formatDynamicAPIAccesses as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
import { a as formatDynamicAPIAccesses } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
export { formatDynamicAPIAccesses };

```
## Part 2
```js
function usedDynamicAPIs(prerenderState) {
    return prerenderState.dynamicAccesses.length > 0;
}
export { usedDynamicAPIs as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
import { b as usedDynamicAPIs } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -2
};
export { usedDynamicAPIs };

```
## Part 4
```js
function createPrerenderState(isDebugSkeleton) {
    return {
        isDebugSkeleton,
        dynamicAccesses: []
    };
}
export { createPrerenderState as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import { c as createPrerenderState } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -4
};
export { createPrerenderState };

```
## Part 6
```js
import { DynamicServerError } from '../../client/components/hooks-server-context';
export { DynamicServerError as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 7
```js
import { StaticGenBailoutError } from '../../client/components/static-generation-bailout';
export { StaticGenBailoutError as e } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 8
```js
import { getPathname } from '../../lib/url';
export { getPathname as f } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 9
```js
import React from 'react';
export { React as g } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 10
```js
import 'react';

```
## Part 11
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import '../../client/components/hooks-server-context';

```
## Part 12
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import '../../client/components/static-generation-bailout';

```
## Part 13
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import '../../lib/url';

```
## Part 14
```js
import { g as React } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
const hasPostpone = typeof React.unstable_postpone === 'function';
function postponeWithTracking(prerenderState, expression, pathname) {
    assertPostpone();
    const reason = `Route ${pathname} needs to bail out of prerendering at this point because it used ${expression}. ` + `React throws this special object to indicate where. It should not be caught by ` + `your own try/catch. Learn more: https://nextjs.org/docs/messages/ppr-caught-error`;
    prerenderState.dynamicAccesses.push({
        stack: prerenderState.isDebugSkeleton ? new Error().stack : undefined,
        expression
    });
    React.unstable_postpone(reason);
}
function assertPostpone() {
    if (!hasPostpone) {
        throw new Error(`Invariant: React.unstable_postpone is not defined. This suggests the wrong version of React was loaded. This is a bug in Next.js`);
    }
}
export { hasPostpone as h } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { postponeWithTracking as i } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { assertPostpone as j } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 15
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
"module evaluation";

```
## Part 16
```js
import { g as React } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -9
};
import { j as assertPostpone } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
function createPostponedAbortSignal(reason) {
    assertPostpone();
    const controller = new AbortController();
    try {
        React.unstable_postpone(reason);
    } catch (x) {
        controller.abort(x);
    }
    return controller.signal;
}
export { createPostponedAbortSignal as k } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 17
```js
import { k as createPostponedAbortSignal } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -16
};
export { createPostponedAbortSignal };

```
## Part 18
```js
import { i as postponeWithTracking } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
function trackDynamicFetch(store, expression) {
    if (!store.prerenderState || store.isUnstableCacheCallback) return;
    postponeWithTracking(store.prerenderState, expression, store.urlPathname);
}
export { trackDynamicFetch as l } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 19
```js
import { l as trackDynamicFetch } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -18
};
export { trackDynamicFetch };

```
## Part 20
```js
import { i as postponeWithTracking } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
function Postpone({ reason, prerenderState, pathname }) {
    postponeWithTracking(prerenderState, reason, pathname);
}
export { Postpone as m } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 21
```js
import { m as Postpone } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -20
};
export { Postpone };

```
## Part 22
```js
import { d as DynamicServerError } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -6
};
import { f as getPathname } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -8
};
import { e as StaticGenBailoutError } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -7
};
import { i as postponeWithTracking } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
function trackDynamicDataAccessed(store, expression) {
    const pathname = getPathname(store.urlPathname);
    if (store.isUnstableCacheCallback) {
        throw new Error(`Route ${pathname} used "${expression}" inside a function cached with "unstable_cache(...)". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use "${expression}" outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/app/api-reference/functions/unstable_cache`);
    } else if (store.dynamicShouldError) {
        throw new StaticGenBailoutError(`Route ${pathname} with \`dynamic = "error"\` couldn't be rendered statically because it used \`${expression}\`. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`);
    } else if (store.prerenderState) {
        postponeWithTracking(store.prerenderState, expression, pathname);
    } else {
        store.revalidate = 0;
        if (store.isStaticGeneration) {
            const err = new DynamicServerError(`Route ${pathname} couldn't be rendered statically because it used ${expression}. See more info here: https://nextjs.org/docs/messages/dynamic-server-error`);
            store.dynamicUsageDescription = expression;
            store.dynamicUsageStack = err.stack;
            throw err;
        }
    }
}
export { trackDynamicDataAccessed as n } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 23
```js
import { n as trackDynamicDataAccessed } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -22
};
export { trackDynamicDataAccessed };

```
## Part 24
```js
import { d as DynamicServerError } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -6
};
import { f as getPathname } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -8
};
import { e as StaticGenBailoutError } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -7
};
import { i as postponeWithTracking } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
function markCurrentScopeAsDynamic(store, expression) {
    const pathname = getPathname(store.urlPathname);
    if (store.isUnstableCacheCallback) {
        return;
    } else if (store.dynamicShouldError) {
        throw new StaticGenBailoutError(`Route ${pathname} with \`dynamic = "error"\` couldn't be rendered statically because it used \`${expression}\`. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`);
    } else if (store.prerenderState) {
        postponeWithTracking(store.prerenderState, expression, pathname);
    } else {
        store.revalidate = 0;
        if (store.isStaticGeneration) {
            const err = new DynamicServerError(`Route ${pathname} couldn't be rendered statically because it used ${expression}. See more info here: https://nextjs.org/docs/messages/dynamic-server-error`);
            store.dynamicUsageDescription = expression;
            store.dynamicUsageStack = err.stack;
            throw err;
        }
    }
}
export { markCurrentScopeAsDynamic as o } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 25
```js
import { o as markCurrentScopeAsDynamic } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -24
};
export { markCurrentScopeAsDynamic };

```
## Part 26
```js
export { formatDynamicAPIAccesses } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export formatDynamicAPIAccesses"
};
export { usedDynamicAPIs } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export usedDynamicAPIs"
};
export { createPrerenderState } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export createPrerenderState"
};
export { createPostponedAbortSignal } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export createPostponedAbortSignal"
};
export { trackDynamicFetch } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export trackDynamicFetch"
};
export { Postpone } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export Postpone"
};
export { trackDynamicDataAccessed } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export trackDynamicDataAccessed"
};
export { markCurrentScopeAsDynamic } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export markCurrentScopeAsDynamic"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
"module evaluation";

```
# Entrypoints

```
{
    Export(
        "createPrerenderState",
    ): 5,
    ModuleEvaluation: 27,
    Export(
        "markCurrentScopeAsDynamic",
    ): 26,
    Export(
        "usedDynamicAPIs",
    ): 3,
    Export(
        "trackDynamicFetch",
    ): 20,
    Export(
        "Postpone",
    ): 22,
    Export(
        "trackDynamicDataAccessed",
    ): 24,
    Export(
        "createPostponedAbortSignal",
    ): 17,
    Export(
        "formatDynamicAPIAccesses",
    ): 1,
    Exports: 28,
}
```


# Modules (prod)
## Part 0
```js
function formatDynamicAPIAccesses(prerenderState) {
    return prerenderState.dynamicAccesses.filter((access)=>typeof access.stack === 'string' && access.stack.length > 0).map(({ expression, stack })=>{
        stack = stack.split('\n').slice(4).filter((line)=>{
            if (line.includes('node_modules/next/')) {
                return false;
            }
            if (line.includes(' (<anonymous>)')) {
                return false;
            }
            if (line.includes(' (node:')) {
                return false;
            }
            return true;
        }).join('\n');
        return `Dynamic API Usage Debug - ${expression}:\n${stack}`;
    });
}
export { formatDynamicAPIAccesses as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
import { a as formatDynamicAPIAccesses } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
export { formatDynamicAPIAccesses };

```
## Part 2
```js
function usedDynamicAPIs(prerenderState) {
    return prerenderState.dynamicAccesses.length > 0;
}
export { usedDynamicAPIs as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
import { b as usedDynamicAPIs } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -2
};
export { usedDynamicAPIs };

```
## Part 4
```js
function createPrerenderState(isDebugSkeleton) {
    return {
        isDebugSkeleton,
        dynamicAccesses: []
    };
}
export { createPrerenderState as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import { c as createPrerenderState } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -4
};
export { createPrerenderState };

```
## Part 6
```js
import { DynamicServerError } from '../../client/components/hooks-server-context';
export { DynamicServerError as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 7
```js
import { StaticGenBailoutError } from '../../client/components/static-generation-bailout';
export { StaticGenBailoutError as e } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 8
```js
import { getPathname } from '../../lib/url';
export { getPathname as f } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 9
```js
import React from 'react';
export { React as g } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 10
```js
import 'react';

```
## Part 11
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import '../../client/components/hooks-server-context';

```
## Part 12
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import '../../client/components/static-generation-bailout';

```
## Part 13
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import '../../lib/url';

```
## Part 14
```js
import { g as React } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
const hasPostpone = typeof React.unstable_postpone === 'function';
export { hasPostpone as h } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 15
```js
import { h as hasPostpone } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
function assertPostpone() {
    if (!hasPostpone) {
        throw new Error(`Invariant: React.unstable_postpone is not defined. This suggests the wrong version of React was loaded. This is a bug in Next.js`);
    }
}
export { assertPostpone as i } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 16
```js
import { g as React } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -9
};
import { i as assertPostpone } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -15
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
function createPostponedAbortSignal(reason) {
    assertPostpone();
    const controller = new AbortController();
    try {
        React.unstable_postpone(reason);
    } catch (x) {
        controller.abort(x);
    }
    return controller.signal;
}
export { createPostponedAbortSignal as j } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 17
```js
import { j as createPostponedAbortSignal } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -16
};
export { createPostponedAbortSignal };

```
## Part 18
```js
import { g as React } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -9
};
import { i as assertPostpone } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -15
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
function postponeWithTracking(prerenderState, expression, pathname) {
    assertPostpone();
    const reason = `Route ${pathname} needs to bail out of prerendering at this point because it used ${expression}. ` + `React throws this special object to indicate where. It should not be caught by ` + `your own try/catch. Learn more: https://nextjs.org/docs/messages/ppr-caught-error`;
    prerenderState.dynamicAccesses.push({
        stack: prerenderState.isDebugSkeleton ? new Error().stack : undefined,
        expression
    });
    React.unstable_postpone(reason);
}
export { postponeWithTracking as k } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 19
```js
import { k as postponeWithTracking } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -18
};
function trackDynamicFetch(store, expression) {
    if (!store.prerenderState || store.isUnstableCacheCallback) return;
    postponeWithTracking(store.prerenderState, expression, store.urlPathname);
}
export { trackDynamicFetch as l } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 20
```js
import { l as trackDynamicFetch } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -19
};
export { trackDynamicFetch };

```
## Part 21
```js
import { k as postponeWithTracking } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -18
};
function Postpone({ reason, prerenderState, pathname }) {
    postponeWithTracking(prerenderState, reason, pathname);
}
export { Postpone as m } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 22
```js
import { m as Postpone } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -21
};
export { Postpone };

```
## Part 23
```js
import { d as DynamicServerError } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -6
};
import { f as getPathname } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -8
};
import { e as StaticGenBailoutError } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -7
};
import { k as postponeWithTracking } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -18
};
function trackDynamicDataAccessed(store, expression) {
    const pathname = getPathname(store.urlPathname);
    if (store.isUnstableCacheCallback) {
        throw new Error(`Route ${pathname} used "${expression}" inside a function cached with "unstable_cache(...)". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use "${expression}" outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/app/api-reference/functions/unstable_cache`);
    } else if (store.dynamicShouldError) {
        throw new StaticGenBailoutError(`Route ${pathname} with \`dynamic = "error"\` couldn't be rendered statically because it used \`${expression}\`. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`);
    } else if (store.prerenderState) {
        postponeWithTracking(store.prerenderState, expression, pathname);
    } else {
        store.revalidate = 0;
        if (store.isStaticGeneration) {
            const err = new DynamicServerError(`Route ${pathname} couldn't be rendered statically because it used ${expression}. See more info here: https://nextjs.org/docs/messages/dynamic-server-error`);
            store.dynamicUsageDescription = expression;
            store.dynamicUsageStack = err.stack;
            throw err;
        }
    }
}
export { trackDynamicDataAccessed as n } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 24
```js
import { n as trackDynamicDataAccessed } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -23
};
export { trackDynamicDataAccessed };

```
## Part 25
```js
import { d as DynamicServerError } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -6
};
import { f as getPathname } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -8
};
import { e as StaticGenBailoutError } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -7
};
import { k as postponeWithTracking } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -18
};
function markCurrentScopeAsDynamic(store, expression) {
    const pathname = getPathname(store.urlPathname);
    if (store.isUnstableCacheCallback) {
        return;
    } else if (store.dynamicShouldError) {
        throw new StaticGenBailoutError(`Route ${pathname} with \`dynamic = "error"\` couldn't be rendered statically because it used \`${expression}\`. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`);
    } else if (store.prerenderState) {
        postponeWithTracking(store.prerenderState, expression, pathname);
    } else {
        store.revalidate = 0;
        if (store.isStaticGeneration) {
            const err = new DynamicServerError(`Route ${pathname} couldn't be rendered statically because it used ${expression}. See more info here: https://nextjs.org/docs/messages/dynamic-server-error`);
            store.dynamicUsageDescription = expression;
            store.dynamicUsageStack = err.stack;
            throw err;
        }
    }
}
export { markCurrentScopeAsDynamic as o } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 26
```js
import { o as markCurrentScopeAsDynamic } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -25
};
export { markCurrentScopeAsDynamic };

```
## Part 27
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
"module evaluation";

```
## Part 28
```js
export { formatDynamicAPIAccesses } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export formatDynamicAPIAccesses"
};
export { usedDynamicAPIs } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export usedDynamicAPIs"
};
export { createPrerenderState } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export createPrerenderState"
};
export { createPostponedAbortSignal } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export createPostponedAbortSignal"
};
export { trackDynamicFetch } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export trackDynamicFetch"
};
export { Postpone } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export Postpone"
};
export { trackDynamicDataAccessed } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export trackDynamicDataAccessed"
};
export { markCurrentScopeAsDynamic } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export markCurrentScopeAsDynamic"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
"module evaluation";

```
