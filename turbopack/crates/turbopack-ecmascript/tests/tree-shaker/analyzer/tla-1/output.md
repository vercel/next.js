# Items

Count: 6

## Item 1: Stmt 0, `Normal`

```js
await Promise.resolve();

```

- Side effects

## Item 2: Stmt 1, `VarDeclarator(0)`

```js
export const effects = [];

```

- Declares: `effects`
- Write: `effects`

## Item 3: Stmt 2, `Normal`

```js
export function effect(name) {
    effects.push(name);
}

```

- Hoisted
- Declares: `effect`
- Reads (eventual): `effects`
- Write: `effect`
- Write (eventual): `effects`

# Phase 1
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item4;
    Item4["ModuleEvaluation"];
    Item5;
    Item5["export effects"];
    Item6;
    Item6["export effect"];
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
    Item5["export effects"];
    Item6;
    Item6["export effect"];
    Item5 --> Item2;
    Item6 --> Item3;
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
    Item5["export effects"];
    Item6;
    Item6["export effect"];
    Item5 --> Item2;
    Item6 --> Item3;
    Item3 --> Item2;
    Item3 -.-> Item5;
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
    Item5["export effects"];
    Item6;
    Item6["export effect"];
    Item5 --> Item2;
    Item6 --> Item3;
    Item3 --> Item2;
    Item3 -.-> Item5;
    Item4 --> Item1;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(0, Normal)]"];
    N1["Items: [ItemId(ModuleEvaluation)]"];
    N2["Items: [ItemId(1, VarDeclarator(0))]"];
    N3["Items: [ItemId(Export((&quot;effects&quot;, #2), &quot;effects&quot;))]"];
    N4["Items: [ItemId(2, Normal)]"];
    N5["Items: [ItemId(Export((&quot;effect&quot;, #2), &quot;effect&quot;))]"];
    N3 --> N2;
    N5 --> N4;
    N4 --> N2;
    N4 -.-> N3;
    N1 --> N0;
```
# Entrypoints

```
{
    ModuleEvaluation: 1,
    Export(
        "effect",
    ): 5,
    Exports: 6,
    Export(
        "effects",
    ): 3,
}
```


# Modules (dev)
## Part 0
```js
await Promise.resolve();

```
## Part 1
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
"module evaluation";

```
## Part 2
```js
const effects = [];
export { effects } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { effects } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
export { effects };

```
## Part 4
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import { effects } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
function effect(name) {
    effects.push(name);
}
export { effect } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { effect } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
export { effect };

```
## Part 6
```js
export { effects } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export effects"
};
export { effect } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export effect"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
"module evaluation";

```
# Entrypoints

```
{
    ModuleEvaluation: 1,
    Export(
        "effect",
    ): 4,
    Exports: 6,
    Export(
        "effects",
    ): 5,
}
```


# Modules (prod)
## Part 0
```js
await Promise.resolve();

```
## Part 1
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
"module evaluation";

```
## Part 2
```js
const effects = [];
export { effects } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { effects } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
function effect(name) {
    effects.push(name);
}
export { effect } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import { effect } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
export { effect };

```
## Part 5
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { effects } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
export { effects };

```
## Part 6
```js
export { effect } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export effect"
};
export { effects } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export effects"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
"module evaluation";

```
