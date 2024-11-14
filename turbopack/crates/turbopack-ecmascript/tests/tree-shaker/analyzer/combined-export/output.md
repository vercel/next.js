# Items

Count: 5

## Item 1: Stmt 0, `VarDeclarator(0)`

```js
const a = "a";

```

- Declares: `a`
- Write: `a`

## Item 2: Stmt 1, `VarDeclarator(0)`

```js
const b = "b";

```

- Declares: `b`
- Write: `b`

# Phase 1
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item3["ModuleEvaluation"];
    Item4;
    Item4["export a"];
    Item5;
    Item5["export b"];
```
# Phase 2
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item3["ModuleEvaluation"];
    Item4;
    Item4["export a"];
    Item5;
    Item5["export b"];
    Item4 --> Item1;
    Item5 --> Item2;
```
# Phase 3
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item3["ModuleEvaluation"];
    Item4;
    Item4["export a"];
    Item5;
    Item5["export b"];
    Item4 --> Item1;
    Item5 --> Item2;
```
# Phase 4
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item3["ModuleEvaluation"];
    Item4;
    Item4["export a"];
    Item5;
    Item5["export b"];
    Item4 --> Item1;
    Item5 --> Item2;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(Export((&quot;a&quot;, #2), &quot;a&quot;))]"];
    N1["Items: [ItemId(Export((&quot;b&quot;, #2), &quot;b&quot;))]"];
    N2["Items: [ItemId(0, VarDeclarator(0))]"];
    N3["Items: [ItemId(1, VarDeclarator(0))]"];
    N4["Items: [ItemId(ModuleEvaluation)]"];
    N0 --> N2;
    N1 --> N3;
```
# Entrypoints

```
{
    ModuleEvaluation: 4,
    Exports: 5,
    Export(
        "b",
    ): 1,
    Export(
        "a",
    ): 0,
}
```


# Modules (dev)
## Part 0
```js
import { a as a } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -2
};
export { a };

```
## Part 1
```js
import { b as b } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -3
};
export { b };

```
## Part 2
```js
const a = "a";
export { a as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
const b = "b";
export { b as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
"module evaluation";

```
## Part 5
```js
export { a } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export a"
};
export { b } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export b"
};

```
## Merged (module eval)
```js
"module evaluation";

```
# Entrypoints

```
{
    ModuleEvaluation: 4,
    Exports: 5,
    Export(
        "b",
    ): 1,
    Export(
        "a",
    ): 0,
}
```


# Modules (prod)
## Part 0
```js
import { a as a } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -2
};
export { a };

```
## Part 1
```js
import { b as b } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -3
};
export { b };

```
## Part 2
```js
const a = "a";
export { a as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
const b = "b";
export { b as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
"module evaluation";

```
## Part 5
```js
export { a } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export a"
};
export { b } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export b"
};

```
## Merged (module eval)
```js
"module evaluation";

```
