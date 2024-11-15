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
    N0["Items: [ItemId(ModuleEvaluation), ItemId(2, Normal)]"];
    N1["Items: [ItemId(0, Normal)]"];
    N2["Items: [ItemId(1, VarDeclarator(0))]"];
    N1 --> N2;
    N0 --> N2;
```
# Entrypoints

```
{
    ModuleEvaluation: 0,
    Exports: 3,
}
```


# Modules (dev)
## Part 0
```js
import { a as a } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -2
};
"module evaluation";
console.log(a);

```
## Part 1
```js
import { a as a } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -2
};
a = 1;

```
## Part 2
```js
var a;
export { a as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js

```
## Merged (module eval)
```js
import { a as a } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -2
};
"module evaluation";
console.log(a);

```
# Entrypoints

```
{
    ModuleEvaluation: 0,
    Exports: 3,
}
```


# Modules (prod)
## Part 0
```js
import { a as a } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -2
};
"module evaluation";
console.log(a);

```
## Part 1
```js
import { a as a } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -2
};
a = 1;

```
## Part 2
```js
var a;
export { a as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js

```
## Merged (module eval)
```js
import { a as a } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -2
};
"module evaluation";
console.log(a);

```
