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
- Write: `fillPool`, `pool`, `crypto`, `poolOffset`

## Item 9: Stmt 5, `VarDeclarator(0)`

```js
let random = (bytes)=>{
    fillPool((bytes -= 0));
    return pool.subarray(poolOffset - bytes, poolOffset);
};

```

- Declares: `random`
- Reads: `fillPool`, `pool`, `poolOffset`
- Write: `random`, `pool`

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
- Write: `nanoid`, `urlAlphabet`, `pool`

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
    Item8 --> Item1;
    Item8 --> Item2;
    Item9 --> Item8;
    Item9 --> Item6;
    Item9 --> Item7;
    Item10 --> Item1;
    Item10 --> Item2;
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
    Item8 --> Item1;
    Item8 --> Item2;
    Item9 --> Item8;
    Item9 --> Item6;
    Item9 --> Item7;
    Item10 --> Item1;
    Item10 --> Item2;
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
    Item8 --> Item1;
    Item8 --> Item2;
    Item9 --> Item8;
    Item9 --> Item6;
    Item9 --> Item7;
    Item10 --> Item1;
    Item10 --> Item2;
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
    Item13 --> Item1;
    Item13 --> Item2;
    Item13 --> Item8;
    Item13 --> Item10;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(ModuleEvaluation)]"];
    N1["Items: [ItemId(Export((&quot;nanoid&quot;, #2), &quot;nanoid&quot;))]"];
    N2["Items: [ItemId(Export((&quot;customAlphabet&quot;, #2), &quot;customAlphabet&quot;)), ItemId(7, VarDeclarator(0))]"];
    N3["Items: [ItemId(Export((&quot;customRandom&quot;, #2), &quot;customRandom&quot;))]"];
    N4["Items: [ItemId(Export((&quot;urlAlphabet&quot;, #2), &quot;urlAlphabet&quot;)), ItemId(1, ImportBinding(0))]"];
    N5["Items: [ItemId(Export((&quot;random&quot;, #2), &quot;random&quot;))]"];
    N6["Items: [ItemId(0, ImportOfModule)]"];
    N7["Items: [ItemId(1, ImportOfModule)]"];
    N8["Items: [ItemId(3, VarDeclarator(0))]"];
    N9["Items: [ItemId(3, VarDeclarator(1))]"];
    N10["Items: [ItemId(0, ImportBinding(0)), ItemId(2, VarDeclarator(0)), ItemId(4, VarDeclarator(0))]"];
    N11["Items: [ItemId(5, VarDeclarator(0))]"];
    N12["Items: [ItemId(6, VarDeclarator(0))]"];
    N13["Items: [ItemId(1, ImportBinding(0)), ItemId(8, VarDeclarator(0))]"];
    N0 --> N6;
    N0 --> N7;
    N0 --> N10;
    N0 --> N12;
    N1 --> N13;
    N2 --> N12;
    N2 --> N11;
    N3 --> N12;
    N4 --> N13;
    N5 --> N11;
    N7 --> N6;
    N10 --> N8;
    N10 --> N9;
    N10 --> N6;
    N10 --> N7;
    N11 --> N10;
    N11 --> N8;
    N11 --> N9;
    N12 --> N6;
    N12 --> N7;
    N12 --> N10;
    N13 --> N10;
    N13 --> N9;
    N13 --> N11;
    N13 --> N8;
```
# Entrypoints

```
{
    ModuleEvaluation: 0,
    Exports: 14,
    Export(
        "customAlphabet",
    ): 2,
    Export(
        "customRandom",
    ): 3,
    Export(
        "urlAlphabet",
    ): 4,
    Export(
        "random",
    ): 5,
    Export(
        "nanoid",
    ): 1,
}
```


# Modules (dev)
## Part 0
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
"module evaluation";

```
## Part 1
```js
import { nanoid } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
export { nanoid as nanoid };

```
## Part 2
```js
import { customRandom } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import { random } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
export { customAlphabet as customAlphabet };
let customAlphabet = (alphabet, size)=>customRandom(alphabet, size, random);
export { customAlphabet } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
import { customRandom } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
export { customRandom as customRandom };

```
## Part 4
```js
import { urlAlphabet } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
export { urlAlphabet as urlAlphabet };
import { urlAlphabet } from './url-alphabet/index.js';
export { urlAlphabet } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import { random } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
export { random as random };

```
## Part 6
```js
import 'crypto';

```
## Part 7
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import './url-alphabet/index.js';

```
## Part 8
```js
let pool;
export { pool } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 9
```js
let poolOffset;
export { poolOffset } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 10
```js
import { pool } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import { poolOffset } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import crypto from 'crypto';
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
export { crypto } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { POOL_SIZE_MULTIPLIER } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { fillPool } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 11
```js
import { fillPool } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import { pool } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import { poolOffset } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
let random = (bytes)=>{
    fillPool((bytes -= 0));
    return pool.subarray(poolOffset - bytes, poolOffset);
};
export { random } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 12
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
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
export { customRandom } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 13
```js
import { fillPool } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import { poolOffset } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import { pool } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import { urlAlphabet } from './url-alphabet/index.js';
let nanoid = (size = 21)=>{
    fillPool((size -= 0));
    let id = '';
    for(let i = poolOffset - size; i < poolOffset; i++){
        id += urlAlphabet[pool[i] & 63];
    }
    return id;
};
export { urlAlphabet } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { nanoid } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 14
```js
export { nanoid } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export nanoid"
};
export { customAlphabet } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export customAlphabet"
};
export { customRandom } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export customRandom"
};
export { urlAlphabet } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export urlAlphabet"
};
export { random } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export random"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
"module evaluation";

```
# Entrypoints

```
{
    ModuleEvaluation: 0,
    Exports: 14,
    Export(
        "customAlphabet",
    ): 2,
    Export(
        "customRandom",
    ): 3,
    Export(
        "urlAlphabet",
    ): 4,
    Export(
        "random",
    ): 5,
    Export(
        "nanoid",
    ): 1,
}
```


# Modules (prod)
## Part 0
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
"module evaluation";

```
## Part 1
```js
import { nanoid } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
export { nanoid as nanoid };

```
## Part 2
```js
import { customRandom } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import { random } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
export { customAlphabet as customAlphabet };
let customAlphabet = (alphabet, size)=>customRandom(alphabet, size, random);
export { customAlphabet } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
import { customRandom } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
export { customRandom as customRandom };

```
## Part 4
```js
import { urlAlphabet } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
export { urlAlphabet as urlAlphabet };
import { urlAlphabet } from './url-alphabet/index.js';
export { urlAlphabet } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import { random } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
export { random as random };

```
## Part 6
```js
import 'crypto';

```
## Part 7
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import './url-alphabet/index.js';

```
## Part 8
```js
let pool;
export { pool } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 9
```js
let poolOffset;
export { poolOffset } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 10
```js
import { pool } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import { poolOffset } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import crypto from 'crypto';
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
export { crypto } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { POOL_SIZE_MULTIPLIER } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { fillPool } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 11
```js
import { fillPool } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import { pool } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import { poolOffset } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
let random = (bytes)=>{
    fillPool((bytes -= 0));
    return pool.subarray(poolOffset - bytes, poolOffset);
};
export { random } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 12
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
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
export { customRandom } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 13
```js
import { fillPool } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import { poolOffset } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import { pool } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import { urlAlphabet } from './url-alphabet/index.js';
let nanoid = (size = 21)=>{
    fillPool((size -= 0));
    let id = '';
    for(let i = poolOffset - size; i < poolOffset; i++){
        id += urlAlphabet[pool[i] & 63];
    }
    return id;
};
export { urlAlphabet } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { nanoid } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 14
```js
export { nanoid } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export nanoid"
};
export { customAlphabet } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export customAlphabet"
};
export { customRandom } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export customRandom"
};
export { urlAlphabet } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export urlAlphabet"
};
export { random } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export random"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
"module evaluation";

```
