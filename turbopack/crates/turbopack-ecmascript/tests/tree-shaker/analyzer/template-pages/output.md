# Items

Count: 36

## Item 1: Stmt 0, `ImportOfModule`

```js
import { PagesRouteModule } from '../../server/future/route-modules/pages/module.compiled';

```

- Hoisted
- Side effects

## Item 2: Stmt 0, `ImportBinding(0)`

```js
import { PagesRouteModule } from '../../server/future/route-modules/pages/module.compiled';

```

- Hoisted
- Declares: `PagesRouteModule`

## Item 3: Stmt 1, `ImportOfModule`

```js
import { RouteKind } from '../../server/future/route-kind';

```

- Hoisted
- Side effects

## Item 4: Stmt 1, `ImportBinding(0)`

```js
import { RouteKind } from '../../server/future/route-kind';

```

- Hoisted
- Declares: `RouteKind`

## Item 5: Stmt 2, `ImportOfModule`

```js
import { hoist } from './helpers';

```

- Hoisted
- Side effects

## Item 6: Stmt 2, `ImportBinding(0)`

```js
import { hoist } from './helpers';

```

- Hoisted
- Declares: `hoist`

## Item 7: Stmt 3, `ImportOfModule`

```js
import Document from 'VAR_MODULE_DOCUMENT';

```

- Hoisted
- Side effects

## Item 8: Stmt 3, `ImportBinding(0)`

```js
import Document from 'VAR_MODULE_DOCUMENT';

```

- Hoisted
- Declares: `Document`

## Item 9: Stmt 4, `ImportOfModule`

```js
import App from 'VAR_MODULE_APP';

```

- Hoisted
- Side effects

## Item 10: Stmt 4, `ImportBinding(0)`

```js
import App from 'VAR_MODULE_APP';

```

- Hoisted
- Declares: `App`

## Item 11: Stmt 5, `ImportOfModule`

```js
import * as userland from 'VAR_USERLAND';

```

- Hoisted
- Side effects

## Item 12: Stmt 5, `ImportBinding(0)`

```js
import * as userland from 'VAR_USERLAND';

```

- Hoisted
- Declares: `userland`

## Item 13: Stmt 6, `Normal`

```js
export default hoist(userland, 'default');

```

- Side effects
- Declares: `__TURBOPACK__default__export__`
- Reads: `hoist`, `userland`
- Write: `__TURBOPACK__default__export__`

## Item 14: Stmt 7, `VarDeclarator(0)`

```js
export const getStaticProps = hoist(userland, 'getStaticProps');

```

- Side effects
- Declares: `getStaticProps`
- Reads: `hoist`, `userland`
- Write: `getStaticProps`

## Item 15: Stmt 8, `VarDeclarator(0)`

```js
export const getStaticPaths = hoist(userland, 'getStaticPaths');

```

- Side effects
- Declares: `getStaticPaths`
- Reads: `hoist`, `userland`
- Write: `getStaticPaths`

## Item 16: Stmt 9, `VarDeclarator(0)`

```js
export const getServerSideProps = hoist(userland, 'getServerSideProps');

```

- Side effects
- Declares: `getServerSideProps`
- Reads: `hoist`, `userland`
- Write: `getServerSideProps`

## Item 17: Stmt 10, `VarDeclarator(0)`

```js
export const config = hoist(userland, 'config');

```

- Side effects
- Declares: `config`
- Reads: `hoist`, `userland`
- Write: `config`

## Item 18: Stmt 11, `VarDeclarator(0)`

```js
export const reportWebVitals = hoist(userland, 'reportWebVitals');

```

- Side effects
- Declares: `reportWebVitals`
- Reads: `hoist`, `userland`
- Write: `reportWebVitals`

## Item 19: Stmt 12, `VarDeclarator(0)`

```js
export const unstable_getStaticProps = hoist(userland, 'unstable_getStaticProps');

```

- Side effects
- Declares: `unstable_getStaticProps`
- Reads: `hoist`, `userland`
- Write: `unstable_getStaticProps`

## Item 20: Stmt 13, `VarDeclarator(0)`

```js
export const unstable_getStaticPaths = hoist(userland, 'unstable_getStaticPaths');

```

- Side effects
- Declares: `unstable_getStaticPaths`
- Reads: `hoist`, `userland`
- Write: `unstable_getStaticPaths`

## Item 21: Stmt 14, `VarDeclarator(0)`

```js
export const unstable_getStaticParams = hoist(userland, 'unstable_getStaticParams');

```

- Side effects
- Declares: `unstable_getStaticParams`
- Reads: `hoist`, `userland`
- Write: `unstable_getStaticParams`

## Item 22: Stmt 15, `VarDeclarator(0)`

```js
export const unstable_getServerProps = hoist(userland, 'unstable_getServerProps');

```

- Side effects
- Declares: `unstable_getServerProps`
- Reads: `hoist`, `userland`
- Write: `unstable_getServerProps`

## Item 23: Stmt 16, `VarDeclarator(0)`

```js
export const unstable_getServerSideProps = hoist(userland, 'unstable_getServerSideProps');

```

- Side effects
- Declares: `unstable_getServerSideProps`
- Reads: `hoist`, `userland`
- Write: `unstable_getServerSideProps`

## Item 24: Stmt 17, `VarDeclarator(0)`

```js
export const routeModule = new PagesRouteModule({
    definition: {
        kind: RouteKind.PAGES,
        page: 'VAR_DEFINITION_PAGE',
        pathname: 'VAR_DEFINITION_PATHNAME',
        bundlePath: '',
        filename: ''
    },
    components: {
        App,
        Document
    },
    userland
});

```

- Side effects
- Declares: `routeModule`
- Reads: `PagesRouteModule`, `RouteKind`, `App`, `Document`, `userland`
- Write: `RouteKind`, `App`, `Document`, `userland`, `routeModule`

# Phase 1
```mermaid
graph TD
    Item1;
    Item7;
    Item2;
    Item8;
    Item3;
    Item9;
    Item4;
    Item10;
    Item5;
    Item11;
    Item6;
    Item12;
    Item13;
    Item14;
    Item15;
    Item16;
    Item17;
    Item18;
    Item19;
    Item20;
    Item21;
    Item22;
    Item23;
    Item24;
    Item25;
    Item25["export default"];
    Item26;
    Item26["export getStaticProps"];
    Item27;
    Item27["export getStaticPaths"];
    Item28;
    Item28["export getServerSideProps"];
    Item29;
    Item29["export config"];
    Item30;
    Item30["export reportWebVitals"];
    Item31;
    Item31["export unstable_getStaticProps"];
    Item32;
    Item32["export unstable_getStaticPaths"];
    Item33;
    Item33["export unstable_getStaticParams"];
    Item34;
    Item34["export unstable_getServerProps"];
    Item35;
    Item35["export unstable_getServerSideProps"];
    Item36;
    Item36["export routeModule"];
    Item2 --> Item1;
    Item3 --> Item2;
    Item4 --> Item3;
    Item5 --> Item4;
    Item6 --> Item5;
```
# Phase 2
```mermaid
graph TD
    Item1;
    Item7;
    Item2;
    Item8;
    Item3;
    Item9;
    Item4;
    Item10;
    Item5;
    Item11;
    Item6;
    Item12;
    Item13;
    Item14;
    Item15;
    Item16;
    Item17;
    Item18;
    Item19;
    Item20;
    Item21;
    Item22;
    Item23;
    Item24;
    Item25;
    Item25["export default"];
    Item26;
    Item26["export getStaticProps"];
    Item27;
    Item27["export getStaticPaths"];
    Item28;
    Item28["export getServerSideProps"];
    Item29;
    Item29["export config"];
    Item30;
    Item30["export reportWebVitals"];
    Item31;
    Item31["export unstable_getStaticProps"];
    Item32;
    Item32["export unstable_getStaticPaths"];
    Item33;
    Item33["export unstable_getStaticParams"];
    Item34;
    Item34["export unstable_getServerProps"];
    Item35;
    Item35["export unstable_getServerSideProps"];
    Item36;
    Item36["export routeModule"];
    Item2 --> Item1;
    Item3 --> Item2;
    Item4 --> Item3;
    Item5 --> Item4;
    Item6 --> Item5;
    Item13 --> Item9;
    Item13 --> Item12;
    Item13 --> Item6;
    Item14 --> Item9;
    Item14 --> Item12;
    Item14 --> Item13;
    Item15 --> Item9;
    Item15 --> Item12;
    Item15 --> Item14;
    Item16 --> Item9;
    Item16 --> Item12;
    Item16 --> Item15;
    Item17 --> Item9;
    Item17 --> Item12;
    Item17 --> Item16;
    Item18 --> Item9;
    Item18 --> Item12;
    Item18 --> Item17;
    Item19 --> Item9;
    Item19 --> Item12;
    Item19 --> Item18;
    Item20 --> Item9;
    Item20 --> Item12;
    Item20 --> Item19;
    Item21 --> Item9;
    Item21 --> Item12;
    Item21 --> Item20;
    Item22 --> Item9;
    Item22 --> Item12;
    Item22 --> Item21;
    Item23 --> Item9;
    Item23 --> Item12;
    Item23 --> Item22;
    Item24 --> Item7;
    Item24 --> Item8;
    Item24 --> Item11;
    Item24 --> Item10;
    Item24 --> Item12;
    Item24 --> Item23;
    Item25 --> Item13;
    Item26 --> Item14;
    Item27 --> Item15;
    Item28 --> Item16;
    Item29 --> Item17;
    Item30 --> Item18;
    Item31 --> Item19;
    Item32 --> Item20;
    Item33 --> Item21;
    Item34 --> Item22;
    Item35 --> Item23;
    Item36 --> Item24;
```
# Phase 3
```mermaid
graph TD
    Item1;
    Item7;
    Item2;
    Item8;
    Item3;
    Item9;
    Item4;
    Item10;
    Item5;
    Item11;
    Item6;
    Item12;
    Item13;
    Item14;
    Item15;
    Item16;
    Item17;
    Item18;
    Item19;
    Item20;
    Item21;
    Item22;
    Item23;
    Item24;
    Item25;
    Item25["export default"];
    Item26;
    Item26["export getStaticProps"];
    Item27;
    Item27["export getStaticPaths"];
    Item28;
    Item28["export getServerSideProps"];
    Item29;
    Item29["export config"];
    Item30;
    Item30["export reportWebVitals"];
    Item31;
    Item31["export unstable_getStaticProps"];
    Item32;
    Item32["export unstable_getStaticPaths"];
    Item33;
    Item33["export unstable_getStaticParams"];
    Item34;
    Item34["export unstable_getServerProps"];
    Item35;
    Item35["export unstable_getServerSideProps"];
    Item36;
    Item36["export routeModule"];
    Item2 --> Item1;
    Item3 --> Item2;
    Item4 --> Item3;
    Item5 --> Item4;
    Item6 --> Item5;
    Item13 --> Item9;
    Item13 --> Item12;
    Item13 --> Item6;
    Item14 --> Item9;
    Item14 --> Item12;
    Item14 --> Item13;
    Item15 --> Item9;
    Item15 --> Item12;
    Item15 --> Item14;
    Item16 --> Item9;
    Item16 --> Item12;
    Item16 --> Item15;
    Item17 --> Item9;
    Item17 --> Item12;
    Item17 --> Item16;
    Item18 --> Item9;
    Item18 --> Item12;
    Item18 --> Item17;
    Item19 --> Item9;
    Item19 --> Item12;
    Item19 --> Item18;
    Item20 --> Item9;
    Item20 --> Item12;
    Item20 --> Item19;
    Item21 --> Item9;
    Item21 --> Item12;
    Item21 --> Item20;
    Item22 --> Item9;
    Item22 --> Item12;
    Item22 --> Item21;
    Item23 --> Item9;
    Item23 --> Item12;
    Item23 --> Item22;
    Item24 --> Item7;
    Item24 --> Item8;
    Item24 --> Item11;
    Item24 --> Item10;
    Item24 --> Item12;
    Item24 --> Item23;
    Item25 --> Item13;
    Item26 --> Item14;
    Item27 --> Item15;
    Item28 --> Item16;
    Item29 --> Item17;
    Item30 --> Item18;
    Item31 --> Item19;
    Item32 --> Item20;
    Item33 --> Item21;
    Item34 --> Item22;
    Item35 --> Item23;
    Item36 --> Item24;
```
# Phase 4
```mermaid
graph TD
    Item1;
    Item7;
    Item2;
    Item8;
    Item3;
    Item9;
    Item4;
    Item10;
    Item5;
    Item11;
    Item6;
    Item12;
    Item13;
    Item14;
    Item15;
    Item16;
    Item17;
    Item18;
    Item19;
    Item20;
    Item21;
    Item22;
    Item23;
    Item24;
    Item25;
    Item25["export default"];
    Item26;
    Item26["export getStaticProps"];
    Item27;
    Item27["export getStaticPaths"];
    Item28;
    Item28["export getServerSideProps"];
    Item29;
    Item29["export config"];
    Item30;
    Item30["export reportWebVitals"];
    Item31;
    Item31["export unstable_getStaticProps"];
    Item32;
    Item32["export unstable_getStaticPaths"];
    Item33;
    Item33["export unstable_getStaticParams"];
    Item34;
    Item34["export unstable_getServerProps"];
    Item35;
    Item35["export unstable_getServerSideProps"];
    Item36;
    Item36["export routeModule"];
    Item2 --> Item1;
    Item3 --> Item2;
    Item4 --> Item3;
    Item5 --> Item4;
    Item6 --> Item5;
    Item13 --> Item9;
    Item13 --> Item12;
    Item13 --> Item6;
    Item14 --> Item9;
    Item14 --> Item12;
    Item14 --> Item13;
    Item15 --> Item9;
    Item15 --> Item12;
    Item15 --> Item14;
    Item16 --> Item9;
    Item16 --> Item12;
    Item16 --> Item15;
    Item17 --> Item9;
    Item17 --> Item12;
    Item17 --> Item16;
    Item18 --> Item9;
    Item18 --> Item12;
    Item18 --> Item17;
    Item19 --> Item9;
    Item19 --> Item12;
    Item19 --> Item18;
    Item20 --> Item9;
    Item20 --> Item12;
    Item20 --> Item19;
    Item21 --> Item9;
    Item21 --> Item12;
    Item21 --> Item20;
    Item22 --> Item9;
    Item22 --> Item12;
    Item22 --> Item21;
    Item23 --> Item9;
    Item23 --> Item12;
    Item23 --> Item22;
    Item24 --> Item7;
    Item24 --> Item8;
    Item24 --> Item11;
    Item24 --> Item10;
    Item24 --> Item12;
    Item24 --> Item23;
    Item25 --> Item13;
    Item26 --> Item14;
    Item27 --> Item15;
    Item28 --> Item16;
    Item29 --> Item17;
    Item30 --> Item18;
    Item31 --> Item19;
    Item32 --> Item20;
    Item33 --> Item21;
    Item34 --> Item22;
    Item35 --> Item23;
    Item36 --> Item24;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(0, ImportOfModule), ItemId(Export((&quot;unstable_getServerProps&quot;, #2), &quot;unstable_getServerProps&quot;))]"];
    N1["Items: [ItemId(0, ImportBinding(0))]"];
    N2["Items: [ItemId(1, ImportOfModule), ItemId(2, ImportOfModule)]"];
    N3["Items: [ItemId(1, ImportBinding(0))]"];
    N4["Items: [ItemId(2, ImportBinding(0))]"];
    N5["Items: [ItemId(3, ImportOfModule), ItemId(17, VarDeclarator(0)), ItemId(Export((&quot;routeModule&quot;, #2), &quot;routeModule&quot;))]"];
    N6["Items: [ItemId(3, ImportBinding(0))]"];
    N7["Items: [ItemId(4, ImportOfModule), ItemId(5, ImportOfModule), ItemId(6, Normal), ItemId(7, VarDeclarator(0)), ItemId(8, VarDeclarator(0)), ItemId(9, VarDeclarator(0)), ItemId(10, VarDeclarator(0)), ItemId(11, VarDeclarator(0)), ItemId(12, VarDeclarator(0)), ItemId(13, VarDeclarator(0)), ItemId(Export((&quot;unstable_getStaticProps&quot;, #2), &quot;unstable_getStaticProps&quot;))]"];
    N8["Items: [ItemId(4, ImportBinding(0))]"];
    N9["Items: [ItemId(5, ImportBinding(0))]"];
    N10["Items: [ItemId(14, VarDeclarator(0)), ItemId(15, VarDeclarator(0)), ItemId(16, VarDeclarator(0))]"];
    N11["Items: [ItemId(Export((&quot;__TURBOPACK__default__export__&quot;, #3), &quot;default&quot;))]"];
    N12["Items: [ItemId(Export((&quot;config&quot;, #2), &quot;config&quot;))]"];
    N13["Items: [ItemId(Export((&quot;getServerSideProps&quot;, #2), &quot;getServerSideProps&quot;))]"];
    N14["Items: [ItemId(Export((&quot;getStaticPaths&quot;, #2), &quot;getStaticPaths&quot;))]"];
    N15["Items: [ItemId(Export((&quot;getStaticProps&quot;, #2), &quot;getStaticProps&quot;))]"];
    N16["Items: [ItemId(Export((&quot;reportWebVitals&quot;, #2), &quot;reportWebVitals&quot;))]"];
    N17["Items: [ItemId(Export((&quot;unstable_getServerSideProps&quot;, #2), &quot;unstable_getServerSideProps&quot;))]"];
    N18["Items: [ItemId(Export((&quot;unstable_getStaticParams&quot;, #2), &quot;unstable_getStaticParams&quot;))]"];
    N19["Items: [ItemId(Export((&quot;unstable_getStaticPaths&quot;, #2), &quot;unstable_getStaticPaths&quot;))]"];
    N7 --> N4;
    N7 --> N9;
    N5 --> N2;
    N10 --> N4;
    N4 --> N2;
    N5 --> N9;
    N5 --> N1;
    N17 --> N10;
    N5 --> N10;
    N5 --> N6;
    N10 --> N9;
    N5 --> N8;
    N5 --> N3;
```
# Entrypoints

```
{
    ModuleEvaluation: 5,
    Export(
        "config",
    ): 12,
    Export(
        "default",
    ): 11,
    Export(
        "getServerSideProps",
    ): 13,
    Export(
        "getStaticPaths",
    ): 14,
    Export(
        "getStaticProps",
    ): 15,
    Export(
        "reportWebVitals",
    ): 16,
    Export(
        "routeModule",
    ): 5,
    Export(
        "unstable_getServerProps",
    ): 0,
    Export(
        "unstable_getServerSideProps",
    ): 17,
    Export(
        "unstable_getStaticParams",
    ): 18,
    Export(
        "unstable_getStaticPaths",
    ): 19,
    Export(
        "unstable_getStaticProps",
    ): 7,
    Exports: 20,
}
```


# Modules (dev)
## Part 0
```js
import { a as unstable_getServerProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -10
};
import '../../server/future/route-modules/pages/module.compiled';
export { unstable_getServerProps };

```
## Part 1
```js

```
## Part 2
```js
import '../../server/future/route-kind';
import './helpers';

```
## Part 3
```js

```
## Part 4
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};

```
## Part 5
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { PagesRouteModule } from '../../server/future/route-modules/pages/module.compiled';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { RouteKind } from '../../server/future/route-kind';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import App from 'VAR_MODULE_APP';
import Document from 'VAR_MODULE_DOCUMENT';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import * as userland from 'VAR_USERLAND';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import 'VAR_MODULE_DOCUMENT';
const routeModule = new PagesRouteModule({
    definition: {
        kind: RouteKind.PAGES,
        page: 'VAR_DEFINITION_PAGE',
        pathname: 'VAR_DEFINITION_PATHNAME',
        bundlePath: '',
        filename: ''
    },
    components: {
        App,
        Document
    },
    userland
});
export { routeModule };
export { routeModule as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { };

```
## Part 6
```js

```
## Part 7
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { hoist } from './helpers';
import * as userland from 'VAR_USERLAND';
import 'VAR_MODULE_APP';
import 'VAR_USERLAND';
const __TURBOPACK__default__export__ = hoist(userland, 'default');
const getStaticProps = hoist(userland, 'getStaticProps');
const getStaticPaths = hoist(userland, 'getStaticPaths');
const getServerSideProps = hoist(userland, 'getServerSideProps');
const config = hoist(userland, 'config');
const reportWebVitals = hoist(userland, 'reportWebVitals');
const unstable_getStaticProps = hoist(userland, 'unstable_getStaticProps');
const unstable_getStaticPaths = hoist(userland, 'unstable_getStaticPaths');
export { unstable_getStaticProps };
export { __TURBOPACK__default__export__ as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { getStaticProps as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { getStaticPaths as e } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { getServerSideProps as f } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { config as g } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { reportWebVitals as h } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { unstable_getStaticProps as i } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { unstable_getStaticPaths as j } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 8
```js

```
## Part 9
```js

```
## Part 10
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { hoist } from './helpers';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import * as userland from 'VAR_USERLAND';
const unstable_getStaticParams = hoist(userland, 'unstable_getStaticParams');
const unstable_getServerProps = hoist(userland, 'unstable_getServerProps');
const unstable_getServerSideProps = hoist(userland, 'unstable_getServerSideProps');
export { unstable_getStaticParams as k } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { unstable_getServerProps as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { unstable_getServerSideProps as l } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 11
```js
import { c as __TURBOPACK__default__export__ } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -7
};
export { __TURBOPACK__default__export__ as default };

```
## Part 12
```js
import { g as config } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -7
};
export { config };

```
## Part 13
```js
import { f as getServerSideProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -7
};
export { getServerSideProps };

```
## Part 14
```js
import { e as getStaticPaths } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -7
};
export { getStaticPaths };

```
## Part 15
```js
import { d as getStaticProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -7
};
export { getStaticProps };

```
## Part 16
```js
import { h as reportWebVitals } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -7
};
export { reportWebVitals };

```
## Part 17
```js
import { l as unstable_getServerSideProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -10
};
export { unstable_getServerSideProps };

```
## Part 18
```js
import { k as unstable_getStaticParams } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -10
};
export { unstable_getStaticParams };

```
## Part 19
```js
import { j as unstable_getStaticPaths } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -7
};
export { unstable_getStaticPaths };

```
## Part 20
```js
export { unstable_getServerProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export unstable_getServerProps"
};
export { routeModule } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export routeModule"
};
export { unstable_getStaticProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export unstable_getStaticProps"
};
export { default } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export default"
};
export { config } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export config"
};
export { getServerSideProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export getServerSideProps"
};
export { getStaticPaths } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export getStaticPaths"
};
export { getStaticProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export getStaticProps"
};
export { reportWebVitals } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export reportWebVitals"
};
export { unstable_getServerSideProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export unstable_getServerSideProps"
};
export { unstable_getStaticParams } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export unstable_getStaticParams"
};
export { unstable_getStaticPaths } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export unstable_getStaticPaths"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { PagesRouteModule } from '../../server/future/route-modules/pages/module.compiled';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { RouteKind } from '../../server/future/route-kind';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import App from 'VAR_MODULE_APP';
import Document from 'VAR_MODULE_DOCUMENT';
import * as userland from 'VAR_USERLAND';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import 'VAR_MODULE_DOCUMENT';
const routeModule = new PagesRouteModule({
    definition: {
        kind: RouteKind.PAGES,
        page: 'VAR_DEFINITION_PAGE',
        pathname: 'VAR_DEFINITION_PATHNAME',
        bundlePath: '',
        filename: ''
    },
    components: {
        App,
        Document
    },
    userland
});
export { routeModule };
export { routeModule as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { };

```
# Entrypoints

```
{
    ModuleEvaluation: 5,
    Export(
        "config",
    ): 12,
    Export(
        "default",
    ): 11,
    Export(
        "getServerSideProps",
    ): 13,
    Export(
        "getStaticPaths",
    ): 14,
    Export(
        "getStaticProps",
    ): 15,
    Export(
        "reportWebVitals",
    ): 16,
    Export(
        "routeModule",
    ): 5,
    Export(
        "unstable_getServerProps",
    ): 0,
    Export(
        "unstable_getServerSideProps",
    ): 17,
    Export(
        "unstable_getStaticParams",
    ): 18,
    Export(
        "unstable_getStaticPaths",
    ): 19,
    Export(
        "unstable_getStaticProps",
    ): 7,
    Exports: 20,
}
```


# Modules (prod)
## Part 0
```js
import { a as unstable_getServerProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -10
};
import '../../server/future/route-modules/pages/module.compiled';
export { unstable_getServerProps };

```
## Part 1
```js

```
## Part 2
```js
import '../../server/future/route-kind';
import './helpers';

```
## Part 3
```js

```
## Part 4
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};

```
## Part 5
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { PagesRouteModule } from '../../server/future/route-modules/pages/module.compiled';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { RouteKind } from '../../server/future/route-kind';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import App from 'VAR_MODULE_APP';
import Document from 'VAR_MODULE_DOCUMENT';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import * as userland from 'VAR_USERLAND';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import 'VAR_MODULE_DOCUMENT';
const routeModule = new PagesRouteModule({
    definition: {
        kind: RouteKind.PAGES,
        page: 'VAR_DEFINITION_PAGE',
        pathname: 'VAR_DEFINITION_PATHNAME',
        bundlePath: '',
        filename: ''
    },
    components: {
        App,
        Document
    },
    userland
});
export { routeModule };
export { routeModule as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { };

```
## Part 6
```js

```
## Part 7
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { hoist } from './helpers';
import * as userland from 'VAR_USERLAND';
import 'VAR_MODULE_APP';
import 'VAR_USERLAND';
const __TURBOPACK__default__export__ = hoist(userland, 'default');
const getStaticProps = hoist(userland, 'getStaticProps');
const getStaticPaths = hoist(userland, 'getStaticPaths');
const getServerSideProps = hoist(userland, 'getServerSideProps');
const config = hoist(userland, 'config');
const reportWebVitals = hoist(userland, 'reportWebVitals');
const unstable_getStaticProps = hoist(userland, 'unstable_getStaticProps');
const unstable_getStaticPaths = hoist(userland, 'unstable_getStaticPaths');
export { unstable_getStaticProps };
export { __TURBOPACK__default__export__ as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { getStaticProps as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { getStaticPaths as e } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { getServerSideProps as f } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { config as g } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { reportWebVitals as h } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { unstable_getStaticProps as i } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { unstable_getStaticPaths as j } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 8
```js

```
## Part 9
```js

```
## Part 10
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { hoist } from './helpers';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import * as userland from 'VAR_USERLAND';
const unstable_getStaticParams = hoist(userland, 'unstable_getStaticParams');
const unstable_getServerProps = hoist(userland, 'unstable_getServerProps');
const unstable_getServerSideProps = hoist(userland, 'unstable_getServerSideProps');
export { unstable_getStaticParams as k } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { unstable_getServerProps as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { unstable_getServerSideProps as l } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 11
```js
import { c as __TURBOPACK__default__export__ } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -7
};
export { __TURBOPACK__default__export__ as default };

```
## Part 12
```js
import { g as config } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -7
};
export { config };

```
## Part 13
```js
import { f as getServerSideProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -7
};
export { getServerSideProps };

```
## Part 14
```js
import { e as getStaticPaths } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -7
};
export { getStaticPaths };

```
## Part 15
```js
import { d as getStaticProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -7
};
export { getStaticProps };

```
## Part 16
```js
import { h as reportWebVitals } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -7
};
export { reportWebVitals };

```
## Part 17
```js
import { l as unstable_getServerSideProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -10
};
export { unstable_getServerSideProps };

```
## Part 18
```js
import { k as unstable_getStaticParams } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -10
};
export { unstable_getStaticParams };

```
## Part 19
```js
import { j as unstable_getStaticPaths } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -7
};
export { unstable_getStaticPaths };

```
## Part 20
```js
export { unstable_getServerProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export unstable_getServerProps"
};
export { routeModule } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export routeModule"
};
export { unstable_getStaticProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export unstable_getStaticProps"
};
export { default } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export default"
};
export { config } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export config"
};
export { getServerSideProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export getServerSideProps"
};
export { getStaticPaths } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export getStaticPaths"
};
export { getStaticProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export getStaticProps"
};
export { reportWebVitals } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export reportWebVitals"
};
export { unstable_getServerSideProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export unstable_getServerSideProps"
};
export { unstable_getStaticParams } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export unstable_getStaticParams"
};
export { unstable_getStaticPaths } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export unstable_getStaticPaths"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { PagesRouteModule } from '../../server/future/route-modules/pages/module.compiled';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { RouteKind } from '../../server/future/route-kind';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import App from 'VAR_MODULE_APP';
import Document from 'VAR_MODULE_DOCUMENT';
import * as userland from 'VAR_USERLAND';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import 'VAR_MODULE_DOCUMENT';
const routeModule = new PagesRouteModule({
    definition: {
        kind: RouteKind.PAGES,
        page: 'VAR_DEFINITION_PAGE',
        pathname: 'VAR_DEFINITION_PATHNAME',
        bundlePath: '',
        filename: ''
    },
    components: {
        App,
        Document
    },
    userland
});
export { routeModule };
export { routeModule as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { };

```
