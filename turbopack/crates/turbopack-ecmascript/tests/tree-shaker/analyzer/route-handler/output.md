# Items

Count: 7

## Item 1: Stmt 0, `ImportOfModule`

```js
import { NextResponse } from "next/server";

```

- Hoisted
- Side effects

## Item 2: Stmt 0, `ImportBinding(0)`

```js
import { NextResponse } from "next/server";

```

- Hoisted
- Declares: `NextResponse`

## Item 3: Stmt 1, `VarDeclarator(0)`

```js
export const GET = (req)=>{
    return NextResponse.json({
        pathname: req.nextUrl.pathname
    });
};

```

- Declares: `GET`
- Reads: `NextResponse`
- Write: `NextResponse`, `GET`

## Item 4: Stmt 2, `VarDeclarator(0)`

```js
export const runtime = "edge";

```

- Declares: `runtime`
- Write: `runtime`

# Phase 1
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item4;
    Item5;
    Item5["ModuleEvaluation"];
    Item6;
    Item6["export GET"];
    Item7;
    Item7["export runtime"];
```
# Phase 2
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item4;
    Item5;
    Item5["ModuleEvaluation"];
    Item6;
    Item6["export GET"];
    Item7;
    Item7["export runtime"];
    Item3 --> Item2;
    Item6 --> Item3;
    Item7 --> Item4;
```
# Phase 3
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item4;
    Item5;
    Item5["ModuleEvaluation"];
    Item6;
    Item6["export GET"];
    Item7;
    Item7["export runtime"];
    Item3 --> Item2;
    Item6 --> Item3;
    Item7 --> Item4;
```
# Phase 4
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item4;
    Item5;
    Item5["ModuleEvaluation"];
    Item6;
    Item6["export GET"];
    Item7;
    Item7["export runtime"];
    Item3 --> Item2;
    Item6 --> Item3;
    Item7 --> Item4;
    Item5 --> Item1;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(0, ImportOfModule)]"];
    N1["Items: [ItemId(ModuleEvaluation)]"];
    N2["Items: [ItemId(2, VarDeclarator(0))]"];
    N3["Items: [ItemId(Export((&quot;runtime&quot;, #2), &quot;runtime&quot;))]"];
    N4["Items: [ItemId(0, ImportBinding(0))]"];
    N5["Items: [ItemId(1, VarDeclarator(0))]"];
    N6["Items: [ItemId(Export((&quot;GET&quot;, #2), &quot;GET&quot;))]"];
    N5 --> N4;
    N6 --> N5;
    N3 --> N2;
    N1 --> N0;
```
# Entrypoints

```
{
    ModuleEvaluation: 1,
    Exports: 7,
    Export(
        "runtime",
    ): 3,
    Export(
        "GET",
    ): 6,
}
```


# Modules (dev)
## Part 0
```js
import "next/server";

```
## Part 1
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
"module evaluation";

```
## Part 2
```js
const runtime = "edge";
export { runtime } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { runtime } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
export { runtime };

```
## Part 4
```js
import { NextResponse } from "next/server";
export { NextResponse } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { NextResponse } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
const GET = (req)=>{
    return NextResponse.json({
        pathname: req.nextUrl.pathname
    });
};
export { GET } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 6
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import { GET } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
export { GET };

```
## Part 7
```js
export { runtime } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export runtime"
};
export { GET } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export GET"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
"module evaluation";

```
# Entrypoints

```
{
    ModuleEvaluation: 1,
    Exports: 7,
    Export(
        "runtime",
    ): 3,
    Export(
        "GET",
    ): 6,
}
```


# Modules (prod)
## Part 0
```js
import "next/server";

```
## Part 1
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
"module evaluation";

```
## Part 2
```js
const runtime = "edge";
export { runtime } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { runtime } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
export { runtime };

```
## Part 4
```js
import { NextResponse } from "next/server";
export { NextResponse } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { NextResponse } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
const GET = (req)=>{
    return NextResponse.json({
        pathname: req.nextUrl.pathname
    });
};
export { GET } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 6
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import { GET } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
export { GET };

```
## Part 7
```js
export { runtime } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export runtime"
};
export { GET } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export GET"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
"module evaluation";

```
