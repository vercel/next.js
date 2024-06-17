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
    N0["Items: [ItemId(ModuleEvaluation)]"];
    N1["Items: [ItemId(Export((&quot;a&quot;, #2), &quot;a&quot;)), ItemId(0, VarDeclarator(0))]"];
    N2["Items: [ItemId(Export((&quot;b&quot;, #2), &quot;b&quot;)), ItemId(1, VarDeclarator(0))]"];
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
"module evaluation";

```
## Part 1
```js
export { a as a };
const a = "a";
export { a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
export { b as b };
const b = "b";
export { b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Merged (module eval)
```js
"module evaluation";

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
"module evaluation";

```
## Part 1
```js
export { a as a };
const a = "a";
export { a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
export { b as b };
const b = "b";
export { b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Merged (module eval)
```js
"module evaluation";

```
