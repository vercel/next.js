# Items

Count: 18

## Item 1: Stmt 0, `ImportOfModule`

```js
import crypto from 'crypto';

```

- Hoisted
- Side effects

## Item 2: Stmt 0, `ImportBinding(0)`

```js
import crypto from 'crypto';

```

- Hoisted
- Declares: `crypto`

## Item 3: Stmt 1, `ImportOfModule`

```js
import { urlAlphabet } from './url-alphabet/index.js';

```

- Hoisted
- Side effects

## Item 4: Stmt 1, `ImportBinding(0)`

```js
import { urlAlphabet } from './url-alphabet/index.js';

```

- Hoisted
- Declares: `urlAlphabet`

## Item 5: Stmt 2, `VarDeclarator(0)`

```js
const POOL_SIZE_MULTIPLIER = 128;

```

- Declares: `POOL_SIZE_MULTIPLIER`
- Write: `POOL_SIZE_MULTIPLIER`

## Item 6: Stmt 3, `VarDeclarator(0)`

```js
let pool, poolOffset;

```

- Declares: `pool`
- Write: `pool`

## Item 7: Stmt 3, `VarDeclarator(1)`

```js
let pool, poolOffset;

```

- Declares: `poolOffset`
- Write: `poolOffset`

## Item 8: Stmt 4, `VarDeclarator(0)`

```js
let fillPool = (bytes)=>{
    if (!pool || pool.length < bytes) {
        pool = Buffer.allocUnsafe(bytes * POOL_SIZE_MULTIPLIER);
        crypto.randomFillSync(pool);
        poolOffset = 0;
    } else if (poolOffset + bytes > pool.length) {
        crypto.randomFillSync(pool);
        poolOffset = 0;
    }
    poolOffset += bytes;
};

```

- Side effects
- Declares: `fillPool`
- Reads: `pool`, `POOL_SIZE_MULTIPLIER`, `crypto`, `poolOffset`
- Write: `pool`, `crypto`, `poolOffset`, `fillPool`

## Item 9: Stmt 5, `VarDeclarator(0)`

```js
let random = (bytes)=>{
    fillPool((bytes -= 0));
    return pool.subarray(poolOffset - bytes, poolOffset);
};

```

- Declares: `random`
- Reads: `fillPool`, `pool`, `poolOffset`
- Write: `pool`, `random`

## Item 10: Stmt 6, `VarDeclarator(0)`

```js
let customRandom = (alphabet, size, getRandom)=>{
    let mask = (2 << (31 - Math.clz32((alphabet.length - 1) | 1))) - 1;
    let step = Math.ceil((1.6 * mask * size) / alphabet.length);
    return ()=>{
        let id = '';
        while(true){
            let bytes = getRandom(step);
            let i = step;
            while(i--){
                id += alphabet[bytes[i] & mask] || '';
                if (id.length === size) return id;
            }
        }
    };
};

```

- Side effects
- Declares: `customRandom`
- Write: `customRandom`

## Item 11: Stmt 7, `VarDeclarator(0)`

```js
let customAlphabet = (alphabet, size)=>customRandom(alphabet, size, random);

```

- Declares: `customAlphabet`
- Reads: `customRandom`, `random`
- Write: `customAlphabet`

## Item 12: Stmt 8, `VarDeclarator(0)`

```js
let nanoid = (size = 21)=>{
    fillPool((size -= 0));
    let id = '';
    for(let i = poolOffset - size; i < poolOffset; i++){
        id += urlAlphabet[pool[i] & 63];
    }
    return id;
};

```

- Declares: `nanoid`
- Reads: `fillPool`, `poolOffset`, `urlAlphabet`, `pool`
- Write: `urlAlphabet`, `pool`, `nanoid`

# Phase 1
```mermaid
graph TD
    Item1;
    Item3;
    Item2;
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
    Item13["ModuleEvaluation"];
    Item14;
    Item14["export nanoid"];
    Item15;
    Item15["export customAlphabet"];
    Item16;
    Item16["export customRandom"];
    Item17;
    Item17["export urlAlphabet"];
    Item18;
    Item18["export random"];
    Item2 --> Item1;
```
# Phase 2
```mermaid
graph TD
    Item1;
    Item3;
    Item2;
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
    Item13["ModuleEvaluation"];
    Item14;
    Item14["export nanoid"];
    Item15;
    Item15["export customAlphabet"];
    Item16;
    Item16["export customRandom"];
    Item17;
    Item17["export urlAlphabet"];
    Item18;
    Item18["export random"];
    Item2 --> Item1;
    Item8 --> Item6;
    Item8 --> Item5;
    Item8 --> Item3;
    Item8 --> Item7;
    Item8 --> Item2;
    Item9 --> Item8;
    Item9 --> Item6;
    Item9 --> Item7;
    Item10 --> Item8;
    Item11 --> Item10;
    Item11 --> Item9;
    Item12 --> Item8;
    Item12 --> Item7;
    Item12 --> Item4;
    Item12 --> Item9;
    Item12 --> Item6;
    Item14 --> Item12;
    Item15 --> Item11;
    Item16 --> Item10;
    Item17 --> Item12;
    Item17 --> Item4;
    Item18 --> Item9;
```
# Phase 3
```mermaid
graph TD
    Item1;
    Item3;
    Item2;
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
    Item13["ModuleEvaluation"];
    Item14;
    Item14["export nanoid"];
    Item15;
    Item15["export customAlphabet"];
    Item16;
    Item16["export customRandom"];
    Item17;
    Item17["export urlAlphabet"];
    Item18;
    Item18["export random"];
    Item2 --> Item1;
    Item8 --> Item6;
    Item8 --> Item5;
    Item8 --> Item3;
    Item8 --> Item7;
    Item8 --> Item2;
    Item9 --> Item8;
    Item9 --> Item6;
    Item9 --> Item7;
    Item10 --> Item8;
    Item11 --> Item10;
    Item11 --> Item9;
    Item12 --> Item8;
    Item12 --> Item7;
    Item12 --> Item4;
    Item12 --> Item9;
    Item12 --> Item6;
    Item14 --> Item12;
    Item15 --> Item11;
    Item16 --> Item10;
    Item17 --> Item12;
    Item17 --> Item4;
    Item18 --> Item9;
```
# Phase 4
```mermaid
graph TD
    Item1;
    Item3;
    Item2;
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
    Item13["ModuleEvaluation"];
    Item14;
    Item14["export nanoid"];
    Item15;
    Item15["export customAlphabet"];
    Item16;
    Item16["export customRandom"];
    Item17;
    Item17["export urlAlphabet"];
    Item18;
    Item18["export random"];
    Item2 --> Item1;
    Item8 --> Item6;
    Item8 --> Item5;
    Item8 --> Item3;
    Item8 --> Item7;
    Item8 --> Item2;
    Item9 --> Item8;
    Item9 --> Item6;
    Item9 --> Item7;
    Item10 --> Item8;
    Item11 --> Item10;
    Item11 --> Item9;
    Item12 --> Item8;
    Item12 --> Item7;
    Item12 --> Item4;
    Item12 --> Item9;
    Item12 --> Item6;
    Item14 --> Item12;
    Item15 --> Item11;
    Item16 --> Item10;
    Item17 --> Item12;
    Item17 --> Item4;
    Item18 --> Item9;
    Item13 --> Item10;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(0, ImportOfModule)]"];
    N1["Items: [ItemId(0, ImportBinding(0))]"];
    N2["Items: [ItemId(1, ImportOfModule)]"];
    N3["Items: [ItemId(1, ImportBinding(0))]"];
    N4["Items: [ItemId(2, VarDeclarator(0)), ItemId(4, VarDeclarator(0))]"];
    N5["Items: [ItemId(3, VarDeclarator(0))]"];
    N6["Items: [ItemId(3, VarDeclarator(1))]"];
    N7["Items: [ItemId(5, VarDeclarator(0))]"];
    N8["Items: [ItemId(6, VarDeclarator(0))]"];
    N9["Items: [ItemId(7, VarDeclarator(0)), ItemId(Export((&quot;customAlphabet&quot;, #2), &quot;customAlphabet&quot;))]"];
    N10["Items: [ItemId(8, VarDeclarator(0))]"];
    N11["Items: [ItemId(ModuleEvaluation)]"];
    N12["Items: [ItemId(Export((&quot;customRandom&quot;, #2), &quot;customRandom&quot;))]"];
    N13["Items: [ItemId(Export((&quot;nanoid&quot;, #2), &quot;nanoid&quot;))]"];
    N14["Items: [ItemId(Export((&quot;random&quot;, #2), &quot;random&quot;))]"];
    N15["Items: [ItemId(Export((&quot;urlAlphabet&quot;, #2), &quot;urlAlphabet&quot;))]"];
    N2 --> N0;
    N4 --> N5;
    N1 --> N0;
    N4 --> N1;
    N4 --> N6;
    N4 --> N2;
    N7 --> N4;
    N7 --> N5;
    N7 --> N6;
    N8 --> N4;
    N9 --> N7;
    N9 --> N8;
    N10 --> N4;
    N10 --> N6;
    N10 --> N3;
    N10 --> N7;
    N10 --> N5;
    N13 --> N10;
    N3 --> N2;
    N12 --> N8;
    N15 --> N10;
    N15 --> N3;
    N14 --> N7;
    N11 --> N8;
```
# Entrypoints

```
{
    ModuleEvaluation: 11,
    Export(
        "customAlphabet",
    ): 9,
    Export(
        "customRandom",
    ): 12,
    Export(
        "nanoid",
    ): 13,
    Export(
        "random",
    ): 14,
    Export(
        "urlAlphabet",
    ): 15,
    Exports: 16,
}
```


# Modules (dev)
## Part 0
```js
import 'crypto';

```
## Part 1
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import crypto from 'crypto';
export { crypto as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import './url-alphabet/index.js';

```
## Part 3
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { urlAlphabet } from './url-alphabet/index.js';
export { urlAlphabet as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
import { c as poolOffset } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -6
};
import { d as pool } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -5
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import crypto from 'crypto';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
const POOL_SIZE_MULTIPLIER = 128;
let fillPool = (bytes)=>{
    if (!pool || pool.length < bytes) {
        pool = Buffer.allocUnsafe(bytes * POOL_SIZE_MULTIPLIER);
        crypto.randomFillSync(pool);
        poolOffset = 0;
    } else if (poolOffset + bytes > pool.length) {
        crypto.randomFillSync(pool);
        poolOffset = 0;
    }
    poolOffset += bytes;
};
export { POOL_SIZE_MULTIPLIER as e } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { fillPool as f } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
let pool;
export { pool as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 6
```js
let poolOffset;
export { poolOffset as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 7
```js
import { f as fillPool } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -4
};
import { d as pool } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -5
};
import { c as poolOffset } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -6
};
let random = (bytes)=>{
    fillPool((bytes -= 0));
    return pool.subarray(poolOffset - bytes, poolOffset);
};
export { random as g } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 8
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
let customRandom = (alphabet, size, getRandom)=>{
    let mask = (2 << (31 - Math.clz32((alphabet.length - 1) | 1))) - 1;
    let step = Math.ceil((1.6 * mask * size) / alphabet.length);
    return ()=>{
        let id = '';
        while(true){
            let bytes = getRandom(step);
            let i = step;
            while(i--){
                id += alphabet[bytes[i] & mask] || '';
                if (id.length === size) return id;
            }
        }
    };
};
export { customRandom as h } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 9
```js
import { h as customRandom } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -8
};
import { g as random } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -7
};
let customAlphabet = (alphabet, size)=>customRandom(alphabet, size, random);
export { customAlphabet };
export { customAlphabet as i } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 10
```js
import { f as fillPool } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -4
};
import { c as poolOffset } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { urlAlphabet } from './url-alphabet/index.js';
import { d as pool } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -5
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
let nanoid = (size = 21)=>{
    fillPool((size -= 0));
    let id = '';
    for(let i = poolOffset - size; i < poolOffset; i++){
        id += urlAlphabet[pool[i] & 63];
    }
    return id;
};
export { nanoid as j } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 11
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
"module evaluation";

```
## Part 12
```js
import { h as customRandom } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -8
};
export { customRandom };

```
## Part 13
```js
import { j as nanoid } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -10
};
export { nanoid };

```
## Part 14
```js
import { g as random } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -7
};
export { random };

```
## Part 15
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { urlAlphabet } from './url-alphabet/index.js';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
export { urlAlphabet };

```
## Part 16
```js
export { customAlphabet } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export customAlphabet"
};
export { customRandom } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export customRandom"
};
export { nanoid } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export nanoid"
};
export { random } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export random"
};
export { urlAlphabet } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export urlAlphabet"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
"module evaluation";

```
# Entrypoints

```
{
    ModuleEvaluation: 11,
    Export(
        "customAlphabet",
    ): 9,
    Export(
        "customRandom",
    ): 12,
    Export(
        "nanoid",
    ): 13,
    Export(
        "random",
    ): 14,
    Export(
        "urlAlphabet",
    ): 15,
    Exports: 16,
}
```


# Modules (prod)
## Part 0
```js
import 'crypto';

```
## Part 1
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import crypto from 'crypto';
export { crypto as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import './url-alphabet/index.js';

```
## Part 3
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { urlAlphabet } from './url-alphabet/index.js';
export { urlAlphabet as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
import { c as poolOffset } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -6
};
import { d as pool } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -5
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import crypto from 'crypto';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
const POOL_SIZE_MULTIPLIER = 128;
let fillPool = (bytes)=>{
    if (!pool || pool.length < bytes) {
        pool = Buffer.allocUnsafe(bytes * POOL_SIZE_MULTIPLIER);
        crypto.randomFillSync(pool);
        poolOffset = 0;
    } else if (poolOffset + bytes > pool.length) {
        crypto.randomFillSync(pool);
        poolOffset = 0;
    }
    poolOffset += bytes;
};
export { POOL_SIZE_MULTIPLIER as e } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { fillPool as f } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
let pool;
export { pool as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 6
```js
let poolOffset;
export { poolOffset as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 7
```js
import { f as fillPool } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -4
};
import { d as pool } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -5
};
import { c as poolOffset } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -6
};
let random = (bytes)=>{
    fillPool((bytes -= 0));
    return pool.subarray(poolOffset - bytes, poolOffset);
};
export { random as g } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 8
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
let customRandom = (alphabet, size, getRandom)=>{
    let mask = (2 << (31 - Math.clz32((alphabet.length - 1) | 1))) - 1;
    let step = Math.ceil((1.6 * mask * size) / alphabet.length);
    return ()=>{
        let id = '';
        while(true){
            let bytes = getRandom(step);
            let i = step;
            while(i--){
                id += alphabet[bytes[i] & mask] || '';
                if (id.length === size) return id;
            }
        }
    };
};
export { customRandom as h } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 9
```js
import { h as customRandom } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -8
};
import { g as random } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -7
};
let customAlphabet = (alphabet, size)=>customRandom(alphabet, size, random);
export { customAlphabet };
export { customAlphabet as i } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 10
```js
import { f as fillPool } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -4
};
import { c as poolOffset } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { urlAlphabet } from './url-alphabet/index.js';
import { d as pool } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -5
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
let nanoid = (size = 21)=>{
    fillPool((size -= 0));
    let id = '';
    for(let i = poolOffset - size; i < poolOffset; i++){
        id += urlAlphabet[pool[i] & 63];
    }
    return id;
};
export { nanoid as j } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 11
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
"module evaluation";

```
## Part 12
```js
import { h as customRandom } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -8
};
export { customRandom };

```
## Part 13
```js
import { j as nanoid } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -10
};
export { nanoid };

```
## Part 14
```js
import { g as random } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -7
};
export { random };

```
## Part 15
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { urlAlphabet } from './url-alphabet/index.js';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
export { urlAlphabet };

```
## Part 16
```js
export { customAlphabet } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export customAlphabet"
};
export { customRandom } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export customRandom"
};
export { nanoid } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export nanoid"
};
export { random } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export random"
};
export { urlAlphabet } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export urlAlphabet"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
"module evaluation";

```
