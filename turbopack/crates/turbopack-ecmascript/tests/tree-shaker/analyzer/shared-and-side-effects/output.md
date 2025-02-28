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

- Declares: `value3`

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
    Item3 --> Item2;
    Item4 --> Item3;
    Item6 --> Item2;
    Item6 --> Item3;
    Item6 --> Item5;
    Item7 --> Item6;
    Item7 --> Item4;
    Item8 --> Item6;
    Item8 -.-> Item7;
    Item9 --> Item8;
    Item9 --> Item6;
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
    Item3 --> Item2;
    Item4 --> Item3;
    Item6 --> Item2;
    Item6 --> Item3;
    Item6 --> Item5;
    Item7 --> Item6;
    Item7 --> Item4;
    Item8 --> Item6;
    Item8 -.-> Item7;
    Item9 --> Item8;
    Item9 --> Item6;
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
    Item3 --> Item2;
    Item4 --> Item3;
    Item6 --> Item2;
    Item6 --> Item3;
    Item6 --> Item5;
    Item7 --> Item6;
    Item7 --> Item4;
    Item8 --> Item6;
    Item8 -.-> Item7;
    Item9 --> Item8;
    Item9 --> Item6;
    Item11 --> Item8;
    Item12 --> Item9;
    Item10 --> Item7;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(0, Normal), ItemId(1, VarDeclarator(0))]"];
    N1["Items: [ItemId(2, VarDeclarator(0))]"];
    N2["Items: [ItemId(3, Normal), ItemId(6, Normal)]"];
    N3["Items: [ItemId(4, VarDeclarator(0)), ItemId(5, VarDeclarator(0))]"];
    N4["Items: [ItemId(7, VarDeclarator(0))]"];
    N5["Items: [ItemId(8, VarDeclarator(0)), ItemId(Export((&quot;b&quot;, #2), &quot;b&quot;))]"];
    N6["Items: [ItemId(ModuleEvaluation)]"];
    N7["Items: [ItemId(Export((&quot;a&quot;, #2), &quot;a&quot;))]"];
    N7 --> N4;
    N1 --> N0;
    N6 --> N2;
    N3 --> N0;
    N3 --> N1;
    N5 --> N4;
    N2 --> N3;
    N2 --> N1;
    N4 --> N3;
    N4 -.-> N2;
    N5 --> N3;
```
# Entrypoints

```
{
    ModuleEvaluation: 6,
    Export(
        "a",
    ): 7,
    Export(
        "b",
    ): 5,
    Exports: 8,
}
```


# Modules (dev)
## Part 0
```js
console.log("Hello");
const value = externalFunction();
export { value as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
const value2 = externalObject.propertyWithGetter;
export { value2 as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
import { c as shared } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
externalObject.propertyWithSetter = 42;
console.log(shared);

```
## Part 3
```js
import { a as value } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
import { b as value2 } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -1
};
const value3 = externalFunction();
const shared = {
    value,
    value2,
    value3
};
export { value3 as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { shared as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
import { c as shared } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
const a = {
    shared,
    a: "aaaaaaaaaaa"
};
export { a as e } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import { c as shared } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
const b = {
    shared,
    b: "bbbbbbbbbbb"
};
export { b };
export { b as f } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 6
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
"module evaluation";

```
## Part 7
```js
import { e as a } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -4
};
export { a };

```
## Part 8
```js
export { b } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export b"
};
export { a } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export a"
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
    ModuleEvaluation: 1,
    Export(
        "a",
    ): 4,
    Export(
        "b",
    ): 3,
    Exports: 5,
}
```


# Modules (prod)
## Part 0
```js
console.log("Hello");
const value = externalFunction();
const value2 = externalObject.propertyWithGetter;
const value3 = externalFunction();
const shared = {
    value,
    value2,
    value3
};
export { value as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { value2 as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { value3 as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { shared as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
import { d as shared } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
externalObject.propertyWithSetter = 42;
console.log(shared);
"module evaluation";

```
## Part 2
```js
import { d as shared } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
const a = {
    shared,
    a: "aaaaaaaaaaa"
};
export { a as e } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
import { d as shared } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
const b = {
    shared,
    b: "bbbbbbbbbbb"
};
export { b };
export { b as f } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
import { e as a } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -2
};
export { a };

```
## Part 5
```js
export { b } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export b"
};
export { a } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export a"
};

```
## Merged (module eval)
```js
import { d as shared } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
externalObject.propertyWithSetter = 42;
console.log(shared);
"module evaluation";

```
