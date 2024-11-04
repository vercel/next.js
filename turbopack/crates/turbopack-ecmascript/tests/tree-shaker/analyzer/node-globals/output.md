# Items

Count: 2

## Item 1: Stmt 0, `Normal`

```js
process.turbopack = {};

```

- Side effects

# Phase 1
```mermaid
graph TD
    Item1;
    Item2;
    Item2["ModuleEvaluation"];
```
# Phase 2
```mermaid
graph TD
    Item1;
    Item2;
    Item2["ModuleEvaluation"];
```
# Phase 3
```mermaid
graph TD
    Item1;
    Item2;
    Item2["ModuleEvaluation"];
```
# Phase 4
```mermaid
graph TD
    Item1;
    Item2;
    Item2["ModuleEvaluation"];
    Item2 --> Item1;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(ModuleEvaluation)]"];
    N1["Items: [ItemId(0, Normal)]"];
    N0 --> N1;
```
# Entrypoints

```
{
    ModuleEvaluation: 0,
    Exports: 2,
}
```


# Modules (dev)
## Part 0
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
"module evaluation";

```
## Part 1
```js
process.turbopack = {};

```
## Part 2
```js

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
    ModuleEvaluation: 0,
    Exports: 2,
}
```


# Modules (prod)
## Part 0
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
"module evaluation";

```
## Part 1
```js
process.turbopack = {};

```
## Part 2
```js

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
"module evaluation";

```
