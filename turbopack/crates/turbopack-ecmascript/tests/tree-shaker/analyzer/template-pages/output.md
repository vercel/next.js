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
    N0["Items: [ItemId(0, ImportOfModule)]"];
    N1["Items: [ItemId(0, ImportBinding(0))]"];
    N2["Items: [ItemId(1, ImportOfModule)]"];
    N3["Items: [ItemId(1, ImportBinding(0))]"];
    N4["Items: [ItemId(2, ImportOfModule)]"];
    N5["Items: [ItemId(2, ImportBinding(0))]"];
    N6["Items: [ItemId(3, ImportOfModule)]"];
    N7["Items: [ItemId(3, ImportBinding(0))]"];
    N8["Items: [ItemId(4, ImportOfModule)]"];
    N9["Items: [ItemId(4, ImportBinding(0))]"];
    N10["Items: [ItemId(5, ImportOfModule)]"];
    N11["Items: [ItemId(5, ImportBinding(0))]"];
    N12["Items: [ItemId(6, Normal)]"];
    N13["Items: [ItemId(7, VarDeclarator(0))]"];
    N14["Items: [ItemId(8, VarDeclarator(0))]"];
    N15["Items: [ItemId(9, VarDeclarator(0))]"];
    N16["Items: [ItemId(10, VarDeclarator(0))]"];
    N17["Items: [ItemId(11, VarDeclarator(0))]"];
    N18["Items: [ItemId(12, VarDeclarator(0))]"];
    N19["Items: [ItemId(13, VarDeclarator(0))]"];
    N20["Items: [ItemId(14, VarDeclarator(0))]"];
    N21["Items: [ItemId(15, VarDeclarator(0))]"];
    N22["Items: [ItemId(16, VarDeclarator(0))]"];
    N23["Items: [ItemId(17, VarDeclarator(0)), ItemId(Export((&quot;routeModule&quot;, #2), &quot;routeModule&quot;))]"];
    N24["Items: [ItemId(Export((&quot;__TURBOPACK__default__export__&quot;, #0), &quot;default&quot;))]"];
    N25["Items: [ItemId(Export((&quot;config&quot;, #2), &quot;config&quot;))]"];
    N26["Items: [ItemId(Export((&quot;getServerSideProps&quot;, #2), &quot;getServerSideProps&quot;))]"];
    N27["Items: [ItemId(Export((&quot;getStaticPaths&quot;, #2), &quot;getStaticPaths&quot;))]"];
    N28["Items: [ItemId(Export((&quot;getStaticProps&quot;, #2), &quot;getStaticProps&quot;))]"];
    N29["Items: [ItemId(Export((&quot;reportWebVitals&quot;, #2), &quot;reportWebVitals&quot;))]"];
    N30["Items: [ItemId(Export((&quot;unstable_getServerProps&quot;, #2), &quot;unstable_getServerProps&quot;))]"];
    N31["Items: [ItemId(Export((&quot;unstable_getServerSideProps&quot;, #2), &quot;unstable_getServerSideProps&quot;))]"];
    N32["Items: [ItemId(Export((&quot;unstable_getStaticParams&quot;, #2), &quot;unstable_getStaticParams&quot;))]"];
    N33["Items: [ItemId(Export((&quot;unstable_getStaticPaths&quot;, #2), &quot;unstable_getStaticPaths&quot;))]"];
    N34["Items: [ItemId(Export((&quot;unstable_getStaticProps&quot;, #2), &quot;unstable_getStaticProps&quot;))]"];
    N2 --> N0;
    N4 --> N2;
    N6 --> N4;
    N8 --> N6;
    N10 --> N8;
    N12 --> N5;
    N12 --> N11;
    N12 --> N10;
    N13 --> N5;
    N13 --> N11;
    N13 --> N12;
    N14 --> N5;
    N14 --> N11;
    N14 --> N13;
    N15 --> N5;
    N15 --> N11;
    N15 --> N14;
    N16 --> N5;
    N16 --> N11;
    N16 --> N15;
    N17 --> N5;
    N17 --> N11;
    N17 --> N16;
    N18 --> N5;
    N18 --> N11;
    N18 --> N17;
    N19 --> N5;
    N19 --> N11;
    N19 --> N18;
    N20 --> N5;
    N20 --> N11;
    N20 --> N19;
    N21 --> N5;
    N21 --> N11;
    N21 --> N20;
    N22 --> N5;
    N22 --> N11;
    N22 --> N21;
    N23 --> N22;
    N23 --> N11;
    N23 --> N7;
    N23 --> N9;
    N23 --> N3;
    N23 --> N1;
    N24 --> N12;
    N28 --> N13;
    N27 --> N14;
    N26 --> N15;
    N25 --> N16;
    N29 --> N17;
    N34 --> N18;
    N33 --> N19;
    N32 --> N20;
    N30 --> N21;
    N31 --> N22;
    N11 --> N10;
    N1 --> N0;
    N3 --> N2;
    N5 --> N4;
    N7 --> N6;
    N9 --> N8;
```
# Entrypoints

```
{
    ModuleEvaluation: 23,
    Export(
        "config",
    ): 25,
    Export(
        "default",
    ): 24,
    Export(
        "getServerSideProps",
    ): 26,
    Export(
        "getStaticPaths",
    ): 27,
    Export(
        "getStaticProps",
    ): 28,
    Export(
        "reportWebVitals",
    ): 29,
    Export(
        "routeModule",
    ): 23,
    Export(
        "unstable_getServerProps",
    ): 30,
    Export(
        "unstable_getServerSideProps",
    ): 31,
    Export(
        "unstable_getStaticParams",
    ): 32,
    Export(
        "unstable_getStaticPaths",
    ): 33,
    Export(
        "unstable_getStaticProps",
    ): 34,
    Exports: 35,
}
```


# Modules (dev)
## Part 0
```js
import '../../server/future/route-modules/pages/module.compiled';

```
## Part 1
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};

```
## Part 2
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import '../../server/future/route-kind';

```
## Part 3
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};

```
## Part 4
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import './helpers';

```
## Part 5
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};

```
## Part 6
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import 'VAR_MODULE_DOCUMENT';

```
## Part 7
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};

```
## Part 8
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import 'VAR_MODULE_APP';

```
## Part 9
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};

```
## Part 10
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import 'VAR_USERLAND';

```
## Part 11
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};

```
## Part 12
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { hoist } from './helpers';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import * as userland from 'VAR_USERLAND';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
const __TURBOPACK__default__export__ = hoist(userland, 'default');
export { __TURBOPACK__default__export__ as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 13
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { hoist } from './helpers';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import * as userland from 'VAR_USERLAND';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
const getStaticProps = hoist(userland, 'getStaticProps');
export { getStaticProps as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 14
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { hoist } from './helpers';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import * as userland from 'VAR_USERLAND';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
const getStaticPaths = hoist(userland, 'getStaticPaths');
export { getStaticPaths as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 15
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { hoist } from './helpers';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import * as userland from 'VAR_USERLAND';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
const getServerSideProps = hoist(userland, 'getServerSideProps');
export { getServerSideProps as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 16
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { hoist } from './helpers';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import * as userland from 'VAR_USERLAND';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 15
};
const config = hoist(userland, 'config');
export { config as e } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 17
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { hoist } from './helpers';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import * as userland from 'VAR_USERLAND';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
const reportWebVitals = hoist(userland, 'reportWebVitals');
export { reportWebVitals as f } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 18
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { hoist } from './helpers';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import * as userland from 'VAR_USERLAND';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 17
};
const unstable_getStaticProps = hoist(userland, 'unstable_getStaticProps');
export { unstable_getStaticProps as g } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 19
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { hoist } from './helpers';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import * as userland from 'VAR_USERLAND';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 18
};
const unstable_getStaticPaths = hoist(userland, 'unstable_getStaticPaths');
export { unstable_getStaticPaths as h } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 20
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { hoist } from './helpers';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import * as userland from 'VAR_USERLAND';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 19
};
const unstable_getStaticParams = hoist(userland, 'unstable_getStaticParams');
export { unstable_getStaticParams as i } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 21
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { hoist } from './helpers';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import * as userland from 'VAR_USERLAND';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
const unstable_getServerProps = hoist(userland, 'unstable_getServerProps');
export { unstable_getServerProps as j } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 22
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { hoist } from './helpers';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import * as userland from 'VAR_USERLAND';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 21
};
const unstable_getServerSideProps = hoist(userland, 'unstable_getServerSideProps');
export { unstable_getServerSideProps as k } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 23
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
    __turbopack_part__: 8
};
import App from 'VAR_MODULE_APP';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import Document from 'VAR_MODULE_DOCUMENT';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import * as userland from 'VAR_USERLAND';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 22
};
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
export { routeModule as l } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { };

```
## Part 24
```js
import { a as __TURBOPACK__default__export__ } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -12
};
export { __TURBOPACK__default__export__ as default };

```
## Part 25
```js
import { e as config } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -16
};
export { config };

```
## Part 26
```js
import { d as getServerSideProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -15
};
export { getServerSideProps };

```
## Part 27
```js
import { c as getStaticPaths } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
export { getStaticPaths };

```
## Part 28
```js
import { b as getStaticProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -13
};
export { getStaticProps };

```
## Part 29
```js
import { f as reportWebVitals } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -17
};
export { reportWebVitals };

```
## Part 30
```js
import { j as unstable_getServerProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -21
};
export { unstable_getServerProps };

```
## Part 31
```js
import { k as unstable_getServerSideProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -22
};
export { unstable_getServerSideProps };

```
## Part 32
```js
import { i as unstable_getStaticParams } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -20
};
export { unstable_getStaticParams };

```
## Part 33
```js
import { h as unstable_getStaticPaths } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -19
};
export { unstable_getStaticPaths };

```
## Part 34
```js
import { g as unstable_getStaticProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -18
};
export { unstable_getStaticProps };

```
## Part 35
```js
export { routeModule } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export routeModule"
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
export { unstable_getServerProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export unstable_getServerProps"
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
export { unstable_getStaticProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export unstable_getStaticProps"
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
    __turbopack_part__: 8
};
import App from 'VAR_MODULE_APP';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import Document from 'VAR_MODULE_DOCUMENT';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import * as userland from 'VAR_USERLAND';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 22
};
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
export { routeModule as l } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { };

```
# Entrypoints

```
{
    ModuleEvaluation: 23,
    Export(
        "config",
    ): 25,
    Export(
        "default",
    ): 24,
    Export(
        "getServerSideProps",
    ): 26,
    Export(
        "getStaticPaths",
    ): 27,
    Export(
        "getStaticProps",
    ): 28,
    Export(
        "reportWebVitals",
    ): 29,
    Export(
        "routeModule",
    ): 23,
    Export(
        "unstable_getServerProps",
    ): 30,
    Export(
        "unstable_getServerSideProps",
    ): 31,
    Export(
        "unstable_getStaticParams",
    ): 32,
    Export(
        "unstable_getStaticPaths",
    ): 33,
    Export(
        "unstable_getStaticProps",
    ): 34,
    Exports: 35,
}
```


# Modules (prod)
## Part 0
```js
import '../../server/future/route-modules/pages/module.compiled';

```
## Part 1
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};

```
## Part 2
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import '../../server/future/route-kind';

```
## Part 3
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};

```
## Part 4
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import './helpers';

```
## Part 5
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};

```
## Part 6
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import 'VAR_MODULE_DOCUMENT';

```
## Part 7
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};

```
## Part 8
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import 'VAR_MODULE_APP';

```
## Part 9
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};

```
## Part 10
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import 'VAR_USERLAND';

```
## Part 11
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};

```
## Part 12
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { hoist } from './helpers';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import * as userland from 'VAR_USERLAND';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
const __TURBOPACK__default__export__ = hoist(userland, 'default');
export { __TURBOPACK__default__export__ as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 13
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { hoist } from './helpers';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import * as userland from 'VAR_USERLAND';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
const getStaticProps = hoist(userland, 'getStaticProps');
export { getStaticProps as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 14
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { hoist } from './helpers';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import * as userland from 'VAR_USERLAND';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
const getStaticPaths = hoist(userland, 'getStaticPaths');
export { getStaticPaths as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 15
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { hoist } from './helpers';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import * as userland from 'VAR_USERLAND';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
const getServerSideProps = hoist(userland, 'getServerSideProps');
export { getServerSideProps as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 16
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { hoist } from './helpers';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import * as userland from 'VAR_USERLAND';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 15
};
const config = hoist(userland, 'config');
export { config as e } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 17
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { hoist } from './helpers';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import * as userland from 'VAR_USERLAND';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
const reportWebVitals = hoist(userland, 'reportWebVitals');
export { reportWebVitals as f } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 18
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { hoist } from './helpers';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import * as userland from 'VAR_USERLAND';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 17
};
const unstable_getStaticProps = hoist(userland, 'unstable_getStaticProps');
export { unstable_getStaticProps as g } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 19
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { hoist } from './helpers';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import * as userland from 'VAR_USERLAND';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 18
};
const unstable_getStaticPaths = hoist(userland, 'unstable_getStaticPaths');
export { unstable_getStaticPaths as h } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 20
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { hoist } from './helpers';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import * as userland from 'VAR_USERLAND';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 19
};
const unstable_getStaticParams = hoist(userland, 'unstable_getStaticParams');
export { unstable_getStaticParams as i } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 21
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { hoist } from './helpers';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import * as userland from 'VAR_USERLAND';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
const unstable_getServerProps = hoist(userland, 'unstable_getServerProps');
export { unstable_getServerProps as j } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 22
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { hoist } from './helpers';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import * as userland from 'VAR_USERLAND';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 21
};
const unstable_getServerSideProps = hoist(userland, 'unstable_getServerSideProps');
export { unstable_getServerSideProps as k } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 23
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
    __turbopack_part__: 8
};
import App from 'VAR_MODULE_APP';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import Document from 'VAR_MODULE_DOCUMENT';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import * as userland from 'VAR_USERLAND';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 22
};
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
export { routeModule as l } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { };

```
## Part 24
```js
import { a as __TURBOPACK__default__export__ } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -12
};
export { __TURBOPACK__default__export__ as default };

```
## Part 25
```js
import { e as config } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -16
};
export { config };

```
## Part 26
```js
import { d as getServerSideProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -15
};
export { getServerSideProps };

```
## Part 27
```js
import { c as getStaticPaths } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
export { getStaticPaths };

```
## Part 28
```js
import { b as getStaticProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -13
};
export { getStaticProps };

```
## Part 29
```js
import { f as reportWebVitals } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -17
};
export { reportWebVitals };

```
## Part 30
```js
import { j as unstable_getServerProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -21
};
export { unstable_getServerProps };

```
## Part 31
```js
import { k as unstable_getServerSideProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -22
};
export { unstable_getServerSideProps };

```
## Part 32
```js
import { i as unstable_getStaticParams } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -20
};
export { unstable_getStaticParams };

```
## Part 33
```js
import { h as unstable_getStaticPaths } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -19
};
export { unstable_getStaticPaths };

```
## Part 34
```js
import { g as unstable_getStaticProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -18
};
export { unstable_getStaticProps };

```
## Part 35
```js
export { routeModule } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export routeModule"
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
export { unstable_getServerProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export unstable_getServerProps"
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
export { unstable_getStaticProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export unstable_getStaticProps"
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
    __turbopack_part__: 8
};
import App from 'VAR_MODULE_APP';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import Document from 'VAR_MODULE_DOCUMENT';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import * as userland from 'VAR_USERLAND';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 22
};
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
export { routeModule as l } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { };

```
