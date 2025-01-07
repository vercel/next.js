# Items

Count: 11

## Item 1: Stmt 0, `VarDeclarator(0)`

```js
export const order = [];

```

- Declares: `order`
- Write: `order`

## Item 2: Stmt 1, `Normal`

```js
export function func() {
    order.push("d");
}

```

- Hoisted
- Declares: `func`
- Reads (eventual): `order`
- Write: `func`
- Write (eventual): `order`

## Item 3: Stmt 2, `Normal`

```js
order.push("a");

```

- Side effects
- Reads: `order`
- Write: `order`

## Item 4: Stmt 3, `VarDeclarator(0)`

```js
const x1 = externalFunction();

```

- Side effects
- Declares: `x1`
- Write: `x1`

## Item 5: Stmt 4, `VarDeclarator(0)`

```js
const x2 = externalFunction();

```

- Side effects
- Declares: `x2`
- Write: `x2`

## Item 6: Stmt 5, `VarDeclarator(0)`

```js
export const shared = {
    effect: order.push("b")
};

```

- Side effects
- Declares: `shared`
- Reads: `order`
- Write: `order`, `shared`

## Item 7: Stmt 6, `Normal`

```js
order.push("c");

```

- Side effects
- Reads: `order`
- Write: `order`

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
    Item8["ModuleEvaluation"];
    Item9;
    Item9["export order"];
    Item10;
    Item10["export func"];
    Item11;
    Item11["export shared"];
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
    Item8["ModuleEvaluation"];
    Item9;
    Item9["export order"];
    Item10;
    Item10["export func"];
    Item11;
    Item11["export shared"];
    Item3 --> Item1;
    Item4 --> Item3;
    Item5 --> Item4;
    Item5 --> Item3;
    Item6 --> Item3;
    Item6 --> Item1;
    Item6 --> Item5;
    Item7 --> Item6;
    Item7 --> Item1;
    Item9 --> Item7;
    Item9 --> Item1;
    Item10 --> Item2;
    Item11 --> Item6;
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
    Item8["ModuleEvaluation"];
    Item9;
    Item9["export order"];
    Item10;
    Item10["export func"];
    Item11;
    Item11["export shared"];
    Item3 --> Item1;
    Item4 --> Item3;
    Item5 --> Item4;
    Item5 --> Item3;
    Item6 --> Item3;
    Item6 --> Item1;
    Item6 --> Item5;
    Item7 --> Item6;
    Item7 --> Item1;
    Item9 --> Item7;
    Item9 --> Item1;
    Item10 --> Item2;
    Item11 --> Item6;
    Item2 --> Item7;
    Item2 --> Item1;
    Item2 -.-> Item9;
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
    Item8["ModuleEvaluation"];
    Item9;
    Item9["export order"];
    Item10;
    Item10["export func"];
    Item11;
    Item11["export shared"];
    Item3 --> Item1;
    Item4 --> Item3;
    Item5 --> Item4;
    Item5 --> Item3;
    Item6 --> Item3;
    Item6 --> Item1;
    Item6 --> Item5;
    Item7 --> Item6;
    Item7 --> Item1;
    Item9 --> Item7;
    Item9 --> Item1;
    Item10 --> Item2;
    Item11 --> Item6;
    Item2 --> Item7;
    Item2 --> Item1;
    Item2 -.-> Item9;
    Item8 --> Item7;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(0, VarDeclarator(0))]"];
    N1["Items: [ItemId(1, Normal), ItemId(Export((&quot;func&quot;, #2), &quot;func&quot;)), ItemId(Export((&quot;order&quot;, #2), &quot;order&quot;))]"];
    N2["Items: [ItemId(2, Normal), ItemId(3, VarDeclarator(0)), ItemId(4, VarDeclarator(0)), ItemId(5, VarDeclarator(0))]"];
    N3["Items: [ItemId(6, Normal)]"];
    N4["Items: [ItemId(ModuleEvaluation)]"];
    N5["Items: [ItemId(Export((&quot;shared&quot;, #2), &quot;shared&quot;))]"];
    N3 --> N0;
    N4 --> N3;
    N5 --> N2;
    N1 --> N0;
    N3 --> N2;
    N2 --> N0;
    N1 --> N3;
```
# Entrypoints

```
{
    Export(
        "order",
    ): 1,
    ModuleEvaluation: 4,
    Exports: 6,
    Export(
        "func",
    ): 1,
    Export(
        "shared",
    ): 5,
}
```


# Modules (dev)
## Part 0
```js
const order = [];
export { order as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
import { a as order } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
function func() {
    order.push("d");
}
export { func };
export { order };
export { func as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
import { a as order } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
order.push("a");
const x1 = externalFunction();
const x2 = externalFunction();
const shared = {
    effect: order.push("b")
};
export { x1 as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { x2 as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { shared as e } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
import { a as order } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
order.push("c");

```
## Part 4
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
"module evaluation";

```
## Part 5
```js
import { e as shared } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -2
};
export { shared };

```
## Part 6
```js
export { func } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export func"
};
export { order } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export order"
};
export { shared } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export shared"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
"module evaluation";

```
# Entrypoints

```
{
    ModuleEvaluation: 4,
    Export(
        "order",
    ): 5,
    Exports: 7,
    Export(
        "func",
    ): 1,
    Export(
        "shared",
    ): 6,
}
```


# Modules (prod)
## Part 0
```js
const order = [];
export { order as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
import { a as order } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
function func() {
    order.push("d");
}
export { func };
export { func as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
import { a as order } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
order.push("a");
const x1 = externalFunction();
const x2 = externalFunction();
const shared = {
    effect: order.push("b")
};
export { x1 as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { x2 as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { shared as e } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
import { a as order } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
order.push("c");

```
## Part 4
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
"module evaluation";

```
## Part 5
```js
import { a as order } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
export { order };

```
## Part 6
```js
import { e as shared } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -2
};
export { shared };

```
## Part 7
```js
export { func } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export func"
};
export { order } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export order"
};
export { shared } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export shared"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
"module evaluation";

```
