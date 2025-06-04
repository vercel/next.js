# Items

Count: 7

## Item 1: Stmt 0, `VarDeclarator(0)`

```js
let clientComponentLoadStart = 0;

```

- Declares: `clientComponentLoadStart`
- Write: `clientComponentLoadStart`

## Item 2: Stmt 1, `VarDeclarator(0)`

```js
let clientComponentLoadTimes = 0;

```

- Declares: `clientComponentLoadTimes`
- Write: `clientComponentLoadTimes`

## Item 3: Stmt 2, `VarDeclarator(0)`

```js
let clientComponentLoadCount = 0;

```

- Declares: `clientComponentLoadCount`
- Write: `clientComponentLoadCount`

## Item 4: Stmt 3, `Normal`

```js
export function wrapClientComponentLoader(ComponentMod) {
    if (!('performance' in globalThis)) {
        return ComponentMod.__next_app__;
    }
    return {
        require: (...args)=>{
            if (clientComponentLoadStart === 0) {
                clientComponentLoadStart = performance.now();
            }
            const startTime = performance.now();
            try {
                clientComponentLoadCount += 1;
                return ComponentMod.__next_app__.require(...args);
            } finally{
                clientComponentLoadTimes += performance.now() - startTime;
            }
        },
        loadChunk: (...args)=>{
            const startTime = performance.now();
            try {
                clientComponentLoadCount += 1;
                return ComponentMod.__next_app__.loadChunk(...args);
            } finally{
                clientComponentLoadTimes += performance.now() - startTime;
            }
        }
    };
}

```

- Hoisted
- Declares: `wrapClientComponentLoader`
- Reads (eventual): `clientComponentLoadStart`
- Write: `wrapClientComponentLoader`
- Write (eventual): `clientComponentLoadStart`, `clientComponentLoadCount`, `clientComponentLoadTimes`

## Item 5: Stmt 4, `Normal`

```js
export function getClientComponentLoaderMetrics(options = {}) {
    const metrics = clientComponentLoadStart === 0 ? undefined : {
        clientComponentLoadStart,
        clientComponentLoadTimes,
        clientComponentLoadCount
    };
    if (options.reset) {
        clientComponentLoadStart = 0;
        clientComponentLoadTimes = 0;
        clientComponentLoadCount = 0;
    }
    return metrics;
}

```

- Hoisted
- Declares: `getClientComponentLoaderMetrics`
- Reads (eventual): `clientComponentLoadStart`, `clientComponentLoadTimes`, `clientComponentLoadCount`
- Write: `getClientComponentLoaderMetrics`
- Write (eventual): `clientComponentLoadStart`, `clientComponentLoadTimes`, `clientComponentLoadCount`

# Phase 1
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item4;
    Item5;
    Item6;
    Item6["export wrapClientComponentLoader"];
    Item7;
    Item7["export getClientComponentLoaderMetrics"];
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
    Item6["export wrapClientComponentLoader"];
    Item7;
    Item7["export getClientComponentLoaderMetrics"];
    Item6 --> Item4;
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
    Item6["export wrapClientComponentLoader"];
    Item7;
    Item7["export getClientComponentLoaderMetrics"];
    Item6 --> Item4;
    Item7 --> Item5;
    Item4 --> Item1;
    Item4 --> Item3;
    Item4 --> Item2;
    Item5 --> Item1;
    Item5 --> Item2;
    Item5 --> Item3;
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
    Item6["export wrapClientComponentLoader"];
    Item7;
    Item7["export getClientComponentLoaderMetrics"];
    Item6 --> Item4;
    Item7 --> Item5;
    Item4 --> Item1;
    Item4 --> Item3;
    Item4 --> Item2;
    Item5 --> Item1;
    Item5 --> Item2;
    Item5 --> Item3;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(0, VarDeclarator(0))]"];
    N1["Items: [ItemId(1, VarDeclarator(0))]"];
    N2["Items: [ItemId(2, VarDeclarator(0))]"];
    N3["Items: [ItemId(3, Normal), ItemId(Export((&quot;wrapClientComponentLoader&quot;, #2), &quot;wrapClientComponentLoader&quot;))]"];
    N4["Items: [ItemId(4, Normal), ItemId(Export((&quot;getClientComponentLoaderMetrics&quot;, #2), &quot;getClientComponentLoaderMetrics&quot;))]"];
    N4 --> N0;
    N4 --> N2;
    N3 --> N1;
    N3 --> N2;
    N3 --> N0;
    N4 --> N1;
```
# Entrypoints

```
{
    ModuleEvaluation: 6,
    Export(
        "getClientComponentLoaderMetrics",
    ): 4,
    Export(
        "wrapClientComponentLoader",
    ): 3,
    Exports: 5,
}
```


# Modules (dev)
## Part 0
```js
let clientComponentLoadStart = 0;
export { clientComponentLoadStart as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
let clientComponentLoadTimes = 0;
export { clientComponentLoadTimes as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
let clientComponentLoadCount = 0;
export { clientComponentLoadCount as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
import { b as clientComponentLoadTimes } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -1
};
import { a as clientComponentLoadStart } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
import { c as clientComponentLoadCount } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -2
};
function wrapClientComponentLoader(ComponentMod) {
    if (!('performance' in globalThis)) {
        return ComponentMod.__next_app__;
    }
    return {
        require: (...args)=>{
            if (clientComponentLoadStart === 0) {
                clientComponentLoadStart = performance.now();
            }
            const startTime = performance.now();
            try {
                clientComponentLoadCount += 1;
                return ComponentMod.__next_app__.require(...args);
            } finally{
                clientComponentLoadTimes += performance.now() - startTime;
            }
        },
        loadChunk: (...args)=>{
            const startTime = performance.now();
            try {
                clientComponentLoadCount += 1;
                return ComponentMod.__next_app__.loadChunk(...args);
            } finally{
                clientComponentLoadTimes += performance.now() - startTime;
            }
        }
    };
}
export { wrapClientComponentLoader };
export { wrapClientComponentLoader as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
import { c as clientComponentLoadCount } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -2
};
import { a as clientComponentLoadStart } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
import { b as clientComponentLoadTimes } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -1
};
function getClientComponentLoaderMetrics(options = {}) {
    const metrics = clientComponentLoadStart === 0 ? undefined : {
        clientComponentLoadStart,
        clientComponentLoadTimes,
        clientComponentLoadCount
    };
    if (options.reset) {
        clientComponentLoadStart = 0;
        clientComponentLoadTimes = 0;
        clientComponentLoadCount = 0;
    }
    return metrics;
}
export { getClientComponentLoaderMetrics };
export { getClientComponentLoaderMetrics as e } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
export { wrapClientComponentLoader } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export wrapClientComponentLoader"
};
export { getClientComponentLoaderMetrics } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export getClientComponentLoaderMetrics"
};

```
## Part 6
```js
export { };

```
## Merged (module eval)
```js
export { };

```
# Entrypoints

```
{
    ModuleEvaluation: 6,
    Export(
        "getClientComponentLoaderMetrics",
    ): 4,
    Export(
        "wrapClientComponentLoader",
    ): 3,
    Exports: 5,
}
```


# Modules (prod)
## Part 0
```js
let clientComponentLoadStart = 0;
export { clientComponentLoadStart as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
let clientComponentLoadTimes = 0;
export { clientComponentLoadTimes as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
let clientComponentLoadCount = 0;
export { clientComponentLoadCount as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
import { b as clientComponentLoadTimes } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -1
};
import { a as clientComponentLoadStart } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
import { c as clientComponentLoadCount } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -2
};
function wrapClientComponentLoader(ComponentMod) {
    if (!('performance' in globalThis)) {
        return ComponentMod.__next_app__;
    }
    return {
        require: (...args)=>{
            if (clientComponentLoadStart === 0) {
                clientComponentLoadStart = performance.now();
            }
            const startTime = performance.now();
            try {
                clientComponentLoadCount += 1;
                return ComponentMod.__next_app__.require(...args);
            } finally{
                clientComponentLoadTimes += performance.now() - startTime;
            }
        },
        loadChunk: (...args)=>{
            const startTime = performance.now();
            try {
                clientComponentLoadCount += 1;
                return ComponentMod.__next_app__.loadChunk(...args);
            } finally{
                clientComponentLoadTimes += performance.now() - startTime;
            }
        }
    };
}
export { wrapClientComponentLoader };
export { wrapClientComponentLoader as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
import { c as clientComponentLoadCount } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -2
};
import { a as clientComponentLoadStart } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
import { b as clientComponentLoadTimes } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -1
};
function getClientComponentLoaderMetrics(options = {}) {
    const metrics = clientComponentLoadStart === 0 ? undefined : {
        clientComponentLoadStart,
        clientComponentLoadTimes,
        clientComponentLoadCount
    };
    if (options.reset) {
        clientComponentLoadStart = 0;
        clientComponentLoadTimes = 0;
        clientComponentLoadCount = 0;
    }
    return metrics;
}
export { getClientComponentLoaderMetrics };
export { getClientComponentLoaderMetrics as e } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
export { wrapClientComponentLoader } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export wrapClientComponentLoader"
};
export { getClientComponentLoaderMetrics } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export getClientComponentLoaderMetrics"
};

```
## Part 6
```js
export { };

```
## Merged (module eval)
```js
export { };

```
