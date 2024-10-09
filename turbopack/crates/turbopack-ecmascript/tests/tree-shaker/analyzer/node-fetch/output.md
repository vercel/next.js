# Items

Count: 7

## Item 1: Stmt 0, `ImportOfModule`

```js
import Stream from 'node:stream';

```

- Hoisted
- Side effects

## Item 2: Stmt 0, `ImportBinding(0)`

```js
import Stream from 'node:stream';

```

- Hoisted
- Declares: `Stream`

## Item 3: Stmt 1, `VarDeclarator(0)`

```js
const streamDestructionSupported = 'destroy' in Stream.Readable.prototype;

```

- Side effects
- Declares: `streamDestructionSupported`
- Reads: `Stream`
- Write: `Stream`, `streamDestructionSupported`

## Item 4: Stmt 2, `Normal`

```js
function fetch() {}

```

- Hoisted
- Declares: `fetch`
- Write: `fetch`

## Item 5: Stmt 3, `Normal`

```js
export default fetch;

```

- Side effects
- Declares: `__TURBOPACK__default__export__`
- Reads: `fetch`
- Write: `__TURBOPACK__default__export__`

# Phase 1
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item4;
    Item5;
    Item6;
    Item6["ModuleEvaluation"];
    Item7;
    Item7["export default"];
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
    Item6["ModuleEvaluation"];
    Item7;
    Item7["export default"];
    Item3 --> Item2;
    Item3 --> Item1;
    Item5 --> Item4;
    Item5 --> Item1;
    Item5 --> Item3;
    Item7 --> Item5;
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
    Item6["ModuleEvaluation"];
    Item7;
    Item7["export default"];
    Item3 --> Item2;
    Item3 --> Item1;
    Item5 --> Item4;
    Item5 --> Item1;
    Item5 --> Item3;
    Item7 --> Item5;
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
    Item6["ModuleEvaluation"];
    Item7;
    Item7["export default"];
    Item3 --> Item2;
    Item3 --> Item1;
    Item5 --> Item4;
    Item5 --> Item1;
    Item5 --> Item3;
    Item7 --> Item5;
    Item6 --> Item1;
    Item6 --> Item3;
    Item6 --> Item5;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(2, Normal)]"];
    N1["Items: [ItemId(0, ImportOfModule)]"];
    N2["Items: [ItemId(0, ImportBinding(0))]"];
    N3["Items: [ItemId(1, VarDeclarator(0))]"];
    N4["Items: [ItemId(3, Normal)]"];
    N5["Items: [ItemId(ModuleEvaluation)]"];
    N6["Items: [ItemId(Export((&quot;__TURBOPACK__default__export__&quot;, #4), &quot;default&quot;))]"];
    N3 --> N2;
    N3 --> N1;
    N4 --> N0;
    N4 --> N1;
    N4 --> N3;
    N6 --> N4;
    N5 --> N1;
    N5 --> N3;
    N5 --> N4;
```
# Entrypoints

```
{
    ModuleEvaluation: 5,
    Export(
        "default",
    ): 6,
    Exports: 7,
}
```


# Modules (dev)
## Part 0
```js
function fetch() {}
export { fetch as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
import 'node:stream';

```
## Part 2
```js
import Stream from 'node:stream';
export { Stream as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
import { b as Stream } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
const streamDestructionSupported = 'destroy' in Stream.Readable.prototype;
export { streamDestructionSupported as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
import { a as fetch } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
const __TURBOPACK__default__export__ = fetch;
export { __TURBOPACK__default__export__ as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
"module evaluation";

```
## Part 6
```js
import { d as __TURBOPACK__default__export__ } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -4
};
export { __TURBOPACK__default__export__ as default };

```
## Part 7
```js
export { default } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export default"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
"module evaluation";

```
# Entrypoints

```
{
    ModuleEvaluation: 5,
    Export(
        "default",
    ): 6,
    Exports: 7,
}
```


# Modules (prod)
## Part 0
```js
function fetch() {}
export { fetch as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
import 'node:stream';

```
## Part 2
```js
import Stream from 'node:stream';
export { Stream as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
import { b as Stream } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
const streamDestructionSupported = 'destroy' in Stream.Readable.prototype;
export { streamDestructionSupported as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
import { a as fetch } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
const __TURBOPACK__default__export__ = fetch;
export { __TURBOPACK__default__export__ as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
"module evaluation";

```
## Part 6
```js
import { d as __TURBOPACK__default__export__ } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -4
};
export { __TURBOPACK__default__export__ as default };

```
## Part 7
```js
export { default } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export default"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
"module evaluation";

```
