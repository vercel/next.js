# Items

Count: 4

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
    Item3["export a"];
    Item4;
    Item4["export b"];
```
# Phase 2
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item3["export a"];
    Item4;
    Item4["export b"];
    Item3 --> Item1;
    Item4 --> Item2;
```
# Phase 3
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item3["export a"];
    Item4;
    Item4["export b"];
    Item3 --> Item1;
    Item4 --> Item2;
```
# Phase 4
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item3["export a"];
    Item4;
    Item4["export b"];
    Item3 --> Item1;
    Item4 --> Item2;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(0, VarDeclarator(0)), ItemId(Export((&quot;a&quot;, #2), &quot;a&quot;))]"];
    N1["Items: [ItemId(1, VarDeclarator(0)), ItemId(Export((&quot;b&quot;, #2), &quot;b&quot;))]"];
```
# Entrypoints

```
{
    ModuleEvaluation: 3,
    Export(
        "a",
    ): 0,
    Export(
        "b",
    ): 1,
    Exports: 2,
}
```


# Modules (dev)
## Part 0
```js
const a = "a";
export { a };
export { a as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
const b = "b";
export { b };
export { b as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
export { a } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export a"
};
export { b } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export b"
};

```
## Part 3
```js
export { };

```
## Merged (module eval)
```js
export { };

```
# Entrypoints

```
{
    ModuleEvaluation: 3,
    Export(
        "a",
    ): 0,
    Export(
        "b",
    ): 1,
    Exports: 2,
}
```


# Modules (prod)
## Part 0
```js
const a = "a";
export { a };
export { a as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
const b = "b";
export { b };
export { b as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
export { a } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export a"
};
export { b } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export b"
};

```
## Part 3
```js
export { };

```
## Merged (module eval)
```js
export { };

```
