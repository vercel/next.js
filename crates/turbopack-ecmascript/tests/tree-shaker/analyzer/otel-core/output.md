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
    N0["Items: [ItemId(ModuleEvaluation), ItemId(0, ImportOfModule), ItemId(1, ImportOfModule)]"];
    N1["Items: [ItemId(Export((&quot;getEnv&quot;, #2), &quot;getEnv&quot;)), ItemId(0, ImportBinding(0)), ItemId(0, ImportBinding(1)), ItemId(1, ImportBinding(0)), ItemId(2, Normal)]"];
    N2["Items: [ItemId(Export((&quot;getEnvWithoutDefaults&quot;, #2), &quot;getEnvWithoutDefaults&quot;)), ItemId(0, ImportBinding(1)), ItemId(1, ImportBinding(0)), ItemId(3, Normal)]"];
    N1 --> N2;
```
# Entrypoints

```
{
    ModuleEvaluation: 0,
    Exports: 3,
    Export(
        "getEnv",
    ): 1,
    Export(
        "getEnvWithoutDefaults",
    ): 2,
}
```


# Modules (dev)
## Part 0
```js
"module evaluation";
import '../../utils/environment';
import './globalThis';

```
## Part 1
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
export { getEnv };
import { DEFAULT_ENVIRONMENT } from '../../utils/environment';
import { parseEnvironment } from '../../utils/environment';
import { _globalThis } from './globalThis';
function getEnv() {
    var globalEnv = parseEnvironment(_globalThis);
    return Object.assign({}, DEFAULT_ENVIRONMENT, globalEnv);
}
export { DEFAULT_ENVIRONMENT } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { parseEnvironment } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { _globalThis } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { getEnv } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
export { getEnvWithoutDefaults };
import { parseEnvironment } from '../../utils/environment';
import { _globalThis } from './globalThis';
function getEnvWithoutDefaults() {
    return parseEnvironment(_globalThis);
}
export { parseEnvironment } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { _globalThis } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { getEnvWithoutDefaults } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
export { getEnv } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export getEnv"
};
export { getEnvWithoutDefaults } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export getEnvWithoutDefaults"
};

```
## Merged (module eval)
```js
import '../../utils/environment';
import './globalThis';
"module evaluation";

```
# Entrypoints

```
{
    ModuleEvaluation: 0,
    Exports: 3,
    Export(
        "getEnv",
    ): 1,
    Export(
        "getEnvWithoutDefaults",
    ): 2,
}
```


# Modules (prod)
## Part 0
```js
"module evaluation";
import '../../utils/environment';
import './globalThis';

```
## Part 1
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
export { getEnv };
import { DEFAULT_ENVIRONMENT } from '../../utils/environment';
import { parseEnvironment } from '../../utils/environment';
import { _globalThis } from './globalThis';
function getEnv() {
    var globalEnv = parseEnvironment(_globalThis);
    return Object.assign({}, DEFAULT_ENVIRONMENT, globalEnv);
}
export { DEFAULT_ENVIRONMENT } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { parseEnvironment } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { _globalThis } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { getEnv } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
export { getEnvWithoutDefaults };
import { parseEnvironment } from '../../utils/environment';
import { _globalThis } from './globalThis';
function getEnvWithoutDefaults() {
    return parseEnvironment(_globalThis);
}
export { parseEnvironment } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { _globalThis } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { getEnvWithoutDefaults } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
export { getEnv } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export getEnv"
};
export { getEnvWithoutDefaults } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export getEnvWithoutDefaults"
};

```
## Merged (module eval)
```js
import '../../utils/environment';
import './globalThis';
"module evaluation";

```
