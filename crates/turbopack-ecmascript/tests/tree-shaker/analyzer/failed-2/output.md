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

- Declares: `hasPostpone`
- Reads: `React`
- Write: `hasPostpone`, `React`

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
    Item18 --> Item9;
    Item19 --> Item18;
    Item19 --> Item9;
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
    Item18 --> Item9;
    Item19 --> Item18;
    Item19 --> Item9;
    Item20 --> Item1;
    Item20 --> Item2;
    Item20 --> Item3;
    Item20 --> Item4;
    Item21 --> Item10;
    Item22 --> Item11;
    Item23 --> Item12;
    Item24 --> Item13;
    Item25 --> Item14;
    Item26 --> Item16;
    Item27 --> Item17;
    Item28 --> Item19;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(ModuleEvaluation), ItemId(0, ImportOfModule), ItemId(1, ImportOfModule), ItemId(2, ImportOfModule), ItemId(3, ImportOfModule)]"];
    N1["Items: [ItemId(Export((&quot;createPrerenderState&quot;, #2), &quot;createPrerenderState&quot;)), ItemId(5, Normal)]"];
    N2["Items: [ItemId(Export((&quot;markCurrentScopeAsDynamic&quot;, #2), &quot;markCurrentScopeAsDynamic&quot;)), ItemId(1, ImportBinding(0)), ItemId(2, ImportBinding(0)), ItemId(3, ImportBinding(0)), ItemId(6, Normal)]"];
    N3["Items: [ItemId(Export((&quot;trackDynamicDataAccessed&quot;, #2), &quot;trackDynamicDataAccessed&quot;)), ItemId(1, ImportBinding(0)), ItemId(2, ImportBinding(0)), ItemId(3, ImportBinding(0)), ItemId(7, Normal)]"];
    N4["Items: [ItemId(Export((&quot;Postpone&quot;, #2), &quot;Postpone&quot;)), ItemId(8, Normal)]"];
    N5["Items: [ItemId(Export((&quot;trackDynamicFetch&quot;, #2), &quot;trackDynamicFetch&quot;)), ItemId(9, Normal)]"];
    N6["Items: [ItemId(Export((&quot;usedDynamicAPIs&quot;, #2), &quot;usedDynamicAPIs&quot;)), ItemId(11, Normal)]"];
    N7["Items: [ItemId(Export((&quot;formatDynamicAPIAccesses&quot;, #2), &quot;formatDynamicAPIAccesses&quot;)), ItemId(12, Normal)]"];
    N8["Items: [ItemId(Export((&quot;createPostponedAbortSignal&quot;, #2), &quot;createPostponedAbortSignal&quot;)), ItemId(14, Normal)]"];
    N9["Items: [ItemId(0, ImportBinding(0)), ItemId(4, VarDeclarator(0))]"];
    N10["Items: [ItemId(10, Normal)]"];
    N11["Items: [ItemId(13, Normal)]"];
    N2 --> N3;
    N2 --> N10;
    N3 --> N10;
    N4 --> N10;
    N5 --> N10;
    N8 --> N11;
    N8 --> N9;
    N10 --> N11;
    N10 --> N9;
    N11 --> N9;
```
# Entrypoints

```
{
    ModuleEvaluation: 0,
    Export(
        "createPrerenderState",
    ): 1,
    Export(
        "markCurrentScopeAsDynamic",
    ): 2,
    Export(
        "usedDynamicAPIs",
    ): 6,
    Export(
        "trackDynamicDataAccessed",
    ): 3,
    Export(
        "Postpone",
    ): 4,
    Export(
        "trackDynamicFetch",
    ): 5,
    Export(
        "createPostponedAbortSignal",
    ): 8,
    Export(
        "formatDynamicAPIAccesses",
    ): 7,
}
```


# Modules (dev)
## Part 0
```js
"module evaluation";
import 'react';
import '../../client/components/hooks-server-context';
import '../../client/components/static-generation-bailout';
import '../../lib/url';

```
## Part 1
```js
export { createPrerenderState };
function createPrerenderState(isDebugSkeleton) {
    return {
        isDebugSkeleton,
        dynamicAccesses: []
    };
}
export { createPrerenderState } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import { postponeWithTracking } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
export { markCurrentScopeAsDynamic };
import { DynamicServerError } from '../../client/components/hooks-server-context';
import { StaticGenBailoutError } from '../../client/components/static-generation-bailout';
import { getPathname } from '../../lib/url';
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
export { markCurrentScopeAsDynamic } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
import { postponeWithTracking } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
export { trackDynamicDataAccessed };
import { DynamicServerError } from '../../client/components/hooks-server-context';
import { StaticGenBailoutError } from '../../client/components/static-generation-bailout';
import { getPathname } from '../../lib/url';
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
export { trackDynamicDataAccessed } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
import { postponeWithTracking } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
export { Postpone };
function Postpone({ reason, prerenderState, pathname }) {
    postponeWithTracking(prerenderState, reason, pathname);
}
export { Postpone } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import { postponeWithTracking } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
export { trackDynamicFetch };
function trackDynamicFetch(store, expression) {
    if (!store.prerenderState || store.isUnstableCacheCallback) return;
    postponeWithTracking(store.prerenderState, expression, store.urlPathname);
}
export { trackDynamicFetch } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 6
```js
export { usedDynamicAPIs };
function usedDynamicAPIs(prerenderState) {
    return prerenderState.dynamicAccesses.length > 0;
}
export { usedDynamicAPIs } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 7
```js
export { formatDynamicAPIAccesses };
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
export { formatDynamicAPIAccesses } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 8
```js
import { assertPostpone } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import { React } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
export { createPostponedAbortSignal };
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
export { createPostponedAbortSignal } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 9
```js
import React from 'react';
const hasPostpone = typeof React.unstable_postpone === 'function';
export { hasPostpone } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { React } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 10
```js
import { assertPostpone } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import { React } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
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
export { postponeWithTracking } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 11
```js
import { hasPostpone } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
function assertPostpone() {
    if (!hasPostpone) {
        throw new Error(`Invariant: React.unstable_postpone is not defined. This suggests the wrong version of React was loaded. This is a bug in Next.js`);
    }
}
export { assertPostpone } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Merged (module eval)
```js
import 'react';
import '../../client/components/hooks-server-context';
import '../../client/components/static-generation-bailout';
import '../../lib/url';
"module evaluation";

```
# Entrypoints

```
{
    ModuleEvaluation: 0,
    Export(
        "createPrerenderState",
    ): 1,
    Export(
        "markCurrentScopeAsDynamic",
    ): 2,
    Export(
        "usedDynamicAPIs",
    ): 6,
    Export(
        "trackDynamicDataAccessed",
    ): 3,
    Export(
        "Postpone",
    ): 4,
    Export(
        "trackDynamicFetch",
    ): 5,
    Export(
        "createPostponedAbortSignal",
    ): 8,
    Export(
        "formatDynamicAPIAccesses",
    ): 7,
}
```


# Modules (prod)
## Part 0
```js
"module evaluation";
import 'react';
import '../../client/components/hooks-server-context';
import '../../client/components/static-generation-bailout';
import '../../lib/url';

```
## Part 1
```js
export { createPrerenderState };
function createPrerenderState(isDebugSkeleton) {
    return {
        isDebugSkeleton,
        dynamicAccesses: []
    };
}
export { createPrerenderState } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import { postponeWithTracking } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
export { markCurrentScopeAsDynamic };
import { DynamicServerError } from '../../client/components/hooks-server-context';
import { StaticGenBailoutError } from '../../client/components/static-generation-bailout';
import { getPathname } from '../../lib/url';
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
export { markCurrentScopeAsDynamic } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
import { postponeWithTracking } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
export { trackDynamicDataAccessed };
import { DynamicServerError } from '../../client/components/hooks-server-context';
import { StaticGenBailoutError } from '../../client/components/static-generation-bailout';
import { getPathname } from '../../lib/url';
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
export { trackDynamicDataAccessed } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
import { postponeWithTracking } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
export { Postpone };
function Postpone({ reason, prerenderState, pathname }) {
    postponeWithTracking(prerenderState, reason, pathname);
}
export { Postpone } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import { postponeWithTracking } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
export { trackDynamicFetch };
function trackDynamicFetch(store, expression) {
    if (!store.prerenderState || store.isUnstableCacheCallback) return;
    postponeWithTracking(store.prerenderState, expression, store.urlPathname);
}
export { trackDynamicFetch } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 6
```js
export { usedDynamicAPIs };
function usedDynamicAPIs(prerenderState) {
    return prerenderState.dynamicAccesses.length > 0;
}
export { usedDynamicAPIs } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 7
```js
export { formatDynamicAPIAccesses };
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
export { formatDynamicAPIAccesses } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 8
```js
import { assertPostpone } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import { React } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
export { createPostponedAbortSignal };
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
export { createPostponedAbortSignal } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 9
```js
import React from 'react';
const hasPostpone = typeof React.unstable_postpone === 'function';
export { hasPostpone } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { React } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 10
```js
import { assertPostpone } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import { React } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
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
export { postponeWithTracking } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 11
```js
import { hasPostpone } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
function assertPostpone() {
    if (!hasPostpone) {
        throw new Error(`Invariant: React.unstable_postpone is not defined. This suggests the wrong version of React was loaded. This is a bug in Next.js`);
    }
}
export { assertPostpone } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Merged (module eval)
```js
import 'react';
import '../../client/components/hooks-server-context';
import '../../client/components/static-generation-bailout';
import '../../lib/url';
"module evaluation";

```
