# Items

Count: 6

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

## Item 3: Stmt 2, `VarDeclarator(0)`

```js
export const DOG = dog;

```

- Declares: `DOG`
- Reads: `dog`
- Write: `DOG`

## Item 4: Stmt 3, `VarDeclarator(0)`

```js
export const CHIMERA = cat + dog;

```

- Declares: `CHIMERA`
- Reads: `cat`, `dog`
- Write: `CHIMERA`

# Phase 1
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item4;
    Item5;
    Item5["export DOG"];
    Item6;
    Item6["export CHIMERA"];
```
# Phase 2
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item4;
    Item5;
    Item5["export DOG"];
    Item6;
    Item6["export CHIMERA"];
    Item3 --> Item1;
    Item4 --> Item2;
    Item4 --> Item1;
    Item5 --> Item3;
    Item6 --> Item4;
```
# Phase 3
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item4;
    Item5;
    Item5["export DOG"];
    Item6;
    Item6["export CHIMERA"];
    Item3 --> Item1;
    Item4 --> Item2;
    Item4 --> Item1;
    Item5 --> Item3;
    Item6 --> Item4;
```
# Phase 4
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item4;
    Item5;
    Item5["export DOG"];
    Item6;
    Item6["export CHIMERA"];
    Item3 --> Item1;
    Item4 --> Item2;
    Item4 --> Item1;
    Item5 --> Item3;
    Item6 --> Item4;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(0, VarDeclarator(0))]"];
    N1["Items: [ItemId(1, VarDeclarator(0)), ItemId(3, VarDeclarator(0)), ItemId(Export((&quot;CHIMERA&quot;, #2), &quot;CHIMERA&quot;))]"];
    N2["Items: [ItemId(2, VarDeclarator(0)), ItemId(Export((&quot;DOG&quot;, #2), &quot;DOG&quot;))]"];
    N2 --> N0;
    N1 --> N0;
```
# Entrypoints

```
{
    ModuleEvaluation: 4,
    Export(
        "CHIMERA",
    ): 1,
    Export(
        "DOG",
    ): 2,
    Exports: 3,
}
```


# Modules (dev)
## Part 0
```js
const dog = "dog";
export { dog as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
import { a as dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
const cat = "cat";
const CHIMERA = cat + dog;
export { CHIMERA };
export { cat as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { CHIMERA as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
import { a as dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
const DOG = dog;
export { DOG };
export { DOG as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
export { CHIMERA } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export CHIMERA"
};
export { DOG } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export DOG"
};

```
## Part 4
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
    ModuleEvaluation: 4,
    Export(
        "CHIMERA",
    ): 1,
    Export(
        "DOG",
    ): 2,
    Exports: 3,
}
```


# Modules (prod)
## Part 0
```js
const dog = "dog";
export { dog as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
import { a as dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
const cat = "cat";
const CHIMERA = cat + dog;
export { CHIMERA };
export { cat as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { CHIMERA as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
import { a as dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
const DOG = dog;
export { DOG };
export { DOG as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
export { CHIMERA } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export CHIMERA"
};
export { DOG } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export DOG"
};

```
## Part 4
```js
export { };

```
## Merged (module eval)
```js
export { };

```
