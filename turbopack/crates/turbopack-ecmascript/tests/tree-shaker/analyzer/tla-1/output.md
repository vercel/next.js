# Items

Count: 5

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
    Item4["export effects"];
    Item5;
    Item5["export effect"];
```
# Phase 2
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item4;
    Item4["export effects"];
    Item5;
    Item5["export effect"];
    Item4 --> Item2;
    Item5 --> Item3;
```
# Phase 3
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item4;
    Item4["export effects"];
    Item5;
    Item5["export effect"];
    Item4 --> Item2;
    Item5 --> Item3;
    Item3 --> Item2;
    Item3 -.-> Item4;
```
# Phase 4
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item4;
    Item4["export effects"];
    Item5;
    Item5["export effect"];
    Item4 --> Item2;
    Item5 --> Item3;
    Item3 --> Item2;
    Item3 -.-> Item4;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(1, VarDeclarator(0)), ItemId(2, Normal), ItemId(Export((&quot;effect&quot;, #2), &quot;effect&quot;)), ItemId(Export((&quot;effects&quot;, #2), &quot;effects&quot;))]"];
    N1["Items: [ItemId(0, Normal)]"];
```
# Entrypoints

```
{
    ModuleEvaluation: 1,
    Export(
        "effect",
    ): 0,
    Export(
        "effects",
    ): 0,
    Exports: 2,
}
```


# Modules (dev)
## Part 0
```js
const effects = [];
function effect(name) {
    effects.push(name);
}
export { effect };
export { effects };
export { effects as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { effect as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
await Promise.resolve();
export { };

```
## Part 2
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
await Promise.resolve();
export { };

```
# Entrypoints

```
{
    ModuleEvaluation: 3,
    Export(
        "effect",
    ): 1,
    Export(
        "effects",
    ): 2,
    Exports: 4,
}
```


# Modules (prod)
## Part 0
```js
const effects = [];
export { effects as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
import { a as effects } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
function effect(name) {
    effects.push(name);
}
export { effect };
export { effect as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
import { a as effects } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
export { effects };

```
## Part 3
```js
await Promise.resolve();
export { };

```
## Part 4
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
await Promise.resolve();
export { };

```
