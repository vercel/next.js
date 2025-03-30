# Items

Count: 3

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
    Item3["export RouteKind"];
```
# Phase 2
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item3["export RouteKind"];
    Item2 --> Item1;
    Item3 --> Item2;
    Item3 --> Item1;
```
# Phase 3
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item3["export RouteKind"];
    Item2 --> Item1;
    Item3 --> Item2;
    Item3 --> Item1;
```
# Phase 4
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item3["export RouteKind"];
    Item2 --> Item1;
    Item3 --> Item2;
    Item3 --> Item1;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(0, VarDeclarator(0)), ItemId(1, Normal), ItemId(Export((&quot;RouteKind&quot;, #2), &quot;RouteKind&quot;))]"];
```
# Entrypoints

```
{
    ModuleEvaluation: 0,
    Export(
        "RouteKind",
    ): 0,
    Exports: 1,
}
```


# Modules (dev)
## Part 0
```js
var RouteKind;
(function(RouteKind) {
    RouteKind["PAGES"] = "PAGES";
    RouteKind["PAGES_API"] = "PAGES_API";
    RouteKind["APP_PAGE"] = "APP_PAGE";
    RouteKind["APP_ROUTE"] = "APP_ROUTE";
})(RouteKind || (RouteKind = {}));
export { RouteKind };
export { RouteKind as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { };

```
## Part 1
```js
export { RouteKind } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export RouteKind"
};

```
## Merged (module eval)
```js
var RouteKind;
(function(RouteKind) {
    RouteKind["PAGES"] = "PAGES";
    RouteKind["PAGES_API"] = "PAGES_API";
    RouteKind["APP_PAGE"] = "APP_PAGE";
    RouteKind["APP_ROUTE"] = "APP_ROUTE";
})(RouteKind || (RouteKind = {}));
export { RouteKind };
export { RouteKind as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { };

```
# Entrypoints

```
{
    ModuleEvaluation: 0,
    Export(
        "RouteKind",
    ): 0,
    Exports: 1,
}
```


# Modules (prod)
## Part 0
```js
var RouteKind;
(function(RouteKind) {
    RouteKind["PAGES"] = "PAGES";
    RouteKind["PAGES_API"] = "PAGES_API";
    RouteKind["APP_PAGE"] = "APP_PAGE";
    RouteKind["APP_ROUTE"] = "APP_ROUTE";
})(RouteKind || (RouteKind = {}));
export { RouteKind };
export { RouteKind as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { };

```
## Part 1
```js
export { RouteKind } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export RouteKind"
};

```
## Merged (module eval)
```js
var RouteKind;
(function(RouteKind) {
    RouteKind["PAGES"] = "PAGES";
    RouteKind["PAGES_API"] = "PAGES_API";
    RouteKind["APP_PAGE"] = "APP_PAGE";
    RouteKind["APP_ROUTE"] = "APP_ROUTE";
})(RouteKind || (RouteKind = {}));
export { RouteKind };
export { RouteKind as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { };

```
