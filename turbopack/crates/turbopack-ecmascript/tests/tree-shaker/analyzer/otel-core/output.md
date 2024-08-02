# Items

Count: 10

## Item 1: Stmt 0, `ImportOfModule`

```js
import { DEFAULT_ENVIRONMENT, parseEnvironment } from '../../utils/environment';

```

- Hoisted
- Side effects

## Item 2: Stmt 0, `ImportBinding(0)`

```js
import { DEFAULT_ENVIRONMENT, parseEnvironment } from '../../utils/environment';

```

- Hoisted
- Declares: `DEFAULT_ENVIRONMENT`

## Item 3: Stmt 0, `ImportBinding(1)`

```js
import { DEFAULT_ENVIRONMENT, parseEnvironment } from '../../utils/environment';

```

- Hoisted
- Declares: `parseEnvironment`

## Item 4: Stmt 1, `ImportOfModule`

```js
import { _globalThis } from './globalThis';

```

- Hoisted
- Side effects

## Item 5: Stmt 1, `ImportBinding(0)`

```js
import { _globalThis } from './globalThis';

```

- Hoisted
- Declares: `_globalThis`

## Item 6: Stmt 2, `Normal`

```js
export function getEnv() {
    var globalEnv = parseEnvironment(_globalThis);
    return Object.assign({}, DEFAULT_ENVIRONMENT, globalEnv);
}

```

- Hoisted
- Declares: `getEnv`
- Reads (eventual): `parseEnvironment`, `_globalThis`, `DEFAULT_ENVIRONMENT`
- Write: `getEnv`

## Item 7: Stmt 3, `Normal`

```js
export function getEnvWithoutDefaults() {
    return parseEnvironment(_globalThis);
}

```

- Hoisted
- Declares: `getEnvWithoutDefaults`
- Reads (eventual): `parseEnvironment`, `_globalThis`
- Write: `getEnvWithoutDefaults`

# Phase 1
```mermaid
graph TD
    Item1;
    Item3;
    Item4;
    Item2;
    Item5;
    Item6;
    Item7;
    Item8;
    Item8["ModuleEvaluation"];
    Item9;
    Item9["export getEnv"];
    Item10;
    Item10["export getEnvWithoutDefaults"];
    Item2 --> Item1;
```
# Phase 2
```mermaid
graph TD
    Item1;
    Item3;
    Item4;
    Item2;
    Item5;
    Item6;
    Item7;
    Item8;
    Item8["ModuleEvaluation"];
    Item9;
    Item9["export getEnv"];
    Item10;
    Item10["export getEnvWithoutDefaults"];
    Item2 --> Item1;
    Item9 --> Item6;
    Item10 --> Item7;
```
# Phase 3
```mermaid
graph TD
    Item1;
    Item3;
    Item4;
    Item2;
    Item5;
    Item6;
    Item7;
    Item8;
    Item8["ModuleEvaluation"];
    Item9;
    Item9["export getEnv"];
    Item10;
    Item10["export getEnvWithoutDefaults"];
    Item2 --> Item1;
    Item9 --> Item6;
    Item10 --> Item7;
    Item6 --> Item4;
    Item6 --> Item5;
    Item6 --> Item3;
    Item7 --> Item4;
    Item7 --> Item5;
```
# Phase 4
```mermaid
graph TD
    Item1;
    Item3;
    Item4;
    Item2;
    Item5;
    Item6;
    Item7;
    Item8;
    Item8["ModuleEvaluation"];
    Item9;
    Item9["export getEnv"];
    Item10;
    Item10["export getEnvWithoutDefaults"];
    Item2 --> Item1;
    Item9 --> Item6;
    Item10 --> Item7;
    Item6 --> Item4;
    Item6 --> Item5;
    Item6 --> Item3;
    Item7 --> Item4;
    Item7 --> Item5;
    Item8 --> Item1;
    Item8 --> Item2;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(0, ImportBinding(0))]"];
    N1["Items: [ItemId(1, ImportBinding(0))]"];
    N2["Items: [ItemId(0, ImportBinding(1))]"];
    N3["Items: [ItemId(3, Normal)]"];
    N4["Items: [ItemId(Export((&quot;getEnvWithoutDefaults&quot;, #2), &quot;getEnvWithoutDefaults&quot;))]"];
    N5["Items: [ItemId(2, Normal)]"];
    N6["Items: [ItemId(Export((&quot;getEnv&quot;, #2), &quot;getEnv&quot;))]"];
    N7["Items: [ItemId(0, ImportOfModule)]"];
    N8["Items: [ItemId(1, ImportOfModule)]"];
    N9["Items: [ItemId(ModuleEvaluation)]"];
    N8 --> N7;
    N6 --> N5;
    N4 --> N3;
    N5 --> N2;
    N5 --> N1;
    N5 --> N0;
    N3 --> N2;
    N3 --> N1;
    N9 --> N7;
    N9 --> N8;
```
# Entrypoints

```
{
    ModuleEvaluation: 9,
    Exports: 10,
    Export(
        "getEnvWithoutDefaults",
    ): 4,
    Export(
        "getEnv",
    ): 6,
}
```


# Modules (dev)
## Part 0
```js
import { DEFAULT_ENVIRONMENT } from '../../utils/environment';
export { DEFAULT_ENVIRONMENT } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
import { _globalThis } from './globalThis';
export { _globalThis } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
import { parseEnvironment } from '../../utils/environment';
export { parseEnvironment } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import { _globalThis } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import { parseEnvironment } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
function getEnvWithoutDefaults() {
    return parseEnvironment(_globalThis);
}
export { getEnvWithoutDefaults } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import { getEnvWithoutDefaults } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
export { getEnvWithoutDefaults };

```
## Part 5
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { DEFAULT_ENVIRONMENT } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { parseEnvironment } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { _globalThis } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
function getEnv() {
    var globalEnv = parseEnvironment(_globalThis);
    return Object.assign({}, DEFAULT_ENVIRONMENT, globalEnv);
}
export { getEnv } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 6
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import { getEnv } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
export { getEnv };

```
## Part 7
```js
import '../../utils/environment';

```
## Part 8
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import './globalThis';

```
## Part 9
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
"module evaluation";

```
## Part 10
```js
export { getEnvWithoutDefaults } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export getEnvWithoutDefaults"
};
export { getEnv } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export getEnv"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
"module evaluation";

```
# Entrypoints

```
{
    ModuleEvaluation: 9,
    Exports: 10,
    Export(
        "getEnvWithoutDefaults",
    ): 4,
    Export(
        "getEnv",
    ): 6,
}
```


# Modules (prod)
## Part 0
```js
import { DEFAULT_ENVIRONMENT } from '../../utils/environment';
export { DEFAULT_ENVIRONMENT } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
import { _globalThis } from './globalThis';
export { _globalThis } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
import { parseEnvironment } from '../../utils/environment';
export { parseEnvironment } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import { _globalThis } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import { parseEnvironment } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
function getEnvWithoutDefaults() {
    return parseEnvironment(_globalThis);
}
export { getEnvWithoutDefaults } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import { getEnvWithoutDefaults } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
export { getEnvWithoutDefaults };

```
## Part 5
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { DEFAULT_ENVIRONMENT } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { parseEnvironment } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { _globalThis } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
function getEnv() {
    var globalEnv = parseEnvironment(_globalThis);
    return Object.assign({}, DEFAULT_ENVIRONMENT, globalEnv);
}
export { getEnv } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 6
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import { getEnv } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
export { getEnv };

```
## Part 7
```js
import '../../utils/environment';

```
## Part 8
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import './globalThis';

```
## Part 9
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
"module evaluation";

```
## Part 10
```js
export { getEnvWithoutDefaults } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export getEnvWithoutDefaults"
};
export { getEnv } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export getEnv"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
"module evaluation";

```
