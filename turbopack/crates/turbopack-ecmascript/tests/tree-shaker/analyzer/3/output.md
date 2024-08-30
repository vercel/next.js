# Items

Count: 15

## Item 1: Stmt 0, `Normal`

```js
function d1() {}

```

- Hoisted
- Declares: `d1`
- Write: `d1`

## Item 2: Stmt 1, `Normal`

```js
function d2() {}

```

- Hoisted
- Declares: `d2`
- Write: `d2`

## Item 3: Stmt 2, `Normal`

```js
function d3() {}

```

- Hoisted
- Declares: `d3`
- Write: `d3`

## Item 4: Stmt 3, `Normal`

```js
export function c1_1() {
    return c1_2();
}

```

- Hoisted
- Declares: `c1_1`
- Reads (eventual): `c1_2`
- Write: `c1_1`

## Item 5: Stmt 4, `Normal`

```js
function c1_2() {
    return c1_3(d1);
}

```

- Hoisted
- Declares: `c1_2`
- Reads (eventual): `c1_3`, `d1`
- Write: `c1_2`

## Item 6: Stmt 5, `Normal`

```js
export function c1_3() {
    return c1_1(d2);
}

```

- Hoisted
- Declares: `c1_3`
- Reads (eventual): `c1_1`, `d2`
- Write: `c1_3`

## Item 7: Stmt 6, `Normal`

```js
function c2_1() {
    return c2_2(d3);
}

```

- Hoisted
- Declares: `c2_1`
- Reads (eventual): `c2_2`, `d3`
- Write: `c2_1`

## Item 8: Stmt 7, `Normal`

```js
export function c2_2() {
    return c2_3();
}

```

- Hoisted
- Declares: `c2_2`
- Reads (eventual): `c2_3`
- Write: `c2_2`

## Item 9: Stmt 8, `Normal`

```js
function c2_3() {
    return c2_1();
}

```

- Hoisted
- Declares: `c2_3`
- Reads (eventual): `c2_1`
- Write: `c2_3`

## Item 10: Stmt 9, `Normal`

```js
c1_3();

```

- Side effects
- Reads: `c1_3`

## Item 11: Stmt 10, `Normal`

```js
c2_2();

```

- Side effects
- Reads: `c2_2`

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
    Item13["export c1_1"];
    Item14;
    Item14["export c1_3"];
    Item15;
    Item15["export c2_2"];
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
    Item13["export c1_1"];
    Item14;
    Item14["export c1_3"];
    Item15;
    Item15["export c2_2"];
    Item10 --> Item6;
    Item10 -.-> Item5;
    Item10 -.-> Item1;
    Item10 -.-> Item4;
    Item10 -.-> Item2;
    Item10 -.-> Item8;
    Item10 -.-> Item3;
    Item10 -.-> Item9;
    Item10 -.-> Item7;
    Item11 --> Item8;
    Item11 --> Item10;
    Item11 -.-> Item5;
    Item11 -.-> Item6;
    Item11 -.-> Item1;
    Item11 -.-> Item4;
    Item11 -.-> Item2;
    Item11 -.-> Item3;
    Item11 -.-> Item9;
    Item11 -.-> Item7;
    Item13 --> Item4;
    Item14 --> Item6;
    Item15 --> Item8;
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
    Item13["export c1_1"];
    Item14;
    Item14["export c1_3"];
    Item15;
    Item15["export c2_2"];
    Item10 --> Item6;
    Item10 -.-> Item5;
    Item10 -.-> Item1;
    Item10 -.-> Item4;
    Item10 -.-> Item2;
    Item10 -.-> Item8;
    Item10 -.-> Item3;
    Item10 -.-> Item9;
    Item10 -.-> Item7;
    Item11 --> Item8;
    Item11 --> Item10;
    Item11 -.-> Item5;
    Item11 -.-> Item6;
    Item11 -.-> Item1;
    Item11 -.-> Item4;
    Item11 -.-> Item2;
    Item11 -.-> Item3;
    Item11 -.-> Item9;
    Item11 -.-> Item7;
    Item13 --> Item4;
    Item14 --> Item6;
    Item15 --> Item8;
    Item4 --> Item5;
    Item5 --> Item6;
    Item5 --> Item1;
    Item6 --> Item4;
    Item6 --> Item2;
    Item7 --> Item8;
    Item7 --> Item3;
    Item8 --> Item9;
    Item9 --> Item7;
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
    Item13["export c1_1"];
    Item14;
    Item14["export c1_3"];
    Item15;
    Item15["export c2_2"];
    Item10 --> Item6;
    Item10 -.-> Item5;
    Item10 -.-> Item1;
    Item10 -.-> Item4;
    Item10 -.-> Item2;
    Item10 -.-> Item8;
    Item10 -.-> Item3;
    Item10 -.-> Item9;
    Item10 -.-> Item7;
    Item11 --> Item8;
    Item11 --> Item10;
    Item11 -.-> Item5;
    Item11 -.-> Item6;
    Item11 -.-> Item1;
    Item11 -.-> Item4;
    Item11 -.-> Item2;
    Item11 -.-> Item3;
    Item11 -.-> Item9;
    Item11 -.-> Item7;
    Item13 --> Item4;
    Item14 --> Item6;
    Item15 --> Item8;
    Item4 --> Item5;
    Item5 --> Item6;
    Item5 --> Item1;
    Item6 --> Item4;
    Item6 --> Item2;
    Item7 --> Item8;
    Item7 --> Item3;
    Item8 --> Item9;
    Item9 --> Item7;
    Item12 --> Item10;
    Item12 --> Item11;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(2, Normal)]"];
    N1["Items: [ItemId(6, Normal), ItemId(7, Normal), ItemId(8, Normal)]"];
    N2["Items: [ItemId(Export((&quot;c2_2&quot;, #2), &quot;c2_2&quot;))]"];
    N3["Items: [ItemId(1, Normal)]"];
    N4["Items: [ItemId(0, Normal)]"];
    N5["Items: [ItemId(3, Normal), ItemId(4, Normal), ItemId(5, Normal)]"];
    N6["Items: [ItemId(Export((&quot;c1_1&quot;, #2), &quot;c1_1&quot;))]"];
    N7["Items: [ItemId(Export((&quot;c1_3&quot;, #2), &quot;c1_3&quot;))]"];
    N8["Items: [ItemId(9, Normal)]"];
    N9["Items: [ItemId(10, Normal)]"];
    N10["Items: [ItemId(ModuleEvaluation)]"];
    N8 -.-> N5;
    N8 -.-> N4;
    N8 -.-> N3;
    N8 -.-> N1;
    N8 -.-> N0;
    N9 -.-> N1;
    N9 --> N8;
    N9 -.-> N5;
    N9 -.-> N4;
    N9 -.-> N3;
    N9 -.-> N0;
    N6 --> N5;
    N7 --> N5;
    N2 --> N1;
    N5 --> N5;
    N5 --> N4;
    N5 --> N3;
    N1 --> N1;
    N1 --> N0;
    N10 --> N8;
    N10 --> N9;
```
# Entrypoints

```
{
    Export(
        "c2_2",
    ): 2,
    Export(
        "c1_1",
    ): 6,
    Export(
        "c1_3",
    ): 7,
    ModuleEvaluation: 10,
    Exports: 11,
}
```


# Modules (dev)
## Part 0
```js
function d3() {}
export { d3 } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { d3 } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
function c2_1() {
    return c2_2(d3);
}
function c2_2() {
    return c2_3();
}
function c2_3() {
    return c2_1();
}
export { c2_1 } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { c2_2 } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { c2_3 } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import { c2_2 } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
export { c2_2 };

```
## Part 3
```js
function d2() {}
export { d2 } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
function d1() {}
export { d1 } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import { d2 } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import { d1 } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
function c1_1() {
    return c1_2();
}
function c1_2() {
    return c1_3(d1);
}
function c1_3() {
    return c1_1(d2);
}
export { c1_1 } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { c1_2 } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { c1_3 } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 6
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import { c1_1 } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
export { c1_1 };

```
## Part 7
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import { c1_3 } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
export { c1_3 };

```
## Part 8
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { c1_3 } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
c1_3();

```
## Part 9
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { c2_2 } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
c2_2();

```
## Part 10
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
"module evaluation";

```
## Part 11
```js
export { c2_2 } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export c2_2"
};
export { c1_1 } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export c1_1"
};
export { c1_3 } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export c1_3"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
"module evaluation";

```
# Entrypoints

```
{
    Export(
        "c2_2",
    ): 2,
    Export(
        "c1_1",
    ): 6,
    Export(
        "c1_3",
    ): 7,
    ModuleEvaluation: 10,
    Exports: 11,
}
```


# Modules (prod)
## Part 0
```js
function d3() {}
export { d3 } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import { d3 } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
function c2_1() {
    return c2_2(d3);
}
function c2_2() {
    return c2_3();
}
function c2_3() {
    return c2_1();
}
export { c2_1 } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { c2_2 } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { c2_3 } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import { c2_2 } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
export { c2_2 };

```
## Part 3
```js
function d2() {}
export { d2 } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
function d1() {}
export { d1 } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { d2 } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import { d1 } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
function c1_1() {
    return c1_2();
}
function c1_2() {
    return c1_3(d1);
}
function c1_3() {
    return c1_1(d2);
}
export { c1_1 } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { c1_2 } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { c1_3 } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 6
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import { c1_1 } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
export { c1_1 };

```
## Part 7
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import { c1_3 } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
export { c1_3 };

```
## Part 8
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import { c1_3 } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
c1_3();

```
## Part 9
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import { c2_2 } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
c2_2();

```
## Part 10
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
"module evaluation";

```
## Part 11
```js
export { c2_2 } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export c2_2"
};
export { c1_1 } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export c1_1"
};
export { c1_3 } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export c1_3"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
"module evaluation";

```
# Entrypoints

```
{
    Export(
        "c2_2",
    ): 2,
    Export(
        "c1_1",
    ): 6,
    Export(
        "c1_3",
    ): 7,
    ModuleEvaluation: 10,
    Exports: 11,
}
```


## Merged (c1_3)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
export { c1_3 };

```
# Entrypoints

```
{
    Export(
        "c2_2",
    ): 2,
    Export(
        "c1_1",
    ): 6,
    Export(
        "c1_3",
    ): 7,
    ModuleEvaluation: 10,
    Exports: 11,
}
```


## Merged (c1_3,c2_2)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
export { c1_3 };
export { c2_2 };

```
