# Items

Count: 7

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
    Item5["ModuleEvaluation"];
    Item6;
    Item6["export DOG"];
    Item7;
    Item7["export CHIMERA"];
```
# Phase 2
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item4;
    Item5;
    Item5["ModuleEvaluation"];
    Item6;
    Item6["export DOG"];
    Item7;
    Item7["export CHIMERA"];
    Item3 --> Item1;
    Item4 --> Item2;
    Item4 --> Item1;
    Item6 --> Item3;
    Item7 --> Item4;
```
# Phase 3
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item4;
    Item5;
    Item5["ModuleEvaluation"];
    Item6;
    Item6["export DOG"];
    Item7;
    Item7["export CHIMERA"];
    Item3 --> Item1;
    Item4 --> Item2;
    Item4 --> Item1;
    Item6 --> Item3;
    Item7 --> Item4;
```
# Phase 4
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item4;
    Item5;
    Item5["ModuleEvaluation"];
    Item6;
    Item6["export DOG"];
    Item7;
    Item7["export CHIMERA"];
    Item3 --> Item1;
    Item4 --> Item2;
    Item4 --> Item1;
    Item6 --> Item3;
    Item7 --> Item4;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(1, VarDeclarator(0))]"];
    N1["Items: [ItemId(0, VarDeclarator(0))]"];
    N2["Items: [ItemId(3, VarDeclarator(0))]"];
    N3["Items: [ItemId(Export((&quot;CHIMERA&quot;, #2), &quot;CHIMERA&quot;))]"];
    N4["Items: [ItemId(2, VarDeclarator(0))]"];
    N5["Items: [ItemId(Export((&quot;DOG&quot;, #2), &quot;DOG&quot;))]"];
    N6["Items: [ItemId(ModuleEvaluation)]"];
    N4 --> N1;
    N2 --> N0;
    N2 --> N1;
    N5 --> N4;
    N3 --> N2;
```
# Entrypoints

```
{
    ModuleEvaluation: 6,
    Exports: 7,
    Export(
        "CHIMERA",
    ): 3,
    Export(
        "DOG",
    ): 5,
}
```


# Modules (dev)
## Part 0
```js
const cat = "cat";
export { cat } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
const dog = "dog";
export { dog } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import { cat } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
const CHIMERA = cat + dog;
export { CHIMERA } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { CHIMERA } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
export { CHIMERA };

```
## Part 4
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import { dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
const DOG = dog;
export { DOG } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { DOG } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
export { DOG };

```
## Part 6
```js
"module evaluation";

```
## Part 7
```js
export { CHIMERA } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export CHIMERA"
};
export { DOG } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export DOG"
};

```
## Merged (module eval)
```js
"module evaluation";

```
# Entrypoints

```
{
    ModuleEvaluation: 6,
    Exports: 7,
    Export(
        "CHIMERA",
    ): 3,
    Export(
        "DOG",
    ): 5,
}
```


# Modules (prod)
## Part 0
```js
const cat = "cat";
export { cat } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
const dog = "dog";
export { dog } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import { cat } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
const CHIMERA = cat + dog;
export { CHIMERA } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { CHIMERA } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
export { CHIMERA };

```
## Part 4
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import { dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
const DOG = dog;
export { DOG } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { DOG } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
export { DOG };

```
## Part 6
```js
"module evaluation";

```
## Part 7
```js
export { CHIMERA } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export CHIMERA"
};
export { DOG } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export DOG"
};

```
## Merged (module eval)
```js
"module evaluation";

```
