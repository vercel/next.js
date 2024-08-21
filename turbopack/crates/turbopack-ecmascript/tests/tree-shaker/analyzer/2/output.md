# Items

Count: 19

## Item 1: Stmt 0, `Normal`

```js
export function external1() {
    return internal() + foobar;
}

```

- Hoisted
- Declares: `external1`
- Reads (eventual): `internal`, `foobar`
- Write: `external1`

## Item 2: Stmt 1, `ImportOfModule`

```js
import { upper } from "module";

```

- Hoisted
- Side effects

## Item 3: Stmt 1, `ImportBinding(0)`

```js
import { upper } from "module";

```

- Hoisted
- Declares: `upper`

## Item 4: Stmt 2, `VarDeclarator(0)`

```js
export let foobar = "foo";

```

- Declares: `foobar`
- Write: `foobar`

## Item 5: Stmt 3, `VarDeclarator(0)`

```js
export const foo = foobar;

```

- Declares: `foo`
- Reads: `foobar`
- Write: `foo`

## Item 6: Stmt 4, `VarDeclarator(0)`

```js
const bar = "bar";

```

- Declares: `bar`
- Write: `bar`

## Item 7: Stmt 5, `Normal`

```js
foobar += bar;

```

- Reads: `bar`, `foobar`
- Write: `foobar`

## Item 8: Stmt 6, `VarDeclarator(0)`

```js
let foobarCopy = foobar;

```

- Declares: `foobarCopy`
- Reads: `foobar`
- Write: `foobarCopy`

## Item 9: Stmt 7, `Normal`

```js
foobar += "foo";

```

- Reads: `foobar`
- Write: `foobar`

## Item 10: Stmt 8, `Normal`

```js
console.log(foobarCopy);

```

- Side effects
- Reads: `foobarCopy`

## Item 11: Stmt 9, `Normal`

```js
foobarCopy += "Unused";

```

- Reads: `foobarCopy`
- Write: `foobarCopy`

## Item 12: Stmt 10, `Normal`

```js
function internal() {
    return upper(foobar);
}

```

- Hoisted
- Declares: `internal`
- Reads (eventual): `upper`, `foobar`
- Write: `internal`

## Item 13: Stmt 11, `Normal`

```js
export function external2() {
    foobar += ".";
}

```

- Hoisted
- Declares: `external2`
- Write: `external2`
- Write (eventual): `foobar`

## Item 14: Stmt 12, `ImportOfModule`

```js
import "other";

```

- Hoisted
- Side effects

# Phase 1
```mermaid
graph TD
    Item3;
    Item1;
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
    Item2;
    Item15;
    Item15["ModuleEvaluation"];
    Item16;
    Item16["export external1"];
    Item17;
    Item17["export foobar"];
    Item18;
    Item18["export foo"];
    Item19;
    Item19["export external2"];
    Item2 --> Item1;
```
# Phase 2
```mermaid
graph TD
    Item3;
    Item1;
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
    Item2;
    Item15;
    Item15["ModuleEvaluation"];
    Item16;
    Item16["export external1"];
    Item17;
    Item17["export foobar"];
    Item18;
    Item18["export foo"];
    Item19;
    Item19["export external2"];
    Item2 --> Item1;
    Item6 --> Item5;
    Item8 --> Item7;
    Item8 --> Item5;
    Item8 -.-> Item6;
    Item9 --> Item8;
    Item9 --> Item5;
    Item10 --> Item8;
    Item10 --> Item5;
    Item10 -.-> Item6;
    Item10 -.-> Item9;
    Item11 --> Item9;
    Item11 --> Item1;
    Item11 --> Item2;
    Item11 -.-> Item13;
    Item11 -.-> Item10;
    Item11 -.-> Item6;
    Item11 -.-> Item4;
    Item12 --> Item9;
    Item12 -.-> Item11;
    Item16 --> Item3;
    Item17 --> Item10;
    Item17 --> Item5;
    Item18 --> Item6;
    Item19 --> Item14;
```
# Phase 3
```mermaid
graph TD
    Item3;
    Item1;
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
    Item2;
    Item15;
    Item15["ModuleEvaluation"];
    Item16;
    Item16["export external1"];
    Item17;
    Item17["export foobar"];
    Item18;
    Item18["export foo"];
    Item19;
    Item19["export external2"];
    Item2 --> Item1;
    Item6 --> Item5;
    Item8 --> Item7;
    Item8 --> Item5;
    Item8 -.-> Item6;
    Item9 --> Item8;
    Item9 --> Item5;
    Item10 --> Item8;
    Item10 --> Item5;
    Item10 -.-> Item6;
    Item10 -.-> Item9;
    Item11 --> Item9;
    Item11 --> Item1;
    Item11 --> Item2;
    Item11 -.-> Item13;
    Item11 -.-> Item10;
    Item11 -.-> Item6;
    Item11 -.-> Item4;
    Item12 --> Item9;
    Item12 -.-> Item11;
    Item16 --> Item3;
    Item17 --> Item10;
    Item17 --> Item5;
    Item18 --> Item6;
    Item19 --> Item14;
    Item3 --> Item13;
    Item3 --> Item10;
    Item3 --> Item5;
    Item13 --> Item4;
    Item13 --> Item10;
    Item13 --> Item5;
    Item14 -.-> Item6;
    Item14 -.-> Item9;
    Item14 -.-> Item17;
    Item14 --> Item5;
```
# Phase 4
```mermaid
graph TD
    Item3;
    Item1;
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
    Item2;
    Item15;
    Item15["ModuleEvaluation"];
    Item16;
    Item16["export external1"];
    Item17;
    Item17["export foobar"];
    Item18;
    Item18["export foo"];
    Item19;
    Item19["export external2"];
    Item2 --> Item1;
    Item6 --> Item5;
    Item8 --> Item7;
    Item8 --> Item5;
    Item8 -.-> Item6;
    Item9 --> Item8;
    Item9 --> Item5;
    Item10 --> Item8;
    Item10 --> Item5;
    Item10 -.-> Item6;
    Item10 -.-> Item9;
    Item11 --> Item9;
    Item11 --> Item1;
    Item11 --> Item2;
    Item11 -.-> Item13;
    Item11 -.-> Item10;
    Item11 -.-> Item6;
    Item11 -.-> Item4;
    Item12 --> Item9;
    Item12 -.-> Item11;
    Item16 --> Item3;
    Item17 --> Item10;
    Item17 --> Item5;
    Item18 --> Item6;
    Item19 --> Item14;
    Item3 --> Item13;
    Item3 --> Item10;
    Item3 --> Item5;
    Item13 --> Item4;
    Item13 --> Item10;
    Item13 --> Item5;
    Item14 -.-> Item6;
    Item14 -.-> Item9;
    Item14 -.-> Item17;
    Item14 --> Item5;
    Item15 --> Item1;
    Item15 --> Item2;
    Item15 --> Item11;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(1, ImportBinding(0))]"];
    N1["Items: [ItemId(4, VarDeclarator(0))]"];
    N2["Items: [ItemId(2, VarDeclarator(0))]"];
    N3["Items: [ItemId(3, VarDeclarator(0))]"];
    N4["Items: [ItemId(Export((&quot;foo&quot;, #2), &quot;foo&quot;))]"];
    N5["Items: [ItemId(5, Normal)]"];
    N6["Items: [ItemId(6, VarDeclarator(0))]"];
    N7["Items: [ItemId(7, Normal)]"];
    N8["Items: [ItemId(10, Normal)]"];
    N9["Items: [ItemId(0, Normal)]"];
    N10["Items: [ItemId(Export((&quot;external1&quot;, #2), &quot;external1&quot;))]"];
    N11["Items: [ItemId(Export((&quot;foobar&quot;, #2), &quot;foobar&quot;))]"];
    N12["Items: [ItemId(11, Normal)]"];
    N13["Items: [ItemId(Export((&quot;external2&quot;, #2), &quot;external2&quot;))]"];
    N14["Items: [ItemId(1, ImportOfModule)]"];
    N15["Items: [ItemId(12, ImportOfModule)]"];
    N16["Items: [ItemId(8, Normal)]"];
    N17["Items: [ItemId(ModuleEvaluation)]"];
    N18["Items: [ItemId(9, Normal)]"];
    N15 --> N14;
    N3 --> N2;
    N5 --> N1;
    N5 --> N2;
    N5 -.-> N3;
    N6 --> N5;
    N6 --> N2;
    N7 --> N5;
    N7 --> N2;
    N7 -.-> N3;
    N7 -.-> N6;
    N16 --> N6;
    N16 --> N14;
    N16 --> N15;
    N16 -.-> N8;
    N16 -.-> N7;
    N16 -.-> N3;
    N16 -.-> N0;
    N18 --> N6;
    N18 -.-> N16;
    N10 --> N9;
    N11 --> N7;
    N11 --> N2;
    N4 --> N3;
    N13 --> N12;
    N9 --> N8;
    N9 --> N7;
    N9 --> N2;
    N8 --> N0;
    N8 --> N7;
    N8 --> N2;
    N12 -.-> N3;
    N12 -.-> N6;
    N12 -.-> N11;
    N12 --> N2;
    N17 --> N14;
    N17 --> N15;
    N17 --> N16;
```
# Entrypoints

```
{
    ModuleEvaluation: 17,
    Export(
        "external1",
    ): 10,
    Exports: 19,
    Export(
        "foo",
    ): 4,
    Export(
        "foobar",
    ): 11,
    Export(
        "external2",
    ): 13,
}
```


# Modules (dev)
## Part 0
```js
import { upper } from "module";
export { upper } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
const bar = "bar";
export { bar } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
let foobar = "foo";
export { foobar } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { foobar } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
const foo = foobar;
export { foo } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import { foo } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
export { foo };

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
    __turbopack_part__: 3
};
import { bar } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import { foobar } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
foobar += bar;

```
## Part 6
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { foobar } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
let foobarCopy = foobar;
export { foobarCopy } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 7
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import { foobar } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
foobar += "foo";

```
## Part 8
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { foobar } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { upper } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
function internal() {
    return upper(foobar);
}
export { internal } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 9
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { foobar } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { internal } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
function external1() {
    return internal() + foobar;
}
export { external1 } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 10
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import { external1 } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
export { external1 };

```
## Part 11
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { foobar } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
export { foobar };

```
## Part 12
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { foobar } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
function external2() {
    foobar += ".";
}
export { external2 } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 13
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import { external2 } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
export { external2 };

```
## Part 14
```js
import "module";

```
## Part 15
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "other";

```
## Part 16
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 15
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { foobarCopy } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
console.log(foobarCopy);

```
## Part 17
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 15
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
"module evaluation";

```
## Part 18
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
import { foobarCopy } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
foobarCopy += "Unused";

```
## Part 19
```js
export { foo } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export foo"
};
export { external1 } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export external1"
};
export { foobar } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export foobar"
};
export { external2 } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export external2"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 15
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
"module evaluation";

```
# Entrypoints

```
{
    ModuleEvaluation: 18,
    Export(
        "external1",
    ): 10,
    Exports: 19,
    Export(
        "foo",
    ): 14,
    Export(
        "foobar",
    ): 7,
    Export(
        "external2",
    ): 4,
}
```


# Modules (prod)
## Part 0
```js
import { upper } from "module";
export { upper } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
const bar = "bar";
export { bar } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
let foobar = "foo";
export { foobar } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { foobar } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
function external2() {
    foobar += ".";
}
export { external2 } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import { external2 } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
export { external2 };

```
## Part 5
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { bar } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import { foobar } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
foobar += bar;

```
## Part 6
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { foobar } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
foobar += "foo";

```
## Part 7
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { foobar } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
export { foobar };

```
## Part 8
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
import { foobar } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { upper } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
function internal() {
    return upper(foobar);
}
export { internal } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 9
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import { foobar } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { internal } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
function external1() {
    return internal() + foobar;
}
export { external1 } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 10
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import { external1 } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
export { external1 };

```
## Part 11
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { foobar } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
let foobarCopy = foobar;
export { foobarCopy } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 12
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import { foobarCopy } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
foobarCopy += "Unused";

```
## Part 13
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { foobar } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
const foo = foobar;
export { foo } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 14
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
import { foo } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
export { foo };

```
## Part 15
```js
import "module";

```
## Part 16
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 15
};
import "other";

```
## Part 17
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 15
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
import { foobarCopy } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
console.log(foobarCopy);

```
## Part 18
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 17
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 15
};
"module evaluation";

```
## Part 19
```js
export { external2 } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export external2"
};
export { foobar } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export foobar"
};
export { external1 } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export external1"
};
export { foo } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export foo"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 17
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 15
};
"module evaluation";

```
