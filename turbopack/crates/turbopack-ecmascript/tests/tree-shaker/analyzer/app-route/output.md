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
- Write: `RouteKind`, `userland`, `routeModule`

## Item 10: Stmt 5, `VarDeclarator(0)`

```js
const { requestAsyncStorage, workAsyncStorage, serverHooks } = routeModule;

```

- Declares: `requestAsyncStorage`, `workAsyncStorage`, `serverHooks`
- Reads: `routeModule`
- Write: `requestAsyncStorage`, `workAsyncStorage`, `serverHooks`

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
        workAsyncStorage
    });
}

```

- Hoisted
- Declares: `patchFetch`
- Reads (eventual): `_patchFetch`, `serverHooks`, `workAsyncStorage`
- Write: `patchFetch`
- Write (eventual): `serverHooks`, `workAsyncStorage`

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
    Item16["export workAsyncStorage"];
    Item17;
    Item17["export serverHooks"];
    Item18;
    Item18["export originalPathname"];
    Item19;
    Item19["export patchFetch"];
    Item2 --> Item1;
    Item3 --> Item2;
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
    Item16["export workAsyncStorage"];
    Item17;
    Item17["export serverHooks"];
    Item18;
    Item18["export originalPathname"];
    Item19;
    Item19["export patchFetch"];
    Item2 --> Item1;
    Item3 --> Item2;
    Item4 --> Item3;
    Item9 --> Item5;
    Item9 --> Item6;
    Item9 --> Item8;
    Item9 --> Item4;
    Item9 -.-> Item7;
    Item10 --> Item9;
    Item14 --> Item9;
    Item15 --> Item10;
    Item16 --> Item10;
    Item17 --> Item10;
    Item18 --> Item11;
    Item19 --> Item12;
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
    Item16["export workAsyncStorage"];
    Item17;
    Item17["export serverHooks"];
    Item18;
    Item18["export originalPathname"];
    Item19;
    Item19["export patchFetch"];
    Item2 --> Item1;
    Item3 --> Item2;
    Item4 --> Item3;
    Item9 --> Item5;
    Item9 --> Item6;
    Item9 --> Item8;
    Item9 --> Item4;
    Item9 -.-> Item7;
    Item10 --> Item9;
    Item14 --> Item9;
    Item15 --> Item10;
    Item16 --> Item10;
    Item17 --> Item10;
    Item18 --> Item11;
    Item19 --> Item12;
    Item12 --> Item7;
    Item12 --> Item10;
    Item12 -.-> Item17;
    Item12 -.-> Item16;
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
    Item16["export workAsyncStorage"];
    Item17;
    Item17["export serverHooks"];
    Item18;
    Item18["export originalPathname"];
    Item19;
    Item19["export patchFetch"];
    Item2 --> Item1;
    Item3 --> Item2;
    Item4 --> Item3;
    Item9 --> Item5;
    Item9 --> Item6;
    Item9 --> Item8;
    Item9 --> Item4;
    Item9 -.-> Item7;
    Item10 --> Item9;
    Item14 --> Item9;
    Item15 --> Item10;
    Item16 --> Item10;
    Item17 --> Item10;
    Item18 --> Item11;
    Item19 --> Item12;
    Item12 --> Item7;
    Item12 --> Item10;
    Item12 -.-> Item17;
    Item12 -.-> Item16;
    Item13 --> Item9;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(ModuleEvaluation)]"];
    N1["Items: [ItemId(Export((&quot;originalPathname&quot;, #2), &quot;originalPathname&quot;))]"];
    N2["Items: [ItemId(Export((&quot;patchFetch&quot;, #2), &quot;patchFetch&quot;))]"];
    N3["Items: [ItemId(Export((&quot;requestAsyncStorage&quot;, #2), &quot;requestAsyncStorage&quot;))]"];
    N4["Items: [ItemId(Export((&quot;routeModule&quot;, #2), &quot;routeModule&quot;))]"];
    N5["Items: [ItemId(Export((&quot;serverHooks&quot;, #2), &quot;serverHooks&quot;))]"];
    N6["Items: [ItemId(Export((&quot;workAsyncStorage&quot;, #2), &quot;workAsyncStorage&quot;))]"];
    N7["Items: [ItemId(0, ImportOfModule)]"];
    N8["Items: [ItemId(0, ImportBinding(0))]"];
    N9["Items: [ItemId(1, ImportOfModule)]"];
    N10["Items: [ItemId(1, ImportBinding(0))]"];
    N11["Items: [ItemId(2, ImportOfModule)]"];
    N12["Items: [ItemId(2, ImportBinding(0))]"];
    N13["Items: [ItemId(3, ImportOfModule)]"];
    N14["Items: [ItemId(3, ImportBinding(0))]"];
    N15["Items: [ItemId(4, VarDeclarator(0))]"];
    N16["Items: [ItemId(5, VarDeclarator(0))]"];
    N17["Items: [ItemId(6, VarDeclarator(0))]"];
    N18["Items: [ItemId(7, Normal)]"];
    N9 --> N7;
    N11 --> N9;
    N13 --> N11;
    N15 --> N8;
    N15 --> N10;
    N15 --> N14;
    N15 --> N13;
    N15 -.-> N12;
    N16 --> N15;
    N4 --> N15;
    N3 --> N16;
    N6 --> N16;
    N5 --> N16;
    N1 --> N17;
    N2 --> N18;
    N18 --> N12;
    N18 --> N16;
    N18 -.-> N5;
    N18 -.-> N6;
    N0 --> N15;
```
# Entrypoints

```
{
    ModuleEvaluation: 0,
    Export(
        "patchFetch",
    ): 2,
    Export(
        "requestAsyncStorage",
    ): 3,
    Export(
        "serverHooks",
    ): 5,
    Export(
        "routeModule",
    ): 4,
    Exports: 19,
    Export(
        "workAsyncStorage",
    ): 6,
    Export(
        "originalPathname",
    ): 1,
}
```


# Modules (dev)
## Part 0
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 15
};
"module evaluation";

```
## Part 1
```js
import { a as originalPathname } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -17
};
export { originalPathname };

```
## Part 2
```js
import { b as patchFetch } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -18
};
export { patchFetch };

```
## Part 3
```js
import { c as requestAsyncStorage } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -16
};
export { requestAsyncStorage };

```
## Part 4
```js
import { d as routeModule } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -15
};
export { routeModule };

```
## Part 5
```js
import { e as serverHooks } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -16
};
export { serverHooks };

```
## Part 6
```js
import { f as workAsyncStorage } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -16
};
export { workAsyncStorage };

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
import { AppRouteRouteModule } from '../../server/future/route-modules/app-route/module.compiled';
export { AppRouteRouteModule as g } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 9
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import '../../server/future/route-kind';

```
## Part 10
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import { RouteKind } from '../../server/future/route-kind';
export { RouteKind as h } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 11
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import '../../server/lib/patch-fetch';

```
## Part 12
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import { patchFetch as _patchFetch } from '../../server/lib/patch-fetch';
export { _patchFetch as i } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 13
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import 'VAR_USERLAND';

```
## Part 14
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
import * as userland from 'VAR_USERLAND';
export { userland as j } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 15
```js
import { g as AppRouteRouteModule } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -8,
    __turbopack_original__: '../../server/future/route-modules/app-route/module.compiled'
};
import { h as RouteKind } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -10,
    __turbopack_original__: '../../server/future/route-kind'
};
import { j as userland } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14,
    __turbopack_original__: 'VAR_USERLAND'
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
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
export { routeModule as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 16
```js
import { d as routeModule } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -15
};
const { requestAsyncStorage, workAsyncStorage, serverHooks } = routeModule;
export { requestAsyncStorage as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { workAsyncStorage as f } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { serverHooks as e } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 17
```js
const originalPathname = 'VAR_ORIGINAL_PATHNAME';
export { originalPathname as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 18
```js
import { f as workAsyncStorage } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -16
};
import { i as _patchFetch } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -12,
    __turbopack_original__: '../../server/lib/patch-fetch'
};
import { e as serverHooks } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -16
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
function patchFetch() {
    return _patchFetch({
        serverHooks,
        workAsyncStorage
    });
}
export { patchFetch as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 19
```js
export { originalPathname } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export originalPathname"
};
export { patchFetch } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export patchFetch"
};
export { requestAsyncStorage } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export requestAsyncStorage"
};
export { routeModule } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export routeModule"
};
export { serverHooks } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export serverHooks"
};
export { workAsyncStorage } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export workAsyncStorage"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 15
};
"module evaluation";

```
# Entrypoints

```
{
    ModuleEvaluation: 0,
    Export(
        "patchFetch",
    ): 2,
    Export(
        "requestAsyncStorage",
    ): 3,
    Export(
        "serverHooks",
    ): 5,
    Export(
        "routeModule",
    ): 4,
    Exports: 19,
    Export(
        "workAsyncStorage",
    ): 6,
    Export(
        "originalPathname",
    ): 1,
}
```


# Modules (prod)
## Part 0
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 15
};
"module evaluation";

```
## Part 1
```js
import { a as originalPathname } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -17
};
export { originalPathname };

```
## Part 2
```js
import { b as patchFetch } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -18
};
export { patchFetch };

```
## Part 3
```js
import { c as requestAsyncStorage } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -16
};
export { requestAsyncStorage };

```
## Part 4
```js
import { d as routeModule } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -15
};
export { routeModule };

```
## Part 5
```js
import { e as serverHooks } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -16
};
export { serverHooks };

```
## Part 6
```js
import { f as workAsyncStorage } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -16
};
export { workAsyncStorage };

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
import { AppRouteRouteModule } from '../../server/future/route-modules/app-route/module.compiled';
export { AppRouteRouteModule as g } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 9
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import '../../server/future/route-kind';

```
## Part 10
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import { RouteKind } from '../../server/future/route-kind';
export { RouteKind as h } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 11
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import '../../server/lib/patch-fetch';

```
## Part 12
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import { patchFetch as _patchFetch } from '../../server/lib/patch-fetch';
export { _patchFetch as i } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 13
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import 'VAR_USERLAND';

```
## Part 14
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
import * as userland from 'VAR_USERLAND';
export { userland as j } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 15
```js
import { g as AppRouteRouteModule } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -8,
    __turbopack_original__: '../../server/future/route-modules/app-route/module.compiled'
};
import { h as RouteKind } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -10,
    __turbopack_original__: '../../server/future/route-kind'
};
import { j as userland } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14,
    __turbopack_original__: 'VAR_USERLAND'
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
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
export { routeModule as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 16
```js
import { d as routeModule } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -15
};
const { requestAsyncStorage, workAsyncStorage, serverHooks } = routeModule;
export { requestAsyncStorage as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { workAsyncStorage as f } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { serverHooks as e } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 17
```js
const originalPathname = 'VAR_ORIGINAL_PATHNAME';
export { originalPathname as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 18
```js
import { f as workAsyncStorage } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -16
};
import { i as _patchFetch } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -12,
    __turbopack_original__: '../../server/lib/patch-fetch'
};
import { e as serverHooks } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -16
};
function patchFetch() {
    return _patchFetch({
        serverHooks,
        workAsyncStorage
    });
}
export { patchFetch as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 19
```js
export { originalPathname } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export originalPathname"
};
export { patchFetch } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export patchFetch"
};
export { requestAsyncStorage } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export requestAsyncStorage"
};
export { routeModule } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export routeModule"
};
export { serverHooks } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export serverHooks"
};
export { workAsyncStorage } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export workAsyncStorage"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 15
};
"module evaluation";

```
