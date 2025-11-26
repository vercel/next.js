# Items

Count: 13

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
    Item12["export x"];
    Item13;
    Item13["export y"];
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
    Item12["export x"];
    Item13;
    Item13["export y"];
    Item2 --> Item1;
    Item3 --> Item1;
    Item4 --> Item3;
    Item4 --> Item1;
    Item5 -.-> Item4;
    Item5 --> Item1;
    Item6 -.-> Item4;
    Item6 --> Item1;
    Item7 --> Item6;
    Item7 --> Item1;
    Item7 -.-> Item4;
    Item8 --> Item7;
    Item8 --> Item1;
    Item9 --> Item8;
    Item9 --> Item1;
    Item10 --> Item9;
    Item10 --> Item1;
    Item11 --> Item10;
    Item11 --> Item1;
    Item12 --> Item10;
    Item12 --> Item1;
    Item13 --> Item11;
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
    Item12["export x"];
    Item13;
    Item13["export y"];
    Item2 --> Item1;
    Item3 --> Item1;
    Item4 --> Item3;
    Item4 --> Item1;
    Item5 -.-> Item4;
    Item5 --> Item1;
    Item6 -.-> Item4;
    Item6 --> Item1;
    Item7 --> Item6;
    Item7 --> Item1;
    Item7 -.-> Item4;
    Item8 --> Item7;
    Item8 --> Item1;
    Item9 --> Item8;
    Item9 --> Item1;
    Item10 --> Item9;
    Item10 --> Item1;
    Item11 --> Item10;
    Item11 --> Item1;
    Item12 --> Item10;
    Item12 --> Item1;
    Item13 --> Item11;
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
    Item12["export x"];
    Item13;
    Item13["export y"];
    Item2 --> Item1;
    Item3 --> Item1;
    Item4 --> Item3;
    Item4 --> Item1;
    Item5 -.-> Item4;
    Item5 --> Item1;
    Item6 -.-> Item4;
    Item6 --> Item1;
    Item7 --> Item6;
    Item7 --> Item1;
    Item7 -.-> Item4;
    Item8 --> Item7;
    Item8 --> Item1;
    Item9 --> Item8;
    Item9 --> Item1;
    Item10 --> Item9;
    Item10 --> Item1;
    Item11 --> Item10;
    Item11 --> Item1;
    Item12 --> Item10;
    Item12 --> Item1;
    Item13 --> Item11;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(0, VarDeclarator(0))]"];
    N1["Items: [ItemId(1, Normal)]"];
    N2["Items: [ItemId(2, Normal), ItemId(3, Normal), ItemId(4, Normal)]"];
    N3["Items: [ItemId(5, Normal), ItemId(6, Normal), ItemId(7, Normal), ItemId(8, Normal), ItemId(9, Normal)]"];
    N4["Items: [ItemId(11, VarDeclarator(0)), ItemId(Export((&quot;y&quot;, #2), &quot;y&quot;))]"];
    N5["Items: [ItemId(Export((&quot;x&quot;, #2), &quot;x&quot;))]"];
    N1 --> N0;
    N3 --> N0;
    N5 --> N0;
    N5 --> N3;
    N4 --> N3;
    N2 --> N0;
    N4 --> N0;
```
# Entrypoints

```
{
    ModuleEvaluation: 2,
    Export(
        "x",
    ): 5,
    Export(
        "y",
    ): 4,
    Exports: 6,
}
```


# Modules (dev)
## Part 0
```js
let x = 1;
export { x as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
x = 2;

```
## Part 2
```js
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
x = 3;
console.log(x);
x = 4;
export { };

```
## Part 3
```js
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
x = 5;
x += 6;
x += 7;
x += 8;
x += 9;

```
## Part 4
```js
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
const y = x;
export { y };
export { y as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
export { x };

```
## Part 6
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
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
x = 3;
console.log(x);
x = 4;
export { };

```
# Entrypoints

```
{
    ModuleEvaluation: 2,
    Export(
        "x",
    ): 6,
    Export(
        "y",
    ): 5,
    Exports: 7,
}
```


# Modules (prod)
## Part 0
```js
let x = 1;
export { x as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
x = 2;

```
## Part 2
```js
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
x = 3;
console.log(x);
export { };

```
## Part 3
```js
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
x = 4;

```
## Part 4
```js
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
x = 5;
x += 6;
x += 7;
x += 8;
x += 9;

```
## Part 5
```js
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
const y = x;
export { y };
export { y as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 6
```js
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
export { x };

```
## Part 7
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
import { a as x } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
x = 3;
console.log(x);
export { };

```
