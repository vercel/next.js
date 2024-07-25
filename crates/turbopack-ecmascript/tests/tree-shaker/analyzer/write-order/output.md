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
    Item5 --> Item3;
    Item5 --> Item4;
    Item6 --> Item3;
    Item6 --> Item1;
    Item7 --> Item6;
    Item7 --> Item1;
    Item7 --> Item3;
    Item7 --> Item4;
    Item7 --> Item5;
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
    Item5 --> Item3;
    Item5 --> Item4;
    Item6 --> Item3;
    Item6 --> Item1;
    Item7 --> Item6;
    Item7 --> Item1;
    Item7 --> Item3;
    Item7 --> Item4;
    Item7 --> Item5;
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
    Item5 --> Item3;
    Item5 --> Item4;
    Item6 --> Item3;
    Item6 --> Item1;
    Item7 --> Item6;
    Item7 --> Item1;
    Item7 --> Item3;
    Item7 --> Item4;
    Item7 --> Item5;
    Item9 --> Item7;
    Item9 --> Item1;
    Item10 --> Item2;
    Item11 --> Item6;
    Item2 --> Item7;
    Item2 --> Item1;
    Item2 -.-> Item9;
    Item8 --> Item3;
    Item8 --> Item4;
    Item8 --> Item5;
    Item8 --> Item7;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(0, VarDeclarator(0))]"];
    N1["Items: [ItemId(2, Normal)]"];
    N2["Items: [ItemId(5, VarDeclarator(0))]"];
    N3["Items: [ItemId(Export((&quot;shared&quot;, #2), &quot;shared&quot;))]"];
    N4["Items: [ItemId(3, VarDeclarator(0))]"];
    N5["Items: [ItemId(4, VarDeclarator(0))]"];
    N6["Items: [ItemId(6, Normal)]"];
    N7["Items: [ItemId(ModuleEvaluation)]"];
    N8["Items: [ItemId(Export((&quot;order&quot;, #2), &quot;order&quot;))]"];
    N9["Items: [ItemId(1, Normal)]"];
    N10["Items: [ItemId(Export((&quot;func&quot;, #2), &quot;func&quot;))]"];
    N1 --> N0;
    N4 --> N1;
    N5 --> N1;
    N5 --> N4;
    N2 --> N1;
    N2 --> N0;
    N6 --> N2;
    N6 --> N0;
    N6 --> N1;
    N6 --> N4;
    N6 --> N5;
    N8 --> N6;
    N8 --> N0;
    N10 --> N9;
    N3 --> N2;
    N9 --> N6;
    N9 --> N0;
    N9 -.-> N8;
    N7 --> N1;
    N7 --> N4;
    N7 --> N5;
    N7 --> N6;
```
# Entrypoints

```
{
    ModuleEvaluation: 7,
    Export(
        "order",
    ): 8,
    Exports: 11,
    Export(
        "func",
    ): 10,
    Export(
        "shared",
    ): 3,
}
```


# Modules (dev)
## Part 0
```js
const order = [];
export { order } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { order } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
order.push("a");

```
## Part 2
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { order } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
const shared = {
    effect: order.push("b")
};
export { shared } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { shared } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
export { shared };

```
## Part 4
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
const x1 = externalFunction();
export { x1 } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
const x2 = externalFunction();
export { x2 } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 6
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import { order } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
order.push("c");

```
## Part 7
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
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
"module evaluation";

```
## Part 8
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { order } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
export { order };

```
## Part 9
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import { order } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
function func() {
    order.push("d");
}
export { func } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 10
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import { func } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
export { func };

```
## Part 11
```js
export { shared } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export shared"
};
export { order } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export order"
};
export { func } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export func"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
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
"module evaluation";

```
# Entrypoints

```
{
    ModuleEvaluation: 7,
    Export(
        "order",
    ): 10,
    Exports: 11,
    Export(
        "func",
    ): 9,
    Export(
        "shared",
    ): 3,
}
```


# Modules (prod)
## Part 0
```js
const order = [];
export { order } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { order } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
order.push("a");

```
## Part 2
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { order } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
const shared = {
    effect: order.push("b")
};
export { shared } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { shared } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
export { shared };

```
## Part 4
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
const x1 = externalFunction();
export { x1 } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
const x2 = externalFunction();
export { x2 } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 6
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import { order } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
order.push("c");

```
## Part 7
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
"module evaluation";

```
## Part 8
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { order } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
function func() {
    order.push("d");
}
export { func } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 9
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import { func } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
export { func };

```
## Part 10
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { order } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
export { order };

```
## Part 11
```js
export { shared } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export shared"
};
export { func } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export func"
};
export { order } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export order"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
"module evaluation";

```
