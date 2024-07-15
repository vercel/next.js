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
- Write: `shared`

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
- Write: `a`

## Item 9: Stmt 8, `VarDeclarator(0)`

```js
export const b = {
    shared,
    b: "bbbbbbbbbbb"
};

```

- Declares: `b`
- Reads: `shared`
- Write: `b`

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
    Item9 --> Item6;
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
    N0["Items: [ItemId(ModuleEvaluation), ItemId(6, Normal)]"];
    N1["Items: [ItemId(Export((&quot;a&quot;, #2), &quot;a&quot;)), ItemId(7, VarDeclarator(0))]"];
    N2["Items: [ItemId(Export((&quot;b&quot;, #2), &quot;b&quot;)), ItemId(8, VarDeclarator(0))]"];
    N3["Items: [ItemId(0, Normal)]"];
    N4["Items: [ItemId(1, VarDeclarator(0))]"];
    N5["Items: [ItemId(2, VarDeclarator(0))]"];
    N6["Items: [ItemId(3, Normal)]"];
    N7["Items: [ItemId(4, VarDeclarator(0))]"];
    N8["Items: [ItemId(5, VarDeclarator(0))]"];
    N0 --> N3;
    N0 --> N4;
    N0 --> N5;
    N0 --> N6;
    N0 --> N7;
    N0 --> N8;
    N1 --> N8;
    N2 --> N8;
    N4 --> N3;
    N5 --> N3;
    N5 --> N4;
    N6 --> N3;
    N6 --> N4;
    N6 --> N5;
    N7 --> N3;
    N7 --> N4;
    N7 --> N5;
    N7 --> N6;
    N8 --> N4;
    N8 --> N5;
    N8 --> N7;
```
# Entrypoints

```
{
    ModuleEvaluation: 0,
    Export(
        "b",
    ): 2,
    Export(
        "a",
    ): 1,
}
```


# Modules (dev)
## Part 0
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import { shared } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
"module evaluation";
console.log(shared);

```
## Part 1
```js
import { shared } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
export { a };
const a = {
    shared,
    a: "aaaaaaaaaaa"
};
export { a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
import { shared } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
export { b };
const b = {
    shared,
    b: "bbbbbbbbbbb"
};
export { b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
console.log("Hello");

```
## Part 4
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
const value = externalFunction();
export { value } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
const value2 = externalObject.propertyWithGetter;
export { value2 } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 6
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
externalObject.propertyWithSetter = 42;

```
## Part 7
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
const value3 = externalFunction();
export { value3 } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 8
```js
import { value } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { value2 } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import { value3 } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
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
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import { shared } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
"module evaluation";
console.log(shared);

```
# Entrypoints

```
{
    ModuleEvaluation: 0,
    Export(
        "b",
    ): 2,
    Export(
        "a",
    ): 1,
}
```


# Modules (prod)
## Part 0
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import { shared } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
"module evaluation";
console.log(shared);

```
## Part 1
```js
import { shared } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
export { a };
const a = {
    shared,
    a: "aaaaaaaaaaa"
};
export { a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
import { shared } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
export { b };
const b = {
    shared,
    b: "bbbbbbbbbbb"
};
export { b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
console.log("Hello");

```
## Part 4
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
const value = externalFunction();
export { value } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
const value2 = externalObject.propertyWithGetter;
export { value2 } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 6
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
externalObject.propertyWithSetter = 42;

```
## Part 7
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
const value3 = externalFunction();
export { value3 } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 8
```js
import { value } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { value2 } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import { value3 } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
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
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import { shared } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
"module evaluation";
console.log(shared);

```
