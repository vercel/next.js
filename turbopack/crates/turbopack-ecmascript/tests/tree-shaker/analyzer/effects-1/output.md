# Items

Count: 15

## Item 1: Stmt 0, `VarDeclarator(0)`

```js
let x = 0;

```

- Declares: `x`
- Write: `x`

## Item 2: Stmt 1, `Normal`

```js
console.log(x);

```

- Side effects
- Reads: `x`

## Item 3: Stmt 2, `Normal`

```js
console.log(x);

```

- Side effects
- Reads: `x`

## Item 4: Stmt 3, `Normal`

```js
x = 1;

```

- Write: `x`

## Item 5: Stmt 4, `Normal`

```js
x = 2;

```

- Write: `x`

## Item 6: Stmt 5, `VarDeclarator(0)`

```js
let y = x;

```

- Declares: `y`
- Reads: `x`
- Write: `y`

## Item 7: Stmt 6, `VarDeclarator(0)`

```js
let z = x;

```

- Declares: `z`
- Reads: `x`
- Write: `z`

## Item 8: Stmt 7, `Normal`

```js
x = y + z;

```

- Reads: `y`, `z`
- Write: `x`

## Item 9: Stmt 8, `Normal`

```js
x = x + 1;

```

- Reads: `x`
- Write: `x`

## Item 10: Stmt 9, `Normal`

```js
x *= 2;

```

- Reads: `x`
- Write: `x`

## Item 11: Stmt 10, `Normal`

```js
console.log(x);

```

- Side effects
- Reads: `x`

## Item 12: Stmt 11, `VarDeclarator(0)`

```js
let a = x;

```

- Declares: `a`
- Reads: `x`
- Write: `a`

## Item 13: Stmt 12, `Normal`

```js
x = x + a + 5;

```

- Reads: `x`, `a`
- Write: `x`

## Item 14: Stmt 13, `Normal`

```js
x = 100;

```

- Write: `x`

# Phase 1
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item4;
    Item5;
    Item6;
    Item7;
    Item8;
    Item9;
    Item10;
    Item11;
    Item12;
    Item13;
    Item14;
    Item15;
    Item15["ModuleEvaluation"];
```
# Phase 2
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item4;
    Item5;
    Item6;
    Item7;
    Item8;
    Item9;
    Item10;
    Item11;
    Item12;
    Item13;
    Item14;
    Item15;
    Item15["ModuleEvaluation"];
    Item2 --> Item1;
    Item3 --> Item1;
    Item3 --> Item2;
    Item4 -.-> Item3;
    Item4 --> Item1;
    Item5 -.-> Item3;
    Item5 --> Item1;
    Item6 --> Item5;
    Item6 --> Item1;
    Item7 --> Item5;
    Item7 --> Item1;
    Item8 --> Item6;
    Item8 --> Item7;
    Item8 --> Item1;
    Item9 --> Item8;
    Item9 --> Item1;
    Item9 -.-> Item6;
    Item9 -.-> Item7;
    Item10 --> Item9;
    Item10 --> Item1;
    Item11 --> Item10;
    Item11 --> Item1;
    Item11 --> Item3;
    Item12 --> Item10;
    Item12 --> Item1;
    Item13 --> Item10;
    Item13 --> Item1;
    Item13 --> Item12;
    Item13 -.-> Item11;
    Item14 -.-> Item13;
    Item14 --> Item1;
```
# Phase 3
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item4;
    Item5;
    Item6;
    Item7;
    Item8;
    Item9;
    Item10;
    Item11;
    Item12;
    Item13;
    Item14;
    Item15;
    Item15["ModuleEvaluation"];
    Item2 --> Item1;
    Item3 --> Item1;
    Item3 --> Item2;
    Item4 -.-> Item3;
    Item4 --> Item1;
    Item5 -.-> Item3;
    Item5 --> Item1;
    Item6 --> Item5;
    Item6 --> Item1;
    Item7 --> Item5;
    Item7 --> Item1;
    Item8 --> Item6;
    Item8 --> Item7;
    Item8 --> Item1;
    Item9 --> Item8;
    Item9 --> Item1;
    Item9 -.-> Item6;
    Item9 -.-> Item7;
    Item10 --> Item9;
    Item10 --> Item1;
    Item11 --> Item10;
    Item11 --> Item1;
    Item11 --> Item3;
    Item12 --> Item10;
    Item12 --> Item1;
    Item13 --> Item10;
    Item13 --> Item1;
    Item13 --> Item12;
    Item13 -.-> Item11;
    Item14 -.-> Item13;
    Item14 --> Item1;
```
# Phase 4
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item4;
    Item5;
    Item6;
    Item7;
    Item8;
    Item9;
    Item10;
    Item11;
    Item12;
    Item13;
    Item14;
    Item15;
    Item15["ModuleEvaluation"];
    Item2 --> Item1;
    Item3 --> Item1;
    Item3 --> Item2;
    Item4 -.-> Item3;
    Item4 --> Item1;
    Item5 -.-> Item3;
    Item5 --> Item1;
    Item6 --> Item5;
    Item6 --> Item1;
    Item7 --> Item5;
    Item7 --> Item1;
    Item8 --> Item6;
    Item8 --> Item7;
    Item8 --> Item1;
    Item9 --> Item8;
    Item9 --> Item1;
    Item9 -.-> Item6;
    Item9 -.-> Item7;
    Item10 --> Item9;
    Item10 --> Item1;
    Item11 --> Item10;
    Item11 --> Item1;
    Item11 --> Item3;
    Item12 --> Item10;
    Item12 --> Item1;
    Item13 --> Item10;
    Item13 --> Item1;
    Item13 --> Item12;
    Item13 -.-> Item11;
    Item14 -.-> Item13;
    Item14 --> Item1;
    Item15 --> Item11;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(0, VarDeclarator(0))]"];
    N1["Items: [ItemId(1, Normal), ItemId(2, Normal)]"];
    N2["Items: [ItemId(3, Normal)]"];
    N3["Items: [ItemId(4, Normal), ItemId(5, VarDeclarator(0)), ItemId(6, VarDeclarator(0)), ItemId(7, Normal), ItemId(8, Normal), ItemId(9, Normal)]"];
    N4["Items: [ItemId(10, Normal)]"];
    N5["Items: [ItemId(11, VarDeclarator(0)), ItemId(12, Normal), ItemId(13, Normal)]"];
    N6["Items: [ItemId(ModuleEvaluation)]"];
    N4 --> N3;
    N1 --> N0;
    N3 --> N0;
    N2 -.-> N1;
    N2 --> N0;
    N5 -.-> N4;
    N3 -.-> N1;
    N4 --> N0;
    N6 --> N4;
    N5 --> N0;
    N5 --> N3;
    N4 --> N1;
```
# Entrypoints

```
{
    ModuleEvaluation: 6,
    Exports: 7,
}
```


# Modules (dev)
## Part 0
```js
let x = 0;
export { x as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
console.log(x);
console.log(x);

```
## Part 2
```js
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
x = 1;

```
## Part 3
```js
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
x = 2;
let y = x;
let z = x;
x = y + z;
x = x + 1;
x *= 2;
export { y as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { z as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
console.log(x);

```
## Part 5
```js
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
let a = x;
x = x + a + 5;
x = 100;
export { a as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 6
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
"module evaluation";

```
## Part 7
```js

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
"module evaluation";

```
# Entrypoints

```
{
    ModuleEvaluation: 1,
    Exports: 7,
}
```


# Modules (prod)
## Part 0
```js
let x = 0;
export { x as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
console.log(x);
console.log(x);
console.log(x);
"module evaluation";

```
## Part 2
```js
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
x = 1;

```
## Part 3
```js
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
x = 2;

```
## Part 4
```js
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
let y = x;
let z = x;
x = y + z;
x = x + 1;
x *= 2;
export { y as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { z as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
let a = x;
x = x + a + 5;
export { a as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 6
```js
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
x = 100;

```
## Part 7
```js

```
## Merged (module eval)
```js
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
console.log(x);
console.log(x);
console.log(x);
"module evaluation";

```
