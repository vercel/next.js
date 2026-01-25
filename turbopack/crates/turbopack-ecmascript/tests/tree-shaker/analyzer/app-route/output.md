# Items

Count: 18

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
    Item13["export routeModule"];
    Item14;
    Item14["export requestAsyncStorage"];
    Item15;
    Item15["export workAsyncStorage"];
    Item16;
    Item16["export serverHooks"];
    Item17;
    Item17["export originalPathname"];
    Item18;
    Item18["export patchFetch"];
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
    Item13["export routeModule"];
    Item14;
    Item14["export requestAsyncStorage"];
    Item15;
    Item15["export workAsyncStorage"];
    Item16;
    Item16["export serverHooks"];
    Item17;
    Item17["export originalPathname"];
    Item18;
    Item18["export patchFetch"];
    Item2 --> Item1;
    Item3 --> Item2;
    Item4 --> Item3;
    Item9 --> Item5;
    Item9 --> Item6;
    Item9 --> Item8;
    Item9 --> Item4;
    Item9 -.-> Item7;
    Item10 --> Item9;
    Item13 --> Item9;
    Item14 --> Item10;
    Item15 --> Item10;
    Item16 --> Item10;
    Item17 --> Item11;
    Item18 --> Item12;
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
    Item13["export routeModule"];
    Item14;
    Item14["export requestAsyncStorage"];
    Item15;
    Item15["export workAsyncStorage"];
    Item16;
    Item16["export serverHooks"];
    Item17;
    Item17["export originalPathname"];
    Item18;
    Item18["export patchFetch"];
    Item2 --> Item1;
    Item3 --> Item2;
    Item4 --> Item3;
    Item9 --> Item5;
    Item9 --> Item6;
    Item9 --> Item8;
    Item9 --> Item4;
    Item9 -.-> Item7;
    Item10 --> Item9;
    Item13 --> Item9;
    Item14 --> Item10;
    Item15 --> Item10;
    Item16 --> Item10;
    Item17 --> Item11;
    Item18 --> Item12;
    Item12 --> Item7;
    Item12 --> Item10;
    Item12 -.-> Item16;
    Item12 -.-> Item15;
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
    Item13["export routeModule"];
    Item14;
    Item14["export requestAsyncStorage"];
    Item15;
    Item15["export workAsyncStorage"];
    Item16;
    Item16["export serverHooks"];
    Item17;
    Item17["export originalPathname"];
    Item18;
    Item18["export patchFetch"];
    Item2 --> Item1;
    Item3 --> Item2;
    Item4 --> Item3;
    Item9 --> Item5;
    Item9 --> Item6;
    Item9 --> Item8;
    Item9 --> Item4;
    Item9 -.-> Item7;
    Item10 --> Item9;
    Item13 --> Item9;
    Item14 --> Item10;
    Item15 --> Item10;
    Item16 --> Item10;
    Item17 --> Item11;
    Item18 --> Item12;
    Item12 --> Item7;
    Item12 --> Item10;
    Item12 -.-> Item16;
    Item12 -.-> Item15;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(0, ImportOfModule)]"];
    N1["Items: [ItemId(0, ImportBinding(0))]"];
    N2["Items: [ItemId(1, ImportOfModule)]"];
    N3["Items: [ItemId(1, ImportBinding(0))]"];
    N4["Items: [ItemId(2, ImportOfModule)]"];
    N5["Items: [ItemId(2, ImportBinding(0))]"];
    N6["Items: [ItemId(3, ImportOfModule)]"];
    N7["Items: [ItemId(3, ImportBinding(0))]"];
    N8["Items: [ItemId(4, VarDeclarator(0))]"];
    N9["Items: [ItemId(5, VarDeclarator(0))]"];
    N10["Items: [ItemId(6, VarDeclarator(0)), ItemId(Export((&quot;originalPathname&quot;, #2), &quot;originalPathname&quot;))]"];
    N11["Items: [ItemId(7, Normal), ItemId(Export((&quot;patchFetch&quot;, #2), &quot;patchFetch&quot;)), ItemId(Export((&quot;serverHooks&quot;, #2), &quot;serverHooks&quot;)), ItemId(Export((&quot;workAsyncStorage&quot;, #2), &quot;workAsyncStorage&quot;))]"];
    N12["Items: [ItemId(Export((&quot;requestAsyncStorage&quot;, #2), &quot;requestAsyncStorage&quot;))]"];
    N13["Items: [ItemId(Export((&quot;routeModule&quot;, #2), &quot;routeModule&quot;))]"];
    N2 --> N0;
    N4 --> N2;
    N6 --> N4;
    N8 --> N1;
    N8 --> N3;
    N8 --> N7;
    N8 --> N6;
    N8 -.-> N5;
    N9 --> N8;
    N13 --> N8;
    N12 --> N9;
    N5 --> N4;
    N1 --> N0;
    N11 --> N9;
    N7 --> N6;
    N3 --> N2;
    N11 --> N5;
```
# Entrypoints

```
{
    ModuleEvaluation: 8,
    Export(
        "originalPathname",
    ): 10,
    Export(
        "patchFetch",
    ): 11,
    Export(
        "requestAsyncStorage",
    ): 12,
    Export(
        "routeModule",
    ): 13,
    Export(
        "serverHooks",
    ): 11,
    Export(
        "workAsyncStorage",
    ): 11,
    Exports: 14,
}
```


# Modules (dev)
## Part 0
```js
import '../../server/future/route-modules/app-route/module.compiled';

```
## Part 1
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};

```
## Part 2
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import '../../server/future/route-kind';

```
## Part 3
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};

```
## Part 4
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import '../../server/lib/patch-fetch';

```
## Part 5
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};

```
## Part 6
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import 'VAR_USERLAND';

```
## Part 7
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};

```
## Part 8
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { AppRouteRouteModule } from '../../server/future/route-modules/app-route/module.compiled';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { RouteKind } from '../../server/future/route-kind';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import * as userland from 'VAR_USERLAND';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
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
export { routeModule as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { };

```
## Part 9
```js
import { a as routeModule } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -8
};
const { requestAsyncStorage, workAsyncStorage, serverHooks } = routeModule;
export { requestAsyncStorage as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { workAsyncStorage as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { serverHooks as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 10
```js
const originalPathname = 'VAR_ORIGINAL_PATHNAME';
export { originalPathname };
export { originalPathname as e } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 11
```js
import { c as workAsyncStorage } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { patchFetch as _patchFetch } from '../../server/lib/patch-fetch';
import { d as serverHooks } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -9
};
function patchFetch() {
    return _patchFetch({
        serverHooks,
        workAsyncStorage
    });
}
export { patchFetch };
export { serverHooks };
export { workAsyncStorage };
export { patchFetch as f } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 12
```js
import { b as requestAsyncStorage } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -9
};
export { requestAsyncStorage };

```
## Part 13
```js
import { a as routeModule } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -8
};
export { routeModule };

```
## Part 14
```js
export { originalPathname } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export originalPathname"
};
export { patchFetch } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export patchFetch"
};
export { serverHooks } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export serverHooks"
};
export { workAsyncStorage } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export workAsyncStorage"
};
export { requestAsyncStorage } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export requestAsyncStorage"
};
export { routeModule } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export routeModule"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { AppRouteRouteModule } from '../../server/future/route-modules/app-route/module.compiled';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { RouteKind } from '../../server/future/route-kind';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import * as userland from 'VAR_USERLAND';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
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
export { routeModule as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { };

```
# Entrypoints

```
{
    ModuleEvaluation: 8,
    Export(
        "originalPathname",
    ): 10,
    Export(
        "patchFetch",
    ): 11,
    Export(
        "requestAsyncStorage",
    ): 12,
    Export(
        "routeModule",
    ): 13,
    Export(
        "serverHooks",
    ): 14,
    Export(
        "workAsyncStorage",
    ): 15,
    Exports: 16,
}
```


# Modules (prod)
## Part 0
```js
import '../../server/future/route-modules/app-route/module.compiled';

```
## Part 1
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};

```
## Part 2
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import '../../server/future/route-kind';

```
## Part 3
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};

```
## Part 4
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import '../../server/lib/patch-fetch';

```
## Part 5
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};

```
## Part 6
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import 'VAR_USERLAND';

```
## Part 7
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};

```
## Part 8
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { AppRouteRouteModule } from '../../server/future/route-modules/app-route/module.compiled';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { RouteKind } from '../../server/future/route-kind';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import * as userland from 'VAR_USERLAND';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
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
export { routeModule as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { };

```
## Part 9
```js
import { a as routeModule } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -8
};
const { requestAsyncStorage, workAsyncStorage, serverHooks } = routeModule;
export { requestAsyncStorage as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { workAsyncStorage as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { serverHooks as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 10
```js
const originalPathname = 'VAR_ORIGINAL_PATHNAME';
export { originalPathname };
export { originalPathname as e } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 11
```js
import { c as workAsyncStorage } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { patchFetch as _patchFetch } from '../../server/lib/patch-fetch';
import { d as serverHooks } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -9
};
function patchFetch() {
    return _patchFetch({
        serverHooks,
        workAsyncStorage
    });
}
export { patchFetch };
export { patchFetch as f } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 12
```js
import { b as requestAsyncStorage } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -9
};
export { requestAsyncStorage };

```
## Part 13
```js
import { a as routeModule } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -8
};
export { routeModule };

```
## Part 14
```js
import { d as serverHooks } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -9
};
export { serverHooks };

```
## Part 15
```js
import { c as workAsyncStorage } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -9
};
export { workAsyncStorage };

```
## Part 16
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
    __turbopack_part__: 0
};
import { AppRouteRouteModule } from '../../server/future/route-modules/app-route/module.compiled';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { RouteKind } from '../../server/future/route-kind';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
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
export { routeModule as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { };

```
