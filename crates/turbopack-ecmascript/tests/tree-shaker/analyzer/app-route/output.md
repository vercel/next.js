# Items

Count: 19

## Item 1: Stmt 0, `ImportOfModule`

```js
import { AppRouteRouteModule } from '../../server/future/route-modules/app-route/module.compiled';

```

- Hoisted
- Side effects

## Item 2: Stmt 0, `ImportBinding(0)`

```js
import { AppRouteRouteModule } from '../../server/future/route-modules/app-route/module.compiled';

```

- Hoisted
- Declares: `AppRouteRouteModule`

## Item 3: Stmt 1, `ImportOfModule`

```js
import { RouteKind } from '../../server/future/route-kind';

```

- Hoisted
- Side effects

## Item 4: Stmt 1, `ImportBinding(0)`

```js
import { RouteKind } from '../../server/future/route-kind';

```

- Hoisted
- Declares: `RouteKind`

## Item 5: Stmt 2, `ImportOfModule`

```js
import { patchFetch as _patchFetch } from '../../server/lib/patch-fetch';

```

- Hoisted
- Side effects

## Item 6: Stmt 2, `ImportBinding(0)`

```js
import { patchFetch as _patchFetch } from '../../server/lib/patch-fetch';

```

- Hoisted
- Declares: `_patchFetch`

## Item 7: Stmt 3, `ImportOfModule`

```js
import * as userland from 'VAR_USERLAND';

```

- Hoisted
- Side effects

## Item 8: Stmt 3, `ImportBinding(0)`

```js
import * as userland from 'VAR_USERLAND';

```

- Hoisted
- Declares: `userland`

## Item 9: Stmt 4, `VarDeclarator(0)`

```js
const routeModule = new AppRouteRouteModule({
    definition: {
        kind: RouteKind.APP_ROUTE,
        page: 'VAR_DEFINITION_PAGE',
        pathname: 'VAR_DEFINITION_PATHNAME',
        filename: 'VAR_DEFINITION_FILENAME',
        bundlePath: 'VAR_DEFINITION_BUNDLE_PATH'
    },
    resolvedPagePath: 'VAR_RESOLVED_PAGE_PATH',
    nextConfigOutput,
    userland
});

```

- Side effects
- Declares: `routeModule`
- Reads: `AppRouteRouteModule`, `RouteKind`, `userland`
- Write: `routeModule`, `RouteKind`

## Item 10: Stmt 5, `VarDeclarator(0)`

```js
const { requestAsyncStorage, staticGenerationAsyncStorage, serverHooks } = routeModule;

```

- Declares: `requestAsyncStorage`, `staticGenerationAsyncStorage`, `serverHooks`
- Reads: `routeModule`
- Write: `requestAsyncStorage`, `staticGenerationAsyncStorage`, `serverHooks`

## Item 11: Stmt 6, `VarDeclarator(0)`

```js
const originalPathname = 'VAR_ORIGINAL_PATHNAME';

```

- Declares: `originalPathname`
- Write: `originalPathname`

## Item 12: Stmt 7, `Normal`

```js
function patchFetch() {
    return _patchFetch({
        serverHooks,
        staticGenerationAsyncStorage
    });
}

```

- Hoisted
- Declares: `patchFetch`
- Reads (eventual): `_patchFetch`, `serverHooks`, `staticGenerationAsyncStorage`
- Write: `patchFetch`

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
    Item13["ModuleEvaluation"];
    Item14;
    Item14["export routeModule"];
    Item15;
    Item15["export requestAsyncStorage"];
    Item16;
    Item16["export staticGenerationAsyncStorage"];
    Item17;
    Item17["export serverHooks"];
    Item18;
    Item18["export originalPathname"];
    Item19;
    Item19["export patchFetch"];
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
    Item13["ModuleEvaluation"];
    Item14;
    Item14["export routeModule"];
    Item15;
    Item15["export requestAsyncStorage"];
    Item16;
    Item16["export staticGenerationAsyncStorage"];
    Item17;
    Item17["export serverHooks"];
    Item18;
    Item18["export originalPathname"];
    Item19;
    Item19["export patchFetch"];
    Item2 --> Item1;
    Item3 --> Item1;
    Item3 --> Item2;
    Item4 --> Item1;
    Item4 --> Item2;
    Item4 --> Item3;
    Item9 --> Item5;
    Item9 --> Item6;
    Item9 --> Item8;
    Item9 --> Item1;
    Item9 --> Item2;
    Item9 --> Item3;
    Item9 --> Item4;
    Item9 -.-> Item7;
    Item10 --> Item9;
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
    Item13["ModuleEvaluation"];
    Item14;
    Item14["export routeModule"];
    Item15;
    Item15["export requestAsyncStorage"];
    Item16;
    Item16["export staticGenerationAsyncStorage"];
    Item17;
    Item17["export serverHooks"];
    Item18;
    Item18["export originalPathname"];
    Item19;
    Item19["export patchFetch"];
    Item2 --> Item1;
    Item3 --> Item1;
    Item3 --> Item2;
    Item4 --> Item1;
    Item4 --> Item2;
    Item4 --> Item3;
    Item9 --> Item5;
    Item9 --> Item6;
    Item9 --> Item8;
    Item9 --> Item1;
    Item9 --> Item2;
    Item9 --> Item3;
    Item9 --> Item4;
    Item9 -.-> Item7;
    Item10 --> Item9;
    Item12 --> Item7;
    Item12 --> Item10;
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
    Item13["ModuleEvaluation"];
    Item14;
    Item14["export routeModule"];
    Item15;
    Item15["export requestAsyncStorage"];
    Item16;
    Item16["export staticGenerationAsyncStorage"];
    Item17;
    Item17["export serverHooks"];
    Item18;
    Item18["export originalPathname"];
    Item19;
    Item19["export patchFetch"];
    Item2 --> Item1;
    Item3 --> Item1;
    Item3 --> Item2;
    Item4 --> Item1;
    Item4 --> Item2;
    Item4 --> Item3;
    Item9 --> Item5;
    Item9 --> Item6;
    Item9 --> Item8;
    Item9 --> Item1;
    Item9 --> Item2;
    Item9 --> Item3;
    Item9 --> Item4;
    Item9 -.-> Item7;
    Item10 --> Item9;
    Item12 --> Item7;
    Item12 --> Item10;
    Item13 --> Item1;
    Item13 --> Item2;
    Item13 --> Item3;
    Item13 --> Item4;
    Item13 --> Item9;
    Item14 --> Item9;
    Item15 --> Item10;
    Item16 --> Item10;
    Item17 --> Item10;
    Item18 --> Item11;
    Item19 --> Item12;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(ModuleEvaluation)]"];
    N1["Items: [ItemId(Export((&quot;routeModule&quot;, #2), &quot;routeModule&quot;))]"];
    N2["Items: [ItemId(Export((&quot;requestAsyncStorage&quot;, #2), &quot;requestAsyncStorage&quot;))]"];
    N3["Items: [ItemId(Export((&quot;staticGenerationAsyncStorage&quot;, #2), &quot;staticGenerationAsyncStorage&quot;))]"];
    N4["Items: [ItemId(Export((&quot;serverHooks&quot;, #2), &quot;serverHooks&quot;))]"];
    N5["Items: [ItemId(Export((&quot;originalPathname&quot;, #2), &quot;originalPathname&quot;)), ItemId(6, VarDeclarator(0))]"];
    N6["Items: [ItemId(Export((&quot;patchFetch&quot;, #2), &quot;patchFetch&quot;)), ItemId(2, ImportBinding(0)), ItemId(7, Normal)]"];
    N7["Items: [ItemId(0, ImportOfModule)]"];
    N8["Items: [ItemId(1, ImportOfModule)]"];
    N9["Items: [ItemId(2, ImportOfModule)]"];
    N10["Items: [ItemId(3, ImportOfModule)]"];
    N11["Items: [ItemId(0, ImportBinding(0)), ItemId(1, ImportBinding(0)), ItemId(2, ImportBinding(0)), ItemId(3, ImportBinding(0)), ItemId(4, VarDeclarator(0))]"];
    N12["Items: [ItemId(5, VarDeclarator(0))]"];
    N0 --> N7;
    N0 --> N8;
    N0 --> N9;
    N0 --> N10;
    N0 --> N11;
    N1 --> N11;
    N2 --> N12;
    N3 --> N12;
    N4 --> N12;
    N6 --> N11;
    N6 --> N12;
    N8 --> N7;
    N9 --> N7;
    N9 --> N8;
    N10 --> N7;
    N10 --> N8;
    N10 --> N9;
    N11 --> N7;
    N11 --> N8;
    N11 --> N9;
    N11 --> N10;
    N12 --> N11;
```
# Entrypoints

```
{
    ModuleEvaluation: 0,
    Export(
        "serverHooks",
    ): 4,
    Export(
        "requestAsyncStorage",
    ): 2,
    Export(
        "staticGenerationAsyncStorage",
    ): 3,
    Export(
        "patchFetch",
    ): 6,
    Export(
        "routeModule",
    ): 1,
    Export(
        "originalPathname",
    ): 5,
}
```


# Modules (dev)
## Part 0
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
"module evaluation";

```
## Part 1
```js
import { routeModule } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
export { routeModule as routeModule };

```
## Part 2
```js
import { requestAsyncStorage } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
export { requestAsyncStorage as requestAsyncStorage };

```
## Part 3
```js
import { staticGenerationAsyncStorage } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
export { staticGenerationAsyncStorage as staticGenerationAsyncStorage };

```
## Part 4
```js
import { serverHooks } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
export { serverHooks as serverHooks };

```
## Part 5
```js
export { originalPathname as originalPathname };
const originalPathname = 'VAR_ORIGINAL_PATHNAME';
export { originalPathname } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 6
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import { staticGenerationAsyncStorage, serverHooks } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
export { patchFetch as patchFetch };
import { patchFetch as _patchFetch } from '../../server/lib/patch-fetch';
function patchFetch() {
    return _patchFetch({
        serverHooks,
        staticGenerationAsyncStorage
    });
}
export { patchFetch } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 7
```js
import '../../server/future/route-modules/app-route/module.compiled';

```
## Part 8
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import '../../server/future/route-kind';

```
## Part 9
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import '../../server/lib/patch-fetch';

```
## Part 10
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import 'VAR_USERLAND';

```
## Part 11
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import { AppRouteRouteModule } from '../../server/future/route-modules/app-route/module.compiled';
import { RouteKind } from '../../server/future/route-kind';
import { patchFetch as _patchFetch } from '../../server/lib/patch-fetch';
import * as userland from 'VAR_USERLAND';
const routeModule = new AppRouteRouteModule({
    definition: {
        kind: RouteKind.APP_ROUTE,
        page: 'VAR_DEFINITION_PAGE',
        pathname: 'VAR_DEFINITION_PATHNAME',
        filename: 'VAR_DEFINITION_FILENAME',
        bundlePath: 'VAR_DEFINITION_BUNDLE_PATH'
    },
    resolvedPagePath: 'VAR_RESOLVED_PAGE_PATH',
    nextConfigOutput,
    userland
});
export { routeModule } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { RouteKind } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 12
```js
import { routeModule } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
const { requestAsyncStorage, staticGenerationAsyncStorage, serverHooks } = routeModule;
export { requestAsyncStorage } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { staticGenerationAsyncStorage } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { serverHooks } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
"module evaluation";

```
# Entrypoints

```
{
    ModuleEvaluation: 0,
    Export(
        "serverHooks",
    ): 4,
    Export(
        "requestAsyncStorage",
    ): 2,
    Export(
        "staticGenerationAsyncStorage",
    ): 3,
    Export(
        "patchFetch",
    ): 6,
    Export(
        "routeModule",
    ): 1,
    Export(
        "originalPathname",
    ): 5,
}
```


# Modules (prod)
## Part 0
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
"module evaluation";

```
## Part 1
```js
import { routeModule } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
export { routeModule as routeModule };

```
## Part 2
```js
import { requestAsyncStorage } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
export { requestAsyncStorage as requestAsyncStorage };

```
## Part 3
```js
import { staticGenerationAsyncStorage } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
export { staticGenerationAsyncStorage as staticGenerationAsyncStorage };

```
## Part 4
```js
import { serverHooks } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
export { serverHooks as serverHooks };

```
## Part 5
```js
export { originalPathname as originalPathname };
const originalPathname = 'VAR_ORIGINAL_PATHNAME';
export { originalPathname } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 6
```js
import { staticGenerationAsyncStorage, serverHooks } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
export { patchFetch as patchFetch };
import { patchFetch as _patchFetch } from '../../server/lib/patch-fetch';
function patchFetch() {
    return _patchFetch({
        serverHooks,
        staticGenerationAsyncStorage
    });
}
export { patchFetch } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 7
```js
import '../../server/future/route-modules/app-route/module.compiled';

```
## Part 8
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import '../../server/future/route-kind';

```
## Part 9
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import '../../server/lib/patch-fetch';

```
## Part 10
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import 'VAR_USERLAND';

```
## Part 11
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import { AppRouteRouteModule } from '../../server/future/route-modules/app-route/module.compiled';
import { RouteKind } from '../../server/future/route-kind';
import * as userland from 'VAR_USERLAND';
const routeModule = new AppRouteRouteModule({
    definition: {
        kind: RouteKind.APP_ROUTE,
        page: 'VAR_DEFINITION_PAGE',
        pathname: 'VAR_DEFINITION_PATHNAME',
        filename: 'VAR_DEFINITION_FILENAME',
        bundlePath: 'VAR_DEFINITION_BUNDLE_PATH'
    },
    resolvedPagePath: 'VAR_RESOLVED_PAGE_PATH',
    nextConfigOutput,
    userland
});
export { routeModule } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { RouteKind } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 12
```js
import { routeModule } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
const { requestAsyncStorage, staticGenerationAsyncStorage, serverHooks } = routeModule;
export { requestAsyncStorage } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { staticGenerationAsyncStorage } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { serverHooks } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
"module evaluation";

```
