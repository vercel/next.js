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
    Item8 --> Item2;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(ModuleEvaluation)]"];
    N1["Items: [ItemId(Export((&quot;getEnv&quot;, #2), &quot;getEnv&quot;))]"];
    N2["Items: [ItemId(Export((&quot;getEnvWithoutDefaults&quot;, #2), &quot;getEnvWithoutDefaults&quot;))]"];
    N3["Items: [ItemId(0, ImportOfModule)]"];
    N4["Items: [ItemId(0, ImportBinding(0))]"];
    N5["Items: [ItemId(0, ImportBinding(1))]"];
    N6["Items: [ItemId(1, ImportOfModule)]"];
    N7["Items: [ItemId(1, ImportBinding(0))]"];
    N8["Items: [ItemId(2, Normal)]"];
    N9["Items: [ItemId(3, Normal)]"];
    N6 --> N3;
    N1 --> N8;
    N2 --> N9;
    N8 --> N5;
    N8 --> N7;
    N8 --> N4;
    N9 --> N5;
    N9 --> N7;
    N0 --> N6;
```
# Entrypoints

```
{
    ModuleEvaluation: 0,
    Exports: 10,
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
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
"module evaluation";

```
## Part 1
```js
import { a as getEnv } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -8
};
export { getEnv };

```
## Part 2
```js
import { b as getEnvWithoutDefaults } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -9
};
export { getEnvWithoutDefaults };

```
## Part 3
```js
import '../../utils/environment';

```
## Part 4
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import { DEFAULT_ENVIRONMENT } from '../../utils/environment';
export { DEFAULT_ENVIRONMENT as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import { parseEnvironment } from '../../utils/environment';
export { parseEnvironment as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 6
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import './globalThis';

```
## Part 7
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import { _globalThis } from './globalThis';
export { _globalThis as e } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 8
```js
import { c as DEFAULT_ENVIRONMENT } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -4,
    __turbopack_original__: '../../utils/environment'
};
import { d as parseEnvironment } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -5,
    __turbopack_original__: '../../utils/environment'
};
import { e as _globalThis } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -7,
    __turbopack_original__: './globalThis'
};
function getEnv() {
    var globalEnv = parseEnvironment(_globalThis);
    return Object.assign({}, DEFAULT_ENVIRONMENT, globalEnv);
}
export { getEnv as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 9
```js
import { e as _globalThis } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -7,
    __turbopack_original__: './globalThis'
};
import { d as parseEnvironment } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -5,
    __turbopack_original__: '../../utils/environment'
};
function getEnvWithoutDefaults() {
    return parseEnvironment(_globalThis);
}
export { getEnvWithoutDefaults as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 10
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
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
"module evaluation";

```
# Entrypoints

```
{
    ModuleEvaluation: 0,
    Exports: 10,
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
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
"module evaluation";

```
## Part 1
```js
import { a as getEnv } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -8
};
export { getEnv };

```
## Part 2
```js
import { b as getEnvWithoutDefaults } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -9
};
export { getEnvWithoutDefaults };

```
## Part 3
```js
import '../../utils/environment';

```
## Part 4
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import { DEFAULT_ENVIRONMENT } from '../../utils/environment';
export { DEFAULT_ENVIRONMENT as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import { parseEnvironment } from '../../utils/environment';
export { parseEnvironment as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 6
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import './globalThis';

```
## Part 7
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import { _globalThis } from './globalThis';
export { _globalThis as e } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 8
```js
import { c as DEFAULT_ENVIRONMENT } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -4,
    __turbopack_original__: '../../utils/environment'
};
import { d as parseEnvironment } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -5,
    __turbopack_original__: '../../utils/environment'
};
import { e as _globalThis } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -7,
    __turbopack_original__: './globalThis'
};
function getEnv() {
    var globalEnv = parseEnvironment(_globalThis);
    return Object.assign({}, DEFAULT_ENVIRONMENT, globalEnv);
}
export { getEnv as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 9
```js
import { e as _globalThis } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -7,
    __turbopack_original__: './globalThis'
};
import { d as parseEnvironment } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -5,
    __turbopack_original__: '../../utils/environment'
};
function getEnvWithoutDefaults() {
    return parseEnvironment(_globalThis);
}
export { getEnvWithoutDefaults as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 10
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
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
"module evaluation";

```
