# Items

Count: 20

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

- Declares: `routeModule`
- Reads: `AppRouteRouteModule`, `RouteKind`, `nextConfigOutput`, `userland`
- Write: `routeModule`

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

## Item 13: Stmt 8, `Normal`

```js
export { routeModule, requestAsyncStorage, staticGenerationAsyncStorage, serverHooks, originalPathname, patchFetch };

```

- Side effects
- Reads: `routeModule`, `requestAsyncStorage`, `staticGenerationAsyncStorage`, `serverHooks`, `originalPathname`, `patchFetch`

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
    Item14["ModuleEvaluation"];
    Item15;
    Item15["export routeModule"];
    Item16;
    Item16["export requestAsyncStorage"];
    Item17;
    Item17["export staticGenerationAsyncStorage"];
    Item18;
    Item18["export serverHooks"];
    Item19;
    Item19["export originalPathname"];
    Item20;
    Item20["export patchFetch"];
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
    Item14["ModuleEvaluation"];
    Item15;
    Item15["export routeModule"];
    Item16;
    Item16["export requestAsyncStorage"];
    Item17;
    Item17["export staticGenerationAsyncStorage"];
    Item18;
    Item18["export serverHooks"];
    Item19;
    Item19["export originalPathname"];
    Item20;
    Item20["export patchFetch"];
    Item2 --> Item1;
    Item3 --> Item1;
    Item3 --> Item2;
    Item4 --> Item1;
    Item4 --> Item2;
    Item4 --> Item3;
    Item9 --> Item5;
    Item9 --> Item6;
    Item9 --> Item8;
    Item10 --> Item9;
    Item13 --> Item9;
    Item13 --> Item10;
    Item13 --> Item11;
    Item13 --> Item12;
    Item13 --> Item1;
    Item13 --> Item2;
    Item13 --> Item3;
    Item13 --> Item4;
    Item13 -.-> Item7;
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
    Item14["ModuleEvaluation"];
    Item15;
    Item15["export routeModule"];
    Item16;
    Item16["export requestAsyncStorage"];
    Item17;
    Item17["export staticGenerationAsyncStorage"];
    Item18;
    Item18["export serverHooks"];
    Item19;
    Item19["export originalPathname"];
    Item20;
    Item20["export patchFetch"];
    Item2 --> Item1;
    Item3 --> Item1;
    Item3 --> Item2;
    Item4 --> Item1;
    Item4 --> Item2;
    Item4 --> Item3;
    Item9 --> Item5;
    Item9 --> Item6;
    Item9 --> Item8;
    Item10 --> Item9;
    Item13 --> Item9;
    Item13 --> Item10;
    Item13 --> Item11;
    Item13 --> Item12;
    Item13 --> Item1;
    Item13 --> Item2;
    Item13 --> Item3;
    Item13 --> Item4;
    Item13 -.-> Item7;
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
    Item14;
    Item14["ModuleEvaluation"];
    Item15;
    Item15["export routeModule"];
    Item16;
    Item16["export requestAsyncStorage"];
    Item17;
    Item17["export staticGenerationAsyncStorage"];
    Item18;
    Item18["export serverHooks"];
    Item19;
    Item19["export originalPathname"];
    Item20;
    Item20["export patchFetch"];
    Item2 --> Item1;
    Item3 --> Item1;
    Item3 --> Item2;
    Item4 --> Item1;
    Item4 --> Item2;
    Item4 --> Item3;
    Item9 --> Item5;
    Item9 --> Item6;
    Item9 --> Item8;
    Item10 --> Item9;
    Item13 --> Item9;
    Item13 --> Item10;
    Item13 --> Item11;
    Item13 --> Item12;
    Item13 --> Item1;
    Item13 --> Item2;
    Item13 --> Item3;
    Item13 --> Item4;
    Item13 -.-> Item7;
    Item12 --> Item7;
    Item12 --> Item10;
    Item14 --> Item1;
    Item14 --> Item2;
    Item14 --> Item3;
    Item14 --> Item4;
    Item14 --> Item13;
    Item15 --> Item9;
    Item16 --> Item10;
    Item17 --> Item10;
    Item18 --> Item10;
    Item19 --> Item11;
    Item20 --> Item12;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(ModuleEvaluation), ItemId(0, ImportOfModule), ItemId(1, ImportOfModule), ItemId(2, ImportOfModule), ItemId(2, ImportBinding(0)), ItemId(3, ImportOfModule), ItemId(8, Normal)]"];
    N1["Items: [ItemId(Export((&quot;routeModule&quot;, #2), &quot;routeModule&quot;))]"];
    N2["Items: [ItemId(Export((&quot;requestAsyncStorage&quot;, #2), &quot;requestAsyncStorage&quot;))]"];
    N3["Items: [ItemId(Export((&quot;staticGenerationAsyncStorage&quot;, #2), &quot;staticGenerationAsyncStorage&quot;))]"];
    N4["Items: [ItemId(Export((&quot;serverHooks&quot;, #2), &quot;serverHooks&quot;))]"];
    N5["Items: [ItemId(Export((&quot;originalPathname&quot;, #2), &quot;originalPathname&quot;))]"];
    N6["Items: [ItemId(Export((&quot;patchFetch&quot;, #2), &quot;patchFetch&quot;))]"];
    N7["Items: [ItemId(0, ImportBinding(0)), ItemId(1, ImportBinding(0)), ItemId(3, ImportBinding(0)), ItemId(4, VarDeclarator(0))]"];
    N8["Items: [ItemId(5, VarDeclarator(0))]"];
    N9["Items: [ItemId(6, VarDeclarator(0))]"];
    N10["Items: [ItemId(2, ImportBinding(0)), ItemId(7, Normal)]"];
    N0 --> N7;
    N0 --> N8;
    N0 --> N9;
    N0 --> N10;
    N1 --> N7;
    N2 --> N8;
    N3 --> N8;
    N4 --> N8;
    N5 --> N9;
    N6 --> N10;
    N8 --> N7;
    N10 --> N8;
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
import { routeModule } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import { requestAsyncStorage, staticGenerationAsyncStorage, serverHooks } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import { originalPathname } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import { patchFetch } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
"module evaluation";
import '../../server/future/route-modules/app-route/module.compiled';
import '../../server/future/route-kind';
import '../../server/lib/patch-fetch';
import { patchFetch as _patchFetch } from '../../server/lib/patch-fetch';
import 'VAR_USERLAND';
export { routeModule, requestAsyncStorage, staticGenerationAsyncStorage, serverHooks, originalPathname, patchFetch };

```
## Part 1
```js
import { routeModule } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
export { routeModule as routeModule };

```
## Part 2
```js
import { requestAsyncStorage } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
export { requestAsyncStorage as requestAsyncStorage };

```
## Part 3
```js
import { staticGenerationAsyncStorage } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
export { staticGenerationAsyncStorage as staticGenerationAsyncStorage };

```
## Part 4
```js
import { serverHooks } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
export { serverHooks as serverHooks };

```
## Part 5
```js
import { originalPathname } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
export { originalPathname as originalPathname };

```
## Part 6
```js
import { patchFetch } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
export { patchFetch as patchFetch };

```
## Part 7
```js
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

```
## Part 8
```js
import { routeModule } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
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
## Part 9
```js
const originalPathname = 'VAR_ORIGINAL_PATHNAME';
export { originalPathname } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 10
```js
import { staticGenerationAsyncStorage, serverHooks } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
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
## Merged (module eval)
```js
import { routeModule } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import { requestAsyncStorage, staticGenerationAsyncStorage, serverHooks } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import { originalPathname } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import { patchFetch } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import '../../server/future/route-modules/app-route/module.compiled';
import '../../server/future/route-kind';
import '../../server/lib/patch-fetch';
import { patchFetch as _patchFetch } from '../../server/lib/patch-fetch';
import 'VAR_USERLAND';
"module evaluation";
export { routeModule, requestAsyncStorage, staticGenerationAsyncStorage, serverHooks, originalPathname, patchFetch };

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
import { routeModule } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import { requestAsyncStorage, staticGenerationAsyncStorage, serverHooks } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import { originalPathname } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import { patchFetch } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
"module evaluation";
import '../../server/future/route-modules/app-route/module.compiled';
import '../../server/future/route-kind';
import '../../server/lib/patch-fetch';
import 'VAR_USERLAND';
export { routeModule, requestAsyncStorage, staticGenerationAsyncStorage, serverHooks, originalPathname, patchFetch };

```
## Part 1
```js
import { routeModule } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
export { routeModule as routeModule };

```
## Part 2
```js
import { requestAsyncStorage } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
export { requestAsyncStorage as requestAsyncStorage };

```
## Part 3
```js
import { staticGenerationAsyncStorage } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
export { staticGenerationAsyncStorage as staticGenerationAsyncStorage };

```
## Part 4
```js
import { serverHooks } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
export { serverHooks as serverHooks };

```
## Part 5
```js
import { originalPathname } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
export { originalPathname as originalPathname };

```
## Part 6
```js
import { patchFetch } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
export { patchFetch as patchFetch };

```
## Part 7
```js
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

```
## Part 8
```js
import { routeModule } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
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
## Part 9
```js
const originalPathname = 'VAR_ORIGINAL_PATHNAME';
export { originalPathname } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 10
```js
import { staticGenerationAsyncStorage, serverHooks } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
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
## Merged (module eval)
```js
import { routeModule } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import { requestAsyncStorage, staticGenerationAsyncStorage, serverHooks } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import { originalPathname } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import { patchFetch } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import '../../server/future/route-modules/app-route/module.compiled';
import '../../server/future/route-kind';
import '../../server/lib/patch-fetch';
import 'VAR_USERLAND';
"module evaluation";
export { routeModule, requestAsyncStorage, staticGenerationAsyncStorage, serverHooks, originalPathname, patchFetch };

```
