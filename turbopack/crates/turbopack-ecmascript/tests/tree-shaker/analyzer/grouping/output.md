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
    N0["Items: [ItemId(0, VarDeclarator(0))]"];
    N1["Items: [ItemId(2, Normal)]"];
    N2["Items: [ItemId(3, Normal)]"];
    N3["Items: [ItemId(ModuleEvaluation)]"];
    N4["Items: [ItemId(5, Normal)]"];
    N5["Items: [ItemId(6, Normal)]"];
    N6["Items: [ItemId(7, Normal)]"];
    N7["Items: [ItemId(8, Normal)]"];
    N8["Items: [ItemId(9, Normal)]"];
    N9["Items: [ItemId(Export((&quot;x&quot;, #2), &quot;x&quot;))]"];
    N10["Items: [ItemId(11, VarDeclarator(0))]"];
    N11["Items: [ItemId(Export((&quot;y&quot;, #2), &quot;y&quot;))]"];
    N12["Items: [ItemId(4, Normal)]"];
    N13["Items: [ItemId(1, Normal)]"];
    N13 --> N0;
    N1 --> N0;
    N2 --> N1;
    N2 --> N0;
    N12 -.-> N2;
    N12 --> N0;
    N4 -.-> N2;
    N4 --> N0;
    N5 --> N1;
    N5 --> N4;
    N5 --> N0;
    N5 -.-> N2;
    N6 --> N5;
    N6 --> N0;
    N6 -.-> N2;
    N7 --> N6;
    N7 --> N0;
    N7 -.-> N2;
    N8 --> N7;
    N8 --> N0;
    N8 -.-> N2;
    N10 --> N8;
    N10 --> N0;
    N9 --> N8;
    N9 --> N0;
    N11 --> N10;
    N3 --> N2;
```
# Entrypoints

```
{
    ModuleEvaluation: 3,
    Exports: 14,
    Export(
        "y",
    ): 11,
    Export(
        "x",
    ): 9,
}
```


# Modules (dev)
## Part 0
```js
let x = 1;
export { x } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
x = 3;

```
## Part 2
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
console.log(x);

```
## Part 3
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
"module evaluation";

```
## Part 4
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
x = 5;

```
## Part 5
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
x += 6;

```
## Part 6
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
x += 7;

```
## Part 7
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
x += 8;

```
## Part 8
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
x += 9;

```
## Part 9
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
export { x as x };

```
## Part 10
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
const y = x;
export { y } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 11
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import { y } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
export { y };

```
## Part 12
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
x = 4;

```
## Part 13
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
x = 2;

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
    __turbopack_part__: 2
};
"module evaluation";

```
# Entrypoints

```
{
    ModuleEvaluation: 12,
    Exports: 14,
    Export(
        "y",
    ): 9,
    Export(
        "x",
    ): 10,
}
```


# Modules (prod)
## Part 0
```js
let x = 1;
export { x } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
x = 5;

```
## Part 2
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
x = 4;

```
## Part 3
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
x = 3;

```
## Part 4
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
x += 6;

```
## Part 5
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
x += 7;

```
## Part 6
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
x += 8;

```
## Part 7
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
x += 9;

```
## Part 8
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import { x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
const y = x;
export { y } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 9
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import { y } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
export { y };

```
## Part 10
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import { x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
export { x as x };

```
## Part 11
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
console.log(x);

```
## Part 12
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
"module evaluation";

```
## Part 13
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
x = 2;

```
## Part 14
```js
export { y } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export y"
};
export { x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export x"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
"module evaluation";

```
