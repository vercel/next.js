# Items

Count: 17

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
    Item13["export nanoid"];
    Item14;
    Item14["export customAlphabet"];
    Item15;
    Item15["export customRandom"];
    Item16;
    Item16["export urlAlphabet"];
    Item17;
    Item17["export random"];
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
    Item13["export nanoid"];
    Item14;
    Item14["export customAlphabet"];
    Item15;
    Item15["export customRandom"];
    Item16;
    Item16["export urlAlphabet"];
    Item17;
    Item17["export random"];
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
    Item13 --> Item12;
    Item14 --> Item11;
    Item15 --> Item10;
    Item16 --> Item12;
    Item16 --> Item4;
    Item17 --> Item9;
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
    Item13["export nanoid"];
    Item14;
    Item14["export customAlphabet"];
    Item15;
    Item15["export customRandom"];
    Item16;
    Item16["export urlAlphabet"];
    Item17;
    Item17["export random"];
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
    Item13 --> Item12;
    Item14 --> Item11;
    Item15 --> Item10;
    Item16 --> Item12;
    Item16 --> Item4;
    Item17 --> Item9;
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
    Item13["export nanoid"];
    Item14;
    Item14["export customAlphabet"];
    Item15;
    Item15["export customRandom"];
    Item16;
    Item16["export urlAlphabet"];
    Item17;
    Item17["export random"];
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
    Item13 --> Item12;
    Item14 --> Item11;
    Item15 --> Item10;
    Item16 --> Item12;
    Item16 --> Item4;
    Item17 --> Item9;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(0, ImportOfModule), ItemId(1, ImportOfModule), ItemId(2, VarDeclarator(0)), ItemId(3, VarDeclarator(0)), ItemId(3, VarDeclarator(1)), ItemId(4, VarDeclarator(0)), ItemId(6, VarDeclarator(0))]"];
    N1["Items: [ItemId(0, ImportBinding(0))]"];
    N2["Items: [ItemId(1, ImportBinding(0))]"];
    N3["Items: [ItemId(5, VarDeclarator(0)), ItemId(8, VarDeclarator(0))]"];
    N4["Items: [ItemId(7, VarDeclarator(0)), ItemId(Export((&quot;customAlphabet&quot;, #2), &quot;customAlphabet&quot;))]"];
    N5["Items: [ItemId(Export((&quot;customRandom&quot;, #2), &quot;customRandom&quot;))]"];
    N6["Items: [ItemId(Export((&quot;nanoid&quot;, #2), &quot;nanoid&quot;))]"];
    N7["Items: [ItemId(Export((&quot;random&quot;, #2), &quot;random&quot;))]"];
    N8["Items: [ItemId(Export((&quot;urlAlphabet&quot;, #2), &quot;urlAlphabet&quot;))]"];
    N8 --> N3;
    N3 --> N2;
    N5 --> N0;
    N0 --> N1;
    N6 --> N3;
    N8 --> N2;
    N4 --> N0;
```
# Entrypoints

```
{
    ModuleEvaluation: 0,
    Export(
        "customAlphabet",
    ): 4,
    Export(
        "customRandom",
    ): 5,
    Export(
        "nanoid",
    ): 6,
    Export(
        "random",
    ): 7,
    Export(
        "urlAlphabet",
    ): 8,
    Exports: 9,
}
```


# Modules (dev)
## Part 0
```js
import crypto from 'crypto';
import 'crypto';
import './url-alphabet/index.js';
const POOL_SIZE_MULTIPLIER = 128;
let pool;
let poolOffset;
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
export { POOL_SIZE_MULTIPLIER as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { pool as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { poolOffset as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { fillPool as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { customRandom as e } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { };

```
## Part 1
```js

```
## Part 2
```js

```
## Part 3
```js
import { d as fillPool } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
import { b as pool } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
import { c as poolOffset } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { urlAlphabet } from './url-alphabet/index.js';
let random = (bytes)=>{
    fillPool((bytes -= 0));
    return pool.subarray(poolOffset - bytes, poolOffset);
};
let nanoid = (size = 21)=>{
    fillPool((size -= 0));
    let id = '';
    for(let i = poolOffset - size; i < poolOffset; i++){
        id += urlAlphabet[pool[i] & 63];
    }
    return id;
};
export { random as f } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { nanoid as g } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
import { e as customRandom } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
import { f as random } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -3
};
let customAlphabet = (alphabet, size)=>customRandom(alphabet, size, random);
export { customAlphabet };
export { customAlphabet as h } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import { e as customRandom } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
export { customRandom };

```
## Part 6
```js
import { g as nanoid } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -3
};
export { nanoid };

```
## Part 7
```js
import { f as random } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -3
};
export { random };

```
## Part 8
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { urlAlphabet } from './url-alphabet/index.js';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
export { urlAlphabet };

```
## Part 9
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
import crypto from 'crypto';
import 'crypto';
import './url-alphabet/index.js';
const POOL_SIZE_MULTIPLIER = 128;
let pool;
let poolOffset;
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
export { POOL_SIZE_MULTIPLIER as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { pool as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { poolOffset as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { fillPool as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { customRandom as e } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { };

```
# Entrypoints

```
{
    ModuleEvaluation: 0,
    Export(
        "customAlphabet",
    ): 4,
    Export(
        "customRandom",
    ): 5,
    Export(
        "nanoid",
    ): 6,
    Export(
        "random",
    ): 7,
    Export(
        "urlAlphabet",
    ): 8,
    Exports: 9,
}
```


# Modules (prod)
## Part 0
```js
import crypto from 'crypto';
import 'crypto';
import './url-alphabet/index.js';
const POOL_SIZE_MULTIPLIER = 128;
let pool;
let poolOffset;
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
export { POOL_SIZE_MULTIPLIER as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { pool as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { poolOffset as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { fillPool as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { customRandom as e } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { };

```
## Part 1
```js

```
## Part 2
```js

```
## Part 3
```js
import { d as fillPool } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
import { b as pool } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
import { c as poolOffset } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { urlAlphabet } from './url-alphabet/index.js';
let random = (bytes)=>{
    fillPool((bytes -= 0));
    return pool.subarray(poolOffset - bytes, poolOffset);
};
let nanoid = (size = 21)=>{
    fillPool((size -= 0));
    let id = '';
    for(let i = poolOffset - size; i < poolOffset; i++){
        id += urlAlphabet[pool[i] & 63];
    }
    return id;
};
export { random as f } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { nanoid as g } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
import { e as customRandom } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
import { f as random } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -3
};
let customAlphabet = (alphabet, size)=>customRandom(alphabet, size, random);
export { customAlphabet };
export { customAlphabet as h } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import { e as customRandom } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
export { customRandom };

```
## Part 6
```js
import { g as nanoid } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -3
};
export { nanoid };

```
## Part 7
```js
import { f as random } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -3
};
export { random };

```
## Part 8
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { urlAlphabet } from './url-alphabet/index.js';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
export { urlAlphabet };

```
## Part 9
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
import crypto from 'crypto';
import 'crypto';
import './url-alphabet/index.js';
const POOL_SIZE_MULTIPLIER = 128;
let pool;
let poolOffset;
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
export { POOL_SIZE_MULTIPLIER as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { pool as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { poolOffset as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { fillPool as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { customRandom as e } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { };

```
