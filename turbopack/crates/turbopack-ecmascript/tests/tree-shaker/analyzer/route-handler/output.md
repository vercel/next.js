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
    N1["Items: [ItemId(0, ImportBinding(0))]"];
    N2["Items: [ItemId(1, VarDeclarator(0)), ItemId(Export((&quot;GET&quot;, #2), &quot;GET&quot;))]"];
    N3["Items: [ItemId(2, VarDeclarator(0)), ItemId(Export((&quot;runtime&quot;, #2), &quot;runtime&quot;))]"];
    N4["Items: [ItemId(ModuleEvaluation)]"];
    N2 --> N1;
    N1 --> N0;
    N4 --> N0;
```
# Entrypoints

```
{
    ModuleEvaluation: 4,
    Export(
        "GET",
    ): 2,
    Export(
        "runtime",
    ): 3,
    Exports: 5,
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
import { NextResponse } from "next/server";
export { NextResponse as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { NextResponse } from "next/server";
const GET = (req)=>{
    return NextResponse.json({
        pathname: req.nextUrl.pathname
    });
};
export { GET };
export { GET as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
const runtime = "edge";
export { runtime };
export { runtime as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
"module evaluation";

```
## Part 5
```js
export { GET } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export GET"
};
export { runtime } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export runtime"
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
    ModuleEvaluation: 4,
    Export(
        "GET",
    ): 2,
    Export(
        "runtime",
    ): 3,
    Exports: 5,
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
import { NextResponse } from "next/server";
export { NextResponse as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { NextResponse } from "next/server";
const GET = (req)=>{
    return NextResponse.json({
        pathname: req.nextUrl.pathname
    });
};
export { GET };
export { GET as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
const runtime = "edge";
export { runtime };
export { runtime as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
"module evaluation";

```
## Part 5
```js
export { GET } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export GET"
};
export { runtime } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export runtime"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
"module evaluation";

```
