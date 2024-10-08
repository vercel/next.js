# Items

Count: 4

## Item 1: Stmt 0, `VarDeclarator(0)`

```js
export var RouteKind;

```

- Declares: `RouteKind`
- Write: `RouteKind`

## Item 2: Stmt 1, `Normal`

```js
(function(RouteKind) {
    RouteKind["PAGES"] = "PAGES";
    RouteKind["PAGES_API"] = "PAGES_API";
    RouteKind["APP_PAGE"] = "APP_PAGE";
    RouteKind["APP_ROUTE"] = "APP_ROUTE";
})(RouteKind || (RouteKind = {}));

```

- Side effects
- Reads: `RouteKind`
- Write: `RouteKind`

# Phase 1
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item3["ModuleEvaluation"];
    Item4;
    Item4["export RouteKind"];
```
# Phase 2
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item3["ModuleEvaluation"];
    Item4;
    Item4["export RouteKind"];
    Item2 --> Item1;
    Item4 --> Item2;
    Item4 --> Item1;
```
# Phase 3
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item3["ModuleEvaluation"];
    Item4;
    Item4["export RouteKind"];
    Item2 --> Item1;
    Item4 --> Item2;
    Item4 --> Item1;
```
# Phase 4
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item3["ModuleEvaluation"];
    Item4;
    Item4["export RouteKind"];
    Item2 --> Item1;
    Item4 --> Item2;
    Item4 --> Item1;
    Item3 --> Item2;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(0, VarDeclarator(0))]"];
    N1["Items: [ItemId(1, Normal)]"];
    N2["Items: [ItemId(ModuleEvaluation)]"];
    N3["Items: [ItemId(Export((&quot;RouteKind&quot;, #2), &quot;RouteKind&quot;))]"];
    N1 --> N0;
    N3 --> N1;
    N3 --> N0;
    N2 --> N1;
```
# Entrypoints

```
{
    ModuleEvaluation: 2,
    Export(
        "RouteKind",
    ): 3,
    Exports: 4,
}
```


# Modules (dev)
## Part 0
```js
var RouteKind;
export { RouteKind as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
import { a as RouteKind } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
(function(RouteKind) {
    RouteKind["PAGES"] = "PAGES";
    RouteKind["PAGES_API"] = "PAGES_API";
    RouteKind["APP_PAGE"] = "APP_PAGE";
    RouteKind["APP_ROUTE"] = "APP_ROUTE";
})(RouteKind || (RouteKind = {}));

```
## Part 2
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
"module evaluation";

```
## Part 3
```js
import { a as RouteKind } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
export { RouteKind };

```
## Part 4
```js
export { RouteKind } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export RouteKind"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
"module evaluation";

```
# Entrypoints

```
{
    ModuleEvaluation: 2,
    Export(
        "RouteKind",
    ): 3,
    Exports: 4,
}
```


# Modules (prod)
## Part 0
```js
var RouteKind;
export { RouteKind as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
import { a as RouteKind } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
(function(RouteKind) {
    RouteKind["PAGES"] = "PAGES";
    RouteKind["PAGES_API"] = "PAGES_API";
    RouteKind["APP_PAGE"] = "APP_PAGE";
    RouteKind["APP_ROUTE"] = "APP_ROUTE";
})(RouteKind || (RouteKind = {}));

```
## Part 2
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
"module evaluation";

```
## Part 3
```js
import { a as RouteKind } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
export { RouteKind };

```
## Part 4
```js
export { RouteKind } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export RouteKind"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
"module evaluation";

```
