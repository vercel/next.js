# Items

Count: 3

## Item 1: Stmt 0, `ImportOfModule`

```js
export { cat as fakeCat } from "./lib";

```

- Hoisted
- Side effects

## Item 2: Stmt 0, `ImportBinding(0)`

```js
export { cat as fakeCat } from "./lib";

```

- Hoisted
- Declares: `__TURBOPACK__reexport__cat__`

# Phase 1
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item3["export fakeCat"];
```
# Phase 2
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item3["export fakeCat"];
    Item3 --> Item2;
```
# Phase 3
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item3["export fakeCat"];
    Item3 --> Item2;
```
# Phase 4
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item3["export fakeCat"];
    Item3 --> Item2;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(0, ImportOfModule), ItemId(Export((&quot;__TURBOPACK__reexport__cat__&quot;, #3), &quot;fakeCat&quot;))]"];
    N1["Items: [ItemId(0, ImportBinding(0))]"];
    N0 --> N1;
```
# Entrypoints

```
{
    ModuleEvaluation: 0,
    Export(
        "fakeCat",
    ): 0,
    Exports: 2,
    StarExports: 3,
}
```


# Modules (dev)
## Part 0
```js
import { a as __TURBOPACK__reexport__cat__ } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -1
};
import "./lib";
export { __TURBOPACK__reexport__cat__ as fakeCat };
export { };

```
## Part 1
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { cat as __TURBOPACK__reexport__cat__ } from "./lib";
export { __TURBOPACK__reexport__cat__ as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
export { fakeCat } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export fakeCat"
};

```
## Part 3
```js

```
## Merged (module eval)
```js
import { a as __TURBOPACK__reexport__cat__ } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -1
};
import "./lib";
export { __TURBOPACK__reexport__cat__ as fakeCat };
export { };

```
# Entrypoints

```
{
    ModuleEvaluation: 0,
    Export(
        "fakeCat",
    ): 0,
    Exports: 2,
    StarExports: 3,
}
```


# Modules (prod)
## Part 0
```js
import { a as __TURBOPACK__reexport__cat__ } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -1
};
import "./lib";
export { __TURBOPACK__reexport__cat__ as fakeCat };
export { };

```
## Part 1
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { cat as __TURBOPACK__reexport__cat__ } from "./lib";
export { __TURBOPACK__reexport__cat__ as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
export { fakeCat } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export fakeCat"
};

```
## Part 3
```js

```
## Merged (module eval)
```js
import { a as __TURBOPACK__reexport__cat__ } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -1
};
import "./lib";
export { __TURBOPACK__reexport__cat__ as fakeCat };
export { };

```
