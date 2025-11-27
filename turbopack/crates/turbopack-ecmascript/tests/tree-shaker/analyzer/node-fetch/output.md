# Items

Count: 6

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
    Item6["export default"];
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
    Item6["export default"];
    Item3 --> Item2;
    Item3 --> Item1;
    Item5 --> Item4;
    Item5 --> Item3;
    Item6 --> Item5;
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
    Item6["export default"];
    Item3 --> Item2;
    Item3 --> Item1;
    Item5 --> Item4;
    Item5 --> Item3;
    Item6 --> Item5;
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
    Item6["export default"];
    Item3 --> Item2;
    Item3 --> Item1;
    Item5 --> Item4;
    Item5 --> Item3;
    Item6 --> Item5;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(0, ImportOfModule)]"];
    N1["Items: [ItemId(0, ImportBinding(0))]"];
    N2["Items: [ItemId(1, VarDeclarator(0)), ItemId(2, Normal), ItemId(3, Normal), ItemId(Export((&quot;__TURBOPACK__default__export__&quot;, #0), &quot;default&quot;))]"];
    N1 --> N0;
```
# Entrypoints

```
{
    ModuleEvaluation: 2,
    Export(
        "default",
    ): 2,
    Exports: 3,
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

```
## Part 2
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import Stream from 'node:stream';
const streamDestructionSupported = 'destroy' in Stream.Readable.prototype;
function fetch() {}
const __TURBOPACK__default__export__ = fetch;
export { __TURBOPACK__default__export__ as default };
export { streamDestructionSupported as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { fetch as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { __TURBOPACK__default__export__ as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { };

```
## Part 3
```js
export { default } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export default"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import Stream from 'node:stream';
const streamDestructionSupported = 'destroy' in Stream.Readable.prototype;
function fetch() {}
const __TURBOPACK__default__export__ = fetch;
export { __TURBOPACK__default__export__ as default };
export { streamDestructionSupported as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { fetch as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { __TURBOPACK__default__export__ as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { };

```
# Entrypoints

```
{
    ModuleEvaluation: 2,
    Export(
        "default",
    ): 2,
    Exports: 3,
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

```
## Part 2
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import Stream from 'node:stream';
const streamDestructionSupported = 'destroy' in Stream.Readable.prototype;
function fetch() {}
const __TURBOPACK__default__export__ = fetch;
export { __TURBOPACK__default__export__ as default };
export { streamDestructionSupported as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { fetch as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { __TURBOPACK__default__export__ as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { };

```
## Part 3
```js
export { default } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export default"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import Stream from 'node:stream';
const streamDestructionSupported = 'destroy' in Stream.Readable.prototype;
function fetch() {}
const __TURBOPACK__default__export__ = fetch;
export { __TURBOPACK__default__export__ as default };
export { streamDestructionSupported as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { fetch as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { __TURBOPACK__default__export__ as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { };

```
