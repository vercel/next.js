# Items

Count: 9

## Item 1: Stmt 0, `ImportOfModule`

```js
import { NextResponse } from 'next/server';

```

- Hoisted
- Side effects

## Item 2: Stmt 0, `ImportBinding(0)`

```js
import { NextResponse } from 'next/server';

```

- Hoisted
- Declares: `NextResponse`

## Item 3: Stmt 1, `ImportOfModule`

```js
import { ClientComponent } from '../../ClientComponent';

```

- Hoisted
- Side effects

## Item 4: Stmt 1, `ImportBinding(0)`

```js
import { ClientComponent } from '../../ClientComponent';

```

- Hoisted
- Declares: `ClientComponent`

## Item 5: Stmt 2, `ImportOfModule`

```js
import { MyModuleClientComponent } from 'my-module/MyModuleClientComponent';

```

- Hoisted
- Side effects

## Item 6: Stmt 2, `ImportBinding(0)`

```js
import { MyModuleClientComponent } from 'my-module/MyModuleClientComponent';

```

- Hoisted
- Declares: `MyModuleClientComponent`

## Item 7: Stmt 3, `Normal`

```js
export function GET() {
    return NextResponse.json({
        clientComponent: typeof ClientComponent,
        myModuleClientComponent: typeof MyModuleClientComponent
    });
}

```

- Hoisted
- Declares: `GET`
- Reads (eventual): `NextResponse`, `ClientComponent`, `MyModuleClientComponent`
- Write: `GET`
- Write (eventual): `NextResponse`

# Phase 1
```mermaid
graph TD
    Item1;
    Item4;
    Item2;
    Item5;
    Item3;
    Item6;
    Item7;
    Item8;
    Item8["ModuleEvaluation"];
    Item9;
    Item9["export GET"];
    Item2 --> Item1;
    Item3 --> Item1;
    Item3 --> Item2;
```
# Phase 2
```mermaid
graph TD
    Item1;
    Item4;
    Item2;
    Item5;
    Item3;
    Item6;
    Item7;
    Item8;
    Item8["ModuleEvaluation"];
    Item9;
    Item9["export GET"];
    Item2 --> Item1;
    Item3 --> Item1;
    Item3 --> Item2;
    Item9 --> Item7;
```
# Phase 3
```mermaid
graph TD
    Item1;
    Item4;
    Item2;
    Item5;
    Item3;
    Item6;
    Item7;
    Item8;
    Item8["ModuleEvaluation"];
    Item9;
    Item9["export GET"];
    Item2 --> Item1;
    Item3 --> Item1;
    Item3 --> Item2;
    Item9 --> Item7;
    Item7 --> Item4;
    Item7 --> Item5;
    Item7 --> Item6;
```
# Phase 4
```mermaid
graph TD
    Item1;
    Item4;
    Item2;
    Item5;
    Item3;
    Item6;
    Item7;
    Item8;
    Item8["ModuleEvaluation"];
    Item9;
    Item9["export GET"];
    Item2 --> Item1;
    Item3 --> Item1;
    Item3 --> Item2;
    Item9 --> Item7;
    Item7 --> Item4;
    Item7 --> Item5;
    Item7 --> Item6;
    Item8 --> Item1;
    Item8 --> Item2;
    Item8 --> Item3;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(ModuleEvaluation), ItemId(0, ImportOfModule), ItemId(1, ImportOfModule), ItemId(2, ImportOfModule)]"];
    N1["Items: [ItemId(Export((&quot;GET&quot;, #2), &quot;GET&quot;)), ItemId(0, ImportBinding(0)), ItemId(1, ImportBinding(0)), ItemId(2, ImportBinding(0)), ItemId(3, Normal)]"];
```
# Entrypoints

```
{
    ModuleEvaluation: 0,
    Exports: 2,
    Export(
        "GET",
    ): 1,
}
```


# Modules (dev)
## Part 0
```js
"module evaluation";
import 'next/server';
import '../../ClientComponent';
import 'my-module/MyModuleClientComponent';

```
## Part 1
```js
export { GET };
import { NextResponse } from 'next/server';
import { ClientComponent } from '../../ClientComponent';
import { MyModuleClientComponent } from 'my-module/MyModuleClientComponent';
function GET() {
    return NextResponse.json({
        clientComponent: typeof ClientComponent,
        myModuleClientComponent: typeof MyModuleClientComponent
    });
}
export { NextResponse } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { ClientComponent } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { MyModuleClientComponent } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { GET } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
export { GET } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export GET"
};

```
## Merged (module eval)
```js
import 'next/server';
import '../../ClientComponent';
import 'my-module/MyModuleClientComponent';
"module evaluation";

```
# Entrypoints

```
{
    ModuleEvaluation: 0,
    Exports: 2,
    Export(
        "GET",
    ): 1,
}
```


# Modules (prod)
## Part 0
```js
"module evaluation";
import 'next/server';
import '../../ClientComponent';
import 'my-module/MyModuleClientComponent';

```
## Part 1
```js
export { GET };
import { NextResponse } from 'next/server';
import { ClientComponent } from '../../ClientComponent';
import { MyModuleClientComponent } from 'my-module/MyModuleClientComponent';
function GET() {
    return NextResponse.json({
        clientComponent: typeof ClientComponent,
        myModuleClientComponent: typeof MyModuleClientComponent
    });
}
export { NextResponse } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { ClientComponent } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { MyModuleClientComponent } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { GET } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
export { GET } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export GET"
};

```
## Merged (module eval)
```js
import 'next/server';
import '../../ClientComponent';
import 'my-module/MyModuleClientComponent';
"module evaluation";

```
