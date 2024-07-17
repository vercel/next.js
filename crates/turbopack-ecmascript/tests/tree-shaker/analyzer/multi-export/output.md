# Items

Count: 5

## Item 1: Stmt 0, `VarDeclarator(0)`

```js
const dog = "dog";

```

- Declares: `dog`
- Write: `dog`

## Item 2: Stmt 1, `VarDeclarator(0)`

```js
const cat = "cat";

```

- Declares: `cat`
- Write: `cat`

# Phase 1
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item3["ModuleEvaluation"];
    Item4;
    Item4["export DOG"];
    Item5;
    Item5["export cat"];
```
# Phase 2
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item3["ModuleEvaluation"];
    Item4;
    Item4["export DOG"];
    Item5;
    Item5["export cat"];
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
    Item4["export DOG"];
    Item5;
    Item5["export cat"];
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
    Item4["export DOG"];
    Item5;
    Item5["export cat"];
    Item4 --> Item1;
    Item5 --> Item2;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(ModuleEvaluation)]"];
    N1["Items: [ItemId(Export((&quot;dog&quot;, #2), &quot;DOG&quot;)), ItemId(0, VarDeclarator(0))]"];
    N2["Items: [ItemId(Export((&quot;cat&quot;, #2), &quot;cat&quot;)), ItemId(1, VarDeclarator(0))]"];
```
# Entrypoints

```
{
    ModuleEvaluation: 0,
    Exports: 3,
    Export(
        "cat",
    ): 2,
    Export(
        "DOG",
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
export { dog as DOG };
const dog = "dog";
export { dog } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
export { cat as cat };
const cat = "cat";
export { cat } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
export { DOG } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export DOG"
};
export { cat } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export cat"
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
    Exports: 3,
    Export(
        "cat",
    ): 2,
    Export(
        "DOG",
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
export { dog as DOG };
const dog = "dog";
export { dog } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
export { cat as cat };
const cat = "cat";
export { cat } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
export { DOG } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export DOG"
};
export { cat } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export cat"
};

```
## Merged (module eval)
```js
"module evaluation";

```
