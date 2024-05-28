# Items

Count: 6

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

## Item 3: Stmt 2, `Normal`

```js
export { a, b };

```

- Side effects
- Reads: `a`, `b`

# Phase 1
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item4;
    Item4["ModuleEvaluation"];
    Item5;
    Item5["export a"];
    Item6;
    Item6["export b"];
```
# Phase 2
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item4;
    Item4["ModuleEvaluation"];
    Item5;
    Item5["export a"];
    Item6;
    Item6["export b"];
    Item3 --> Item1;
    Item3 --> Item2;
```
# Phase 3
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item4;
    Item4["ModuleEvaluation"];
    Item5;
    Item5["export a"];
    Item6;
    Item6["export b"];
    Item3 --> Item1;
    Item3 --> Item2;
```
# Phase 4
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item4;
    Item4["ModuleEvaluation"];
    Item5;
    Item5["export a"];
    Item6;
    Item6["export b"];
    Item3 --> Item1;
    Item3 --> Item2;
    Item4 --> Item3;
    Item5 --> Item1;
    Item6 --> Item2;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(ModuleEvaluation), ItemId(2, Normal)]"];
    N1["Items: [ItemId(Export((&quot;a&quot;, #2), &quot;a&quot;))]"];
    N2["Items: [ItemId(Export((&quot;b&quot;, #2), &quot;b&quot;))]"];
    N3["Items: [ItemId(0, VarDeclarator(0))]"];
    N4["Items: [ItemId(1, VarDeclarator(0))]"];
    N0 --> N3;
    N0 --> N4;
    N1 --> N3;
    N2 --> N4;
```
# Entrypoints

```
{
    ModuleEvaluation: 0,
    Export(
        "b",
    ): 2,
    Export(
        "a",
    ): 1,
}
```


# Modules (dev)
## Part 0
```js
import { a } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import { b } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
"module evaluation";
export { a, b };

```
## Part 1
```js
import { a } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
export { a as a };

```
## Part 2
```js
import { b } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
export { b as b };

```
## Part 3
```js
const a = "a";
export { a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
const b = "b";
export { b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Merged (module eval)
```js
import { a } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import { b } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
"module evaluation";
export { a, b };

```
# Entrypoints

```
{
    ModuleEvaluation: 0,
    Export(
        "b",
    ): 2,
    Export(
        "a",
    ): 1,
}
```


# Modules (prod)
## Part 0
```js
import { a } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import { b } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
"module evaluation";
export { a, b };

```
## Part 1
```js
import { a } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
export { a as a };

```
## Part 2
```js
import { b } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
export { b as b };

```
## Part 3
```js
const a = "a";
export { a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
const b = "b";
export { b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Merged (module eval)
```js
import { a } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import { b } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
"module evaluation";
export { a, b };

```
