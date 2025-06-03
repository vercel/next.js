# Items

Count: 4

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
    Item3["export DOG"];
    Item4;
    Item4["export cat"];
```
# Phase 2
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item3["export DOG"];
    Item4;
    Item4["export cat"];
    Item3 --> Item1;
    Item4 --> Item2;
```
# Phase 3
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item3["export DOG"];
    Item4;
    Item4["export cat"];
    Item3 --> Item1;
    Item4 --> Item2;
```
# Phase 4
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item3["export DOG"];
    Item4;
    Item4["export cat"];
    Item3 --> Item1;
    Item4 --> Item2;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(0, VarDeclarator(0)), ItemId(Export((&quot;dog&quot;, #2), &quot;DOG&quot;))]"];
    N1["Items: [ItemId(1, VarDeclarator(0)), ItemId(Export((&quot;cat&quot;, #2), &quot;cat&quot;))]"];
```
# Entrypoints

```
{
    ModuleEvaluation: 3,
    Export(
        "DOG",
    ): 0,
    Export(
        "cat",
    ): 1,
    Exports: 2,
}
```


# Modules (dev)
## Part 0
```js
const dog = "dog";
export { dog as DOG };
export { dog as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
const cat = "cat";
export { cat };
export { cat as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
export { DOG } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export DOG"
};
export { cat } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export cat"
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
        "DOG",
    ): 0,
    Export(
        "cat",
    ): 1,
    Exports: 2,
}
```


# Modules (prod)
## Part 0
```js
const dog = "dog";
export { dog as DOG };
export { dog as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
const cat = "cat";
export { cat };
export { cat as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
export { DOG } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export DOG"
};
export { cat } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export cat"
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
