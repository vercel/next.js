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
    Item5 --> Item3;
    Item7 --> Item5;
    Item6 --> Item5;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(0, ImportOfModule)]"];
    N1["Items: [ItemId(0, ImportBinding(0))]"];
    N2["Items: [ItemId(1, VarDeclarator(0)), ItemId(2, Normal), ItemId(3, Normal)]"];
    N3["Items: [ItemId(ModuleEvaluation)]"];
    N4["Items: [ItemId(Export((&quot;__TURBOPACK__default__export__&quot;, #4), &quot;default&quot;))]"];
    N2 --> N0;
    N2 --> N1;
    N3 --> N2;
    N1 --> N0;
    N4 --> N2;
```
# Entrypoints

```
{
    ModuleEvaluation: 3,
    Export(
        "default",
    ): 4,
    Exports: 5,
}
```


# Modules (dev)
## Part 0
```js
import 'node:stream';

```
## Part 1
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import Stream from 'node:stream';
export { Stream as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import Stream from 'node:stream';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
const streamDestructionSupported = 'destroy' in Stream.Readable.prototype;
function fetch() {}
const __TURBOPACK__default__export__ = fetch;
export { streamDestructionSupported as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { fetch as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { __TURBOPACK__default__export__ as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
"module evaluation";

```
## Part 4
```js
import { d as __TURBOPACK__default__export__ } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -2
};
export { __TURBOPACK__default__export__ as default };

```
## Part 5
```js
export { default } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export default"
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
    ModuleEvaluation: 3,
    Export(
        "default",
    ): 4,
    Exports: 5,
}
```


# Modules (prod)
## Part 0
```js
import 'node:stream';

```
## Part 1
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import Stream from 'node:stream';
export { Stream as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import Stream from 'node:stream';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
const streamDestructionSupported = 'destroy' in Stream.Readable.prototype;
function fetch() {}
const __TURBOPACK__default__export__ = fetch;
export { streamDestructionSupported as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { fetch as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { __TURBOPACK__default__export__ as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
"module evaluation";

```
## Part 4
```js
import { d as __TURBOPACK__default__export__ } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -2
};
export { __TURBOPACK__default__export__ as default };

```
## Part 5
```js
export { default } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export default"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
"module evaluation";

```
