# Items

Count: 17

## Item 1: Stmt 0, `ImportOfModule`

```js
import { upper } from "module";

```

- Hoisted
- Side effects

## Item 2: Stmt 0, `ImportBinding(0)`

```js
import { upper } from "module";

```

- Hoisted
- Declares: `upper`

## Item 3: Stmt 1, `VarDeclarator(0)`

```js
export let foobar = "foo";

```

- Declares: `foobar`
- Write: `foobar`

## Item 4: Stmt 2, `VarDeclarator(0)`

```js
export const foo = foobar;

```

- Declares: `foo`
- Reads: `foobar`
- Write: `foo`

## Item 5: Stmt 3, `VarDeclarator(0)`

```js
const bar = "bar";

```

- Declares: `bar`
- Write: `bar`

## Item 6: Stmt 4, `Normal`

```js
foobar += bar;

```

- Reads: `bar`, `foobar`
- Write: `foobar`

## Item 7: Stmt 5, `VarDeclarator(0)`

```js
let foobarCopy = foobar;

```

- Declares: `foobarCopy`
- Reads: `foobar`
- Write: `foobarCopy`

## Item 8: Stmt 6, `Normal`

```js
foobar += "foo";

```

- Reads: `foobar`
- Write: `foobar`

## Item 9: Stmt 7, `Normal`

```js
console.log(foobarCopy);

```

- Side effects
- Reads: `foobarCopy`

## Item 10: Stmt 8, `Normal`

```js
foobarCopy += "Unused";

```

- Reads: `foobarCopy`
- Write: `foobarCopy`

## Item 11: Stmt 9, `Normal`

```js
function internal() {
    return upper(foobar);
}

```

- Hoisted
- Declares: `internal`
- Reads (eventual): `upper`, `foobar`
- Write: `internal`

## Item 12: Stmt 10, `Normal`

```js
export function external1() {
    return internal() + foobar;
}

```

- Hoisted
- Declares: `external1`
- Reads (eventual): `internal`, `foobar`
- Write: `external1`

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
    Item13;
    Item14;
    Item14["export foobar"];
    Item15;
    Item15["export foo"];
    Item16;
    Item16["export external1"];
    Item17;
    Item17["export external2"];
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
    Item13;
    Item14;
    Item14["export foobar"];
    Item15;
    Item15["export foo"];
    Item16;
    Item16["export external1"];
    Item17;
    Item17["export external2"];
    Item4 --> Item3;
    Item6 --> Item5;
    Item6 --> Item3;
    Item6 -.-> Item4;
    Item7 --> Item6;
    Item7 --> Item3;
    Item8 --> Item6;
    Item8 --> Item3;
    Item8 -.-> Item7;
    Item9 --> Item7;
    Item9 --> Item1;
    Item9 -.-> Item2;
    Item9 --> Item8;
    Item9 -.-> Item11;
    Item10 --> Item7;
    Item10 -.-> Item9;
    Item14 --> Item8;
    Item14 --> Item3;
    Item15 --> Item4;
    Item16 --> Item12;
    Item17 --> Item13;
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
    Item13;
    Item14;
    Item14["export foobar"];
    Item15;
    Item15["export foo"];
    Item16;
    Item16["export external1"];
    Item17;
    Item17["export external2"];
    Item4 --> Item3;
    Item6 --> Item5;
    Item6 --> Item3;
    Item6 -.-> Item4;
    Item7 --> Item6;
    Item7 --> Item3;
    Item8 --> Item6;
    Item8 --> Item3;
    Item8 -.-> Item7;
    Item9 --> Item7;
    Item9 --> Item1;
    Item9 -.-> Item2;
    Item9 --> Item8;
    Item9 -.-> Item11;
    Item10 --> Item7;
    Item10 -.-> Item9;
    Item14 --> Item8;
    Item14 --> Item3;
    Item15 --> Item4;
    Item16 --> Item12;
    Item17 --> Item13;
    Item11 --> Item2;
    Item11 --> Item8;
    Item11 --> Item3;
    Item12 --> Item11;
    Item12 --> Item8;
    Item12 --> Item3;
    Item13 -.-> Item14;
    Item13 --> Item3;
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
    Item13;
    Item14;
    Item14["export foobar"];
    Item15;
    Item15["export foo"];
    Item16;
    Item16["export external1"];
    Item17;
    Item17["export external2"];
    Item4 --> Item3;
    Item6 --> Item5;
    Item6 --> Item3;
    Item6 -.-> Item4;
    Item7 --> Item6;
    Item7 --> Item3;
    Item8 --> Item6;
    Item8 --> Item3;
    Item8 -.-> Item7;
    Item9 --> Item7;
    Item9 --> Item1;
    Item9 -.-> Item2;
    Item9 --> Item8;
    Item9 -.-> Item11;
    Item10 --> Item7;
    Item10 -.-> Item9;
    Item14 --> Item8;
    Item14 --> Item3;
    Item15 --> Item4;
    Item16 --> Item12;
    Item17 --> Item13;
    Item11 --> Item2;
    Item11 --> Item8;
    Item11 --> Item3;
    Item12 --> Item11;
    Item12 --> Item8;
    Item12 --> Item3;
    Item13 -.-> Item14;
    Item13 --> Item3;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(0, ImportOfModule)]"];
    N1["Items: [ItemId(0, ImportBinding(0))]"];
    N2["Items: [ItemId(1, VarDeclarator(0)), ItemId(2, VarDeclarator(0)), ItemId(3, VarDeclarator(0)), ItemId(4, Normal), ItemId(5, VarDeclarator(0)), ItemId(6, Normal)]"];
    N3["Items: [ItemId(7, Normal), ItemId(8, Normal)]"];
    N4["Items: [ItemId(9, Normal)]"];
    N5["Items: [ItemId(10, Normal), ItemId(Export((&quot;external1&quot;, #2), &quot;external1&quot;))]"];
    N6["Items: [ItemId(11, Normal), ItemId(Export((&quot;external2&quot;, #2), &quot;external2&quot;)), ItemId(Export((&quot;foobar&quot;, #2), &quot;foobar&quot;))]"];
    N7["Items: [ItemId(Export((&quot;foo&quot;, #2), &quot;foo&quot;))]"];
    N4 --> N1;
    N4 --> N2;
    N5 --> N4;
    N3 --> N0;
    N3 -.-> N1;
    N1 --> N0;
    N5 --> N2;
    N3 --> N2;
    N3 -.-> N4;
```
# Entrypoints

```
{
    ModuleEvaluation: 3,
    Export(
        "external1",
    ): 5,
    Export(
        "external2",
    ): 6,
    Export(
        "foo",
    ): 7,
    Export(
        "foobar",
    ): 6,
    Exports: 8,
}
```


# Modules (dev)
## Part 0
```js
import "module";

```
## Part 1
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};

```
## Part 2
```js
let foobar = "foo";
const foo = foobar;
const bar = "bar";
foobar += bar;
let foobarCopy = foobar;
foobar += "foo";
export { foobar as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { foo as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { bar as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { foobarCopy as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
import { d as foobarCopy } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -2
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
console.log(foobarCopy);
foobarCopy += "Unused";
export { };

```
## Part 4
```js
import { a as foobar } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { upper } from "module";
function internal() {
    return upper(foobar);
}
export { internal as e } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import { a as foobar } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -2
};
import { e as internal } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -4
};
function external1() {
    return internal() + foobar;
}
export { external1 };
export { external1 as f } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 6
```js
import { a as foobar } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -2
};
function external2() {
    foobar += ".";
}
export { external2 };
export { foobar };
export { external2 as g } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 7
```js
import { b as foo } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -2
};
export { foo };

```
## Part 8
```js
export { external1 } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export external1"
};
export { external2 } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export external2"
};
export { foobar } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export foobar"
};
export { foo } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export foo"
};

```
## Merged (module eval)
```js
import { d as foobarCopy } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -2
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
console.log(foobarCopy);
foobarCopy += "Unused";
export { };

```
# Entrypoints

```
{
    ModuleEvaluation: 5,
    Export(
        "external1",
    ): 7,
    Export(
        "external2",
    ): 8,
    Export(
        "foo",
    ): 3,
    Export(
        "foobar",
    ): 9,
    Exports: 10,
}
```


# Modules (prod)
## Part 0
```js
import "module";

```
## Part 1
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};

```
## Part 2
```js
let foobar = "foo";
const bar = "bar";
foobar += bar;
let foobarCopy = foobar;
export { foobar as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { bar as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { foobarCopy as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
import { a as foobar } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -2
};
const foo = foobar;
export { foo };
export { foo as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
import { a as foobar } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -2
};
foobar += "foo";

```
## Part 5
```js
import { c as foobarCopy } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
console.log(foobarCopy);
export { };

```
## Part 6
```js
import { c as foobarCopy } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -2
};
foobarCopy += "Unused";

```
## Part 7
```js
import { a as foobar } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { upper } from "module";
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
function internal() {
    return upper(foobar);
}
function external1() {
    return internal() + foobar;
}
export { external1 };
export { internal as e } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { external1 as f } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 8
```js
import { a as foobar } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -2
};
function external2() {
    foobar += ".";
}
export { external2 };
export { external2 as g } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 9
```js
import { a as foobar } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
export { foobar };

```
## Part 10
```js
export { foo } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export foo"
};
export { external1 } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export external1"
};
export { external2 } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export external2"
};
export { foobar } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export foobar"
};

```
## Merged (module eval)
```js
import { c as foobarCopy } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
console.log(foobarCopy);
export { };

```
