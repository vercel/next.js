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
    N0["Items: [ItemId(Export((&quot;CHIMERA&quot;, #2), &quot;CHIMERA&quot;))]"];
    N1["Items: [ItemId(Export((&quot;DOG&quot;, #2), &quot;DOG&quot;))]"];
    N2["Items: [ItemId(0, VarDeclarator(0))]"];
    N3["Items: [ItemId(1, VarDeclarator(0))]"];
    N4["Items: [ItemId(2, VarDeclarator(0))]"];
    N5["Items: [ItemId(3, VarDeclarator(0))]"];
    N6["Items: [ItemId(ModuleEvaluation)]"];
    N4 --> N2;
    N5 --> N3;
    N5 --> N2;
    N1 --> N4;
    N0 --> N5;
```
# Entrypoints

```
{
    ModuleEvaluation: 6,
    Exports: 7,
    Export(
        "CHIMERA",
    ): 0,
    Export(
        "DOG",
    ): 1,
}
```


# Modules (dev)
## Part 0
```js
import { a as CHIMERA } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -5
};
export { CHIMERA };

```
## Part 1
```js
import { b as DOG } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -4
};
export { DOG };

```
## Part 2
```js
const dog = "dog";
export { dog as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
const cat = "cat";
export { cat as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
import { c as dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -2
};
const DOG = dog;
export { DOG as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import { d as cat } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -3
};
import { c as dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -2
};
const CHIMERA = cat + dog;
export { CHIMERA as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

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
    ): 0,
    Export(
        "DOG",
    ): 1,
}
```


# Modules (prod)
## Part 0
```js
import { a as CHIMERA } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -5
};
export { CHIMERA };

```
## Part 1
```js
import { b as DOG } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -4
};
export { DOG };

```
## Part 2
```js
const dog = "dog";
export { dog as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
const cat = "cat";
export { cat as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
import { c as dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -2
};
const DOG = dog;
export { DOG as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import { d as cat } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -3
};
import { c as dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -2
};
const CHIMERA = cat + dog;
export { CHIMERA as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

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
