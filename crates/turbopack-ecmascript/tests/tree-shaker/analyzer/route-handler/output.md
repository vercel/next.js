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
- Write: `GET`, `NextResponse`

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
    N0["Items: [ItemId(ModuleEvaluation), ItemId(0, ImportOfModule)]"];
    N1["Items: [ItemId(Export((&quot;GET&quot;, #2), &quot;GET&quot;)), ItemId(0, ImportBinding(0)), ItemId(1, VarDeclarator(0))]"];
    N2["Items: [ItemId(Export((&quot;runtime&quot;, #2), &quot;runtime&quot;)), ItemId(2, VarDeclarator(0))]"];
```
# Entrypoints

```
{
    ModuleEvaluation: 0,
    Export(
        "runtime",
    ): 2,
    Export(
        "GET",
    ): 1,
}
```


# Modules (dev)
## Part 0
```js
"module evaluation";
import "next/server";

```
## Part 1
```js
export { GET };
import { NextResponse } from "next/server";
const GET = (req)=>{
    return NextResponse.json({
        pathname: req.nextUrl.pathname
    });
};
export { NextResponse } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { GET } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
export { runtime };
const runtime = "edge";
export { runtime } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Merged (module eval)
```js
import "next/server";
"module evaluation";

```
# Entrypoints

```
{
    ModuleEvaluation: 0,
    Export(
        "runtime",
    ): 2,
    Export(
        "GET",
    ): 1,
}
```


# Modules (prod)
## Part 0
```js
"module evaluation";
import "next/server";

```
## Part 1
```js
export { GET };
import { NextResponse } from "next/server";
const GET = (req)=>{
    return NextResponse.json({
        pathname: req.nextUrl.pathname
    });
};
export { NextResponse } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { GET } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
export { runtime };
const runtime = "edge";
export { runtime } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Merged (module eval)
```js
import "next/server";
"module evaluation";

```
