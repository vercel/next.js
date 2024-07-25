# Items

Count: 12

## Item 1: Stmt 0, `Normal`

```js
console.log("Hello");

```

- Side effects

## Item 2: Stmt 1, `VarDeclarator(0)`

```js
const value = externalFunction();

```

- Side effects
- Declares: `value`
- Write: `value`

## Item 3: Stmt 2, `VarDeclarator(0)`

```js
const value2 = externalObject.propertyWithGetter;

```

- Side effects
- Declares: `value2`
- Write: `value2`

## Item 4: Stmt 3, `Normal`

```js
externalObject.propertyWithSetter = 42;

```

- Side effects

## Item 5: Stmt 4, `VarDeclarator(0)`

```js
const value3 = externalFunction();

```

- Side effects
- Declares: `value3`
- Write: `value3`

## Item 6: Stmt 5, `VarDeclarator(0)`

```js
const shared = {
    value,
    value2,
    value3
};

```

- Declares: `shared`
- Reads: `value`, `value2`, `value3`
- Write: `value`, `value2`, `value3`, `shared`

## Item 7: Stmt 6, `Normal`

```js
console.log(shared);

```

- Side effects
- Reads: `shared`

## Item 8: Stmt 7, `VarDeclarator(0)`

```js
export const a = {
    shared,
    a: "aaaaaaaaaaa"
};

```

- Declares: `a`
- Reads: `shared`
- Write: `shared`, `a`

## Item 9: Stmt 8, `VarDeclarator(0)`

```js
export const b = {
    shared,
    b: "bbbbbbbbbbb"
};

```

- Declares: `b`
- Reads: `shared`
- Write: `shared`, `b`

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
    Item10["ModuleEvaluation"];
    Item11;
    Item11["export a"];
    Item12;
    Item12["export b"];
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
    Item10["ModuleEvaluation"];
    Item11;
    Item11["export a"];
    Item12;
    Item12["export b"];
    Item2 --> Item1;
    Item3 --> Item1;
    Item3 --> Item2;
    Item4 --> Item1;
    Item4 --> Item2;
    Item4 --> Item3;
    Item5 --> Item1;
    Item5 --> Item2;
    Item5 --> Item3;
    Item5 --> Item4;
    Item6 --> Item2;
    Item6 --> Item3;
    Item6 --> Item5;
    Item7 --> Item6;
    Item7 --> Item1;
    Item7 --> Item2;
    Item7 --> Item3;
    Item7 --> Item4;
    Item7 --> Item5;
    Item8 --> Item6;
    Item8 -.-> Item7;
    Item9 --> Item8;
    Item9 --> Item6;
    Item9 -.-> Item7;
    Item11 --> Item8;
    Item12 --> Item9;
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
    Item10["ModuleEvaluation"];
    Item11;
    Item11["export a"];
    Item12;
    Item12["export b"];
    Item2 --> Item1;
    Item3 --> Item1;
    Item3 --> Item2;
    Item4 --> Item1;
    Item4 --> Item2;
    Item4 --> Item3;
    Item5 --> Item1;
    Item5 --> Item2;
    Item5 --> Item3;
    Item5 --> Item4;
    Item6 --> Item2;
    Item6 --> Item3;
    Item6 --> Item5;
    Item7 --> Item6;
    Item7 --> Item1;
    Item7 --> Item2;
    Item7 --> Item3;
    Item7 --> Item4;
    Item7 --> Item5;
    Item8 --> Item6;
    Item8 -.-> Item7;
    Item9 --> Item8;
    Item9 --> Item6;
    Item9 -.-> Item7;
    Item11 --> Item8;
    Item12 --> Item9;
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
    Item10["ModuleEvaluation"];
    Item11;
    Item11["export a"];
    Item12;
    Item12["export b"];
    Item2 --> Item1;
    Item3 --> Item1;
    Item3 --> Item2;
    Item4 --> Item1;
    Item4 --> Item2;
    Item4 --> Item3;
    Item5 --> Item1;
    Item5 --> Item2;
    Item5 --> Item3;
    Item5 --> Item4;
    Item6 --> Item2;
    Item6 --> Item3;
    Item6 --> Item5;
    Item7 --> Item6;
    Item7 --> Item1;
    Item7 --> Item2;
    Item7 --> Item3;
    Item7 --> Item4;
    Item7 --> Item5;
    Item8 --> Item6;
    Item8 -.-> Item7;
    Item9 --> Item8;
    Item9 --> Item6;
    Item9 -.-> Item7;
    Item11 --> Item8;
    Item12 --> Item9;
    Item10 --> Item1;
    Item10 --> Item2;
    Item10 --> Item3;
    Item10 --> Item4;
    Item10 --> Item5;
    Item10 --> Item7;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(0, Normal)]"];
    N1["Items: [ItemId(1, VarDeclarator(0))]"];
    N2["Items: [ItemId(2, VarDeclarator(0))]"];
    N3["Items: [ItemId(3, Normal)]"];
    N4["Items: [ItemId(4, VarDeclarator(0))]"];
    N5["Items: [ItemId(5, VarDeclarator(0))]"];
    N6["Items: [ItemId(6, Normal)]"];
    N7["Items: [ItemId(ModuleEvaluation)]"];
    N8["Items: [ItemId(7, VarDeclarator(0))]"];
    N9["Items: [ItemId(Export((&quot;a&quot;, #2), &quot;a&quot;))]"];
    N10["Items: [ItemId(8, VarDeclarator(0))]"];
    N11["Items: [ItemId(Export((&quot;b&quot;, #2), &quot;b&quot;))]"];
    N1 --> N0;
    N2 --> N0;
    N2 --> N1;
    N3 --> N0;
    N3 --> N1;
    N3 --> N2;
    N4 --> N0;
    N4 --> N1;
    N4 --> N2;
    N4 --> N3;
    N5 --> N1;
    N5 --> N2;
    N5 --> N4;
    N6 --> N5;
    N6 --> N0;
    N6 --> N1;
    N6 --> N2;
    N6 --> N3;
    N6 --> N4;
    N8 --> N5;
    N8 -.-> N6;
    N10 --> N8;
    N10 --> N5;
    N10 -.-> N6;
    N9 --> N8;
    N11 --> N10;
    N7 --> N0;
    N7 --> N1;
    N7 --> N2;
    N7 --> N3;
    N7 --> N4;
    N7 --> N6;
```
# Entrypoints

```
{
    ModuleEvaluation: 7,
    Exports: 12,
    Export(
        "b",
    ): 11,
    Export(
        "a",
    ): 9,
}
```


# Modules (dev)
## Part 0
```js
console.log("Hello");

```
## Part 1
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
const value = externalFunction();
export { value } from "__TURBOPACK_VAR__" assert {
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
const value2 = externalObject.propertyWithGetter;
export { value2 } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
externalObject.propertyWithSetter = 42;

```
## Part 4
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
const value3 = externalFunction();
export { value3 } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { value } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import { value2 } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { value3 } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
const shared = {
    value,
    value2,
    value3
};
export { shared } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

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
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { shared } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
console.log(shared);

```
## Part 7
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
"module evaluation";

```
## Part 8
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import { shared } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
const a = {
    shared,
    a: "aaaaaaaaaaa"
};
export { a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 9
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import { a } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
export { a };

```
## Part 10
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import { shared } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
const b = {
    shared,
    b: "bbbbbbbbbbb"
};
export { b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 11
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import { b } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
export { b };

```
## Part 12
```js
export { a } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export a"
};
export { b } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export b"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
"module evaluation";

```
# Entrypoints

```
{
    ModuleEvaluation: 11,
    Exports: 12,
    Export(
        "b",
    ): 9,
    Export(
        "a",
    ): 7,
}
```


# Modules (prod)
## Part 0
```js
console.log("Hello");

```
## Part 1
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
const value = externalFunction();
export { value } from "__TURBOPACK_VAR__" assert {
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
const value2 = externalObject.propertyWithGetter;
export { value2 } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
externalObject.propertyWithSetter = 42;

```
## Part 4
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
const value3 = externalFunction();
export { value3 } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { value } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import { value2 } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { value3 } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
const shared = {
    value,
    value2,
    value3
};
export { shared } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 6
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import { shared } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
const a = {
    shared,
    a: "aaaaaaaaaaa"
};
export { a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 7
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import { a } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
export { a };

```
## Part 8
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import { shared } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
const b = {
    shared,
    b: "bbbbbbbbbbb"
};
export { b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 9
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import { b } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
export { b };

```
## Part 10
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { shared } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
console.log(shared);

```
## Part 11
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
"module evaluation";

```
## Part 12
```js
export { a } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export a"
};
export { b } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export b"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
"module evaluation";

```
