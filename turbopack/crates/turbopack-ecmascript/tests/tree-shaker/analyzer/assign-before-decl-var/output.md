# Items

Count: 4

## Item 1: Stmt 0, `Normal`

```js
a = 1;

```

- Write: `a`

## Item 2: Stmt 1, `VarDeclarator(0)`

```js
var a;

```

- Declares: `a`
- Write: `a`

## Item 3: Stmt 2, `Normal`

```js
console.log(a);

```

- Side effects
- Reads: `a`

# Phase 1
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item4;
    Item4["ModuleEvaluation"];
```
# Phase 2
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item4;
    Item4["ModuleEvaluation"];
    Item1 --> Item2;
    Item3 --> Item2;
```
# Phase 3
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item4;
    Item4["ModuleEvaluation"];
    Item1 --> Item2;
    Item3 --> Item2;
```
# Phase 4
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item4;
    Item4["ModuleEvaluation"];
    Item1 --> Item2;
    Item3 --> Item2;
    Item4 --> Item3;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(0, Normal)]"];
    N1["Items: [ItemId(1, VarDeclarator(0))]"];
    N2["Items: [ItemId(2, Normal), ItemId(ModuleEvaluation)]"];
    N0 --> N1;
    N2 --> N1;
```
# Entrypoints

```
{
    ModuleEvaluation: 2,
    Exports: 3,
}
```


# Modules (dev)
## Part 0
```js
import { a as a } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -1
};
a = 1;

```
## Part 1
```js
var a;
export { a as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
import { a as a } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -1
};
console.log(a);
"module evaluation";

```
## Part 3
```js

```
## Merged (module eval)
```js
import { a as a } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -1
};
console.log(a);
"module evaluation";

```
# Entrypoints

```
{
    ModuleEvaluation: 2,
    Exports: 3,
}
```


# Modules (prod)
## Part 0
```js
import { a as a } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -1
};
a = 1;

```
## Part 1
```js
var a;
export { a as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
import { a as a } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -1
};
console.log(a);
"module evaluation";

```
## Part 3
```js

```
## Merged (module eval)
```js
import { a as a } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -1
};
console.log(a);
"module evaluation";

```
