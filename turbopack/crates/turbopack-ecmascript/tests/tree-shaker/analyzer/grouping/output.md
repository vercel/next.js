# Items

Count: 14

## Item 1: Stmt 0, `VarDeclarator(0)`

```js
let x = 1;

```

- Declares: `x`
- Write: `x`

## Item 2: Stmt 1, `Normal`

```js
x = 2;

```

- Write: `x`

## Item 3: Stmt 2, `Normal`

```js
x = 3;

```

- Write: `x`

## Item 4: Stmt 3, `Normal`

```js
console.log(x);

```

- Side effects
- Reads: `x`

## Item 5: Stmt 4, `Normal`

```js
x = 4;

```

- Write: `x`

## Item 6: Stmt 5, `Normal`

```js
x = 5;

```

- Write: `x`

## Item 7: Stmt 6, `Normal`

```js
x += 6;

```

- Reads: `x`
- Write: `x`

## Item 8: Stmt 7, `Normal`

```js
x += 7;

```

- Reads: `x`
- Write: `x`

## Item 9: Stmt 8, `Normal`

```js
x += 8;

```

- Reads: `x`
- Write: `x`

## Item 10: Stmt 9, `Normal`

```js
x += 9;

```

- Reads: `x`
- Write: `x`

## Item 11: Stmt 11, `VarDeclarator(0)`

```js
export const y = x;

```

- Declares: `y`
- Reads: `x`
- Write: `y`

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
    Item12["ModuleEvaluation"];
    Item13;
    Item13["export x"];
    Item14;
    Item14["export y"];
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
    Item12["ModuleEvaluation"];
    Item13;
    Item13["export x"];
    Item14;
    Item14["export y"];
    Item2 --> Item1;
    Item3 --> Item1;
    Item4 --> Item3;
    Item4 --> Item1;
    Item5 -.-> Item4;
    Item5 --> Item1;
    Item6 -.-> Item4;
    Item6 --> Item1;
    Item7 --> Item3;
    Item7 --> Item6;
    Item7 --> Item1;
    Item7 -.-> Item4;
    Item8 --> Item7;
    Item8 --> Item1;
    Item8 -.-> Item4;
    Item9 --> Item8;
    Item9 --> Item1;
    Item9 -.-> Item4;
    Item10 --> Item9;
    Item10 --> Item1;
    Item10 -.-> Item4;
    Item11 --> Item10;
    Item11 --> Item1;
    Item13 --> Item10;
    Item13 --> Item1;
    Item14 --> Item11;
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
    Item12["ModuleEvaluation"];
    Item13;
    Item13["export x"];
    Item14;
    Item14["export y"];
    Item2 --> Item1;
    Item3 --> Item1;
    Item4 --> Item3;
    Item4 --> Item1;
    Item5 -.-> Item4;
    Item5 --> Item1;
    Item6 -.-> Item4;
    Item6 --> Item1;
    Item7 --> Item3;
    Item7 --> Item6;
    Item7 --> Item1;
    Item7 -.-> Item4;
    Item8 --> Item7;
    Item8 --> Item1;
    Item8 -.-> Item4;
    Item9 --> Item8;
    Item9 --> Item1;
    Item9 -.-> Item4;
    Item10 --> Item9;
    Item10 --> Item1;
    Item10 -.-> Item4;
    Item11 --> Item10;
    Item11 --> Item1;
    Item13 --> Item10;
    Item13 --> Item1;
    Item14 --> Item11;
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
    Item12["ModuleEvaluation"];
    Item13;
    Item13["export x"];
    Item14;
    Item14["export y"];
    Item2 --> Item1;
    Item3 --> Item1;
    Item4 --> Item3;
    Item4 --> Item1;
    Item5 -.-> Item4;
    Item5 --> Item1;
    Item6 -.-> Item4;
    Item6 --> Item1;
    Item7 --> Item3;
    Item7 --> Item6;
    Item7 --> Item1;
    Item7 -.-> Item4;
    Item8 --> Item7;
    Item8 --> Item1;
    Item8 -.-> Item4;
    Item9 --> Item8;
    Item9 --> Item1;
    Item9 -.-> Item4;
    Item10 --> Item9;
    Item10 --> Item1;
    Item10 -.-> Item4;
    Item11 --> Item10;
    Item11 --> Item1;
    Item13 --> Item10;
    Item13 --> Item1;
    Item14 --> Item11;
    Item12 --> Item4;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(ModuleEvaluation)]"];
    N1["Items: [ItemId(Export((&quot;x&quot;, #2), &quot;x&quot;))]"];
    N2["Items: [ItemId(Export((&quot;y&quot;, #2), &quot;y&quot;))]"];
    N3["Items: [ItemId(0, VarDeclarator(0))]"];
    N4["Items: [ItemId(1, Normal)]"];
    N5["Items: [ItemId(2, Normal)]"];
    N6["Items: [ItemId(3, Normal)]"];
    N7["Items: [ItemId(4, Normal)]"];
    N8["Items: [ItemId(5, Normal)]"];
    N9["Items: [ItemId(6, Normal)]"];
    N10["Items: [ItemId(7, Normal)]"];
    N11["Items: [ItemId(8, Normal)]"];
    N12["Items: [ItemId(9, Normal)]"];
    N13["Items: [ItemId(11, VarDeclarator(0))]"];
    N4 --> N3;
    N5 --> N3;
    N6 --> N5;
    N6 --> N3;
    N7 -.-> N6;
    N7 --> N3;
    N8 -.-> N6;
    N8 --> N3;
    N9 --> N5;
    N9 --> N8;
    N9 --> N3;
    N9 -.-> N6;
    N10 --> N9;
    N10 --> N3;
    N10 -.-> N6;
    N11 --> N10;
    N11 --> N3;
    N11 -.-> N6;
    N12 --> N11;
    N12 --> N3;
    N12 -.-> N6;
    N13 --> N12;
    N13 --> N3;
    N1 --> N12;
    N1 --> N3;
    N2 --> N13;
    N0 --> N6;
```
# Entrypoints

```
{
    ModuleEvaluation: 0,
    Exports: 14,
    Export(
        "y",
    ): 2,
    Export(
        "x",
    ): 1,
}
```


# Modules (dev)
## Part 0
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
"module evaluation";

```
## Part 1
```js
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
export { x };

```
## Part 2
```js
import { b as y } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -13
};
export { y };

```
## Part 3
```js
let x = 1;
export { x as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -3
};
x = 2;

```
## Part 5
```js
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -3
};
x = 3;

```
## Part 6
```js
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
console.log(x);

```
## Part 7
```js
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
x = 4;

```
## Part 8
```js
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
x = 5;

```
## Part 9
```js
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
x += 6;

```
## Part 10
```js
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
x += 7;

```
## Part 11
```js
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
x += 8;

```
## Part 12
```js
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
x += 9;

```
## Part 13
```js
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
const y = x;
export { y as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 14
```js
export { x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export x"
};
export { y } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export y"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
"module evaluation";

```
# Entrypoints

```
{
    ModuleEvaluation: 0,
    Exports: 14,
    Export(
        "y",
    ): 2,
    Export(
        "x",
    ): 1,
}
```


# Modules (prod)
## Part 0
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
"module evaluation";

```
## Part 1
```js
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
export { x };

```
## Part 2
```js
import { b as y } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -13
};
export { y };

```
## Part 3
```js
let x = 1;
export { x as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -3
};
x = 2;

```
## Part 5
```js
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -3
};
x = 3;

```
## Part 6
```js
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
console.log(x);

```
## Part 7
```js
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -3
};
x = 4;

```
## Part 8
```js
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -3
};
x = 5;

```
## Part 9
```js
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
x += 6;

```
## Part 10
```js
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
x += 7;

```
## Part 11
```js
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
x += 8;

```
## Part 12
```js
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
x += 9;

```
## Part 13
```js
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
const y = x;
export { y as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 14
```js
export { x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export x"
};
export { y } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export y"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
"module evaluation";

```
