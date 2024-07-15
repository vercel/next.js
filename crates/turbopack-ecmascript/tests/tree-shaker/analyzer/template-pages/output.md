# Items

Count: 37

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

- Declares: `getStaticProps`
- Reads: `hoist`, `userland`
- Write: `getStaticProps`

## Item 15: Stmt 8, `VarDeclarator(0)`

```js
export const getStaticPaths = hoist(userland, 'getStaticPaths');

```

- Declares: `getStaticPaths`
- Reads: `hoist`, `userland`
- Write: `getStaticPaths`

## Item 16: Stmt 9, `VarDeclarator(0)`

```js
export const getServerSideProps = hoist(userland, 'getServerSideProps');

```

- Declares: `getServerSideProps`
- Reads: `hoist`, `userland`
- Write: `getServerSideProps`

## Item 17: Stmt 10, `VarDeclarator(0)`

```js
export const config = hoist(userland, 'config');

```

- Declares: `config`
- Reads: `hoist`, `userland`
- Write: `config`

## Item 18: Stmt 11, `VarDeclarator(0)`

```js
export const reportWebVitals = hoist(userland, 'reportWebVitals');

```

- Declares: `reportWebVitals`
- Reads: `hoist`, `userland`
- Write: `reportWebVitals`

## Item 19: Stmt 12, `VarDeclarator(0)`

```js
export const unstable_getStaticProps = hoist(userland, 'unstable_getStaticProps');

```

- Declares: `unstable_getStaticProps`
- Reads: `hoist`, `userland`
- Write: `unstable_getStaticProps`

## Item 20: Stmt 13, `VarDeclarator(0)`

```js
export const unstable_getStaticPaths = hoist(userland, 'unstable_getStaticPaths');

```

- Declares: `unstable_getStaticPaths`
- Reads: `hoist`, `userland`
- Write: `unstable_getStaticPaths`

## Item 21: Stmt 14, `VarDeclarator(0)`

```js
export const unstable_getStaticParams = hoist(userland, 'unstable_getStaticParams');

```

- Declares: `unstable_getStaticParams`
- Reads: `hoist`, `userland`
- Write: `unstable_getStaticParams`

## Item 22: Stmt 15, `VarDeclarator(0)`

```js
export const unstable_getServerProps = hoist(userland, 'unstable_getServerProps');

```

- Declares: `unstable_getServerProps`
- Reads: `hoist`, `userland`
- Write: `unstable_getServerProps`

## Item 23: Stmt 16, `VarDeclarator(0)`

```js
export const unstable_getServerSideProps = hoist(userland, 'unstable_getServerSideProps');

```

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

- Declares: `routeModule`
- Reads: `PagesRouteModule`, `RouteKind`, `App`, `Document`, `userland`
- Write: `routeModule`, `RouteKind`

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
    Item25["ModuleEvaluation"];
    Item26;
    Item26["export default"];
    Item27;
    Item27["export getStaticProps"];
    Item28;
    Item28["export getStaticPaths"];
    Item29;
    Item29["export getServerSideProps"];
    Item30;
    Item30["export config"];
    Item31;
    Item31["export reportWebVitals"];
    Item32;
    Item32["export unstable_getStaticProps"];
    Item33;
    Item33["export unstable_getStaticPaths"];
    Item34;
    Item34["export unstable_getStaticParams"];
    Item35;
    Item35["export unstable_getServerProps"];
    Item36;
    Item36["export unstable_getServerSideProps"];
    Item37;
    Item37["export routeModule"];
    Item2 --> Item1;
    Item3 --> Item1;
    Item3 --> Item2;
    Item4 --> Item1;
    Item4 --> Item2;
    Item4 --> Item3;
    Item5 --> Item1;
    Item5 --> Item2;
    Item5 --> Item3;
    Item5 --> Item4;
    Item6 --> Item1;
    Item6 --> Item2;
    Item6 --> Item3;
    Item6 --> Item4;
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
    Item25["ModuleEvaluation"];
    Item26;
    Item26["export default"];
    Item27;
    Item27["export getStaticProps"];
    Item28;
    Item28["export getStaticPaths"];
    Item29;
    Item29["export getServerSideProps"];
    Item30;
    Item30["export config"];
    Item31;
    Item31["export reportWebVitals"];
    Item32;
    Item32["export unstable_getStaticProps"];
    Item33;
    Item33["export unstable_getStaticPaths"];
    Item34;
    Item34["export unstable_getStaticParams"];
    Item35;
    Item35["export unstable_getServerProps"];
    Item36;
    Item36["export unstable_getServerSideProps"];
    Item37;
    Item37["export routeModule"];
    Item2 --> Item1;
    Item3 --> Item1;
    Item3 --> Item2;
    Item4 --> Item1;
    Item4 --> Item2;
    Item4 --> Item3;
    Item5 --> Item1;
    Item5 --> Item2;
    Item5 --> Item3;
    Item5 --> Item4;
    Item6 --> Item1;
    Item6 --> Item2;
    Item6 --> Item3;
    Item6 --> Item4;
    Item6 --> Item5;
    Item13 --> Item9;
    Item13 --> Item12;
    Item13 --> Item1;
    Item13 --> Item2;
    Item13 --> Item3;
    Item13 --> Item4;
    Item13 --> Item5;
    Item13 --> Item6;
    Item14 --> Item9;
    Item14 --> Item12;
    Item15 --> Item9;
    Item15 --> Item12;
    Item16 --> Item9;
    Item16 --> Item12;
    Item17 --> Item9;
    Item17 --> Item12;
    Item18 --> Item9;
    Item18 --> Item12;
    Item19 --> Item9;
    Item19 --> Item12;
    Item20 --> Item9;
    Item20 --> Item12;
    Item21 --> Item9;
    Item21 --> Item12;
    Item22 --> Item9;
    Item22 --> Item12;
    Item23 --> Item9;
    Item23 --> Item12;
    Item24 --> Item7;
    Item24 --> Item8;
    Item24 --> Item11;
    Item24 --> Item10;
    Item24 --> Item12;
    Item27 --> Item14;
    Item28 --> Item15;
    Item29 --> Item16;
    Item30 --> Item17;
    Item31 --> Item18;
    Item32 --> Item19;
    Item33 --> Item20;
    Item34 --> Item21;
    Item35 --> Item22;
    Item36 --> Item23;
    Item37 --> Item24;
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
    Item25["ModuleEvaluation"];
    Item26;
    Item26["export default"];
    Item27;
    Item27["export getStaticProps"];
    Item28;
    Item28["export getStaticPaths"];
    Item29;
    Item29["export getServerSideProps"];
    Item30;
    Item30["export config"];
    Item31;
    Item31["export reportWebVitals"];
    Item32;
    Item32["export unstable_getStaticProps"];
    Item33;
    Item33["export unstable_getStaticPaths"];
    Item34;
    Item34["export unstable_getStaticParams"];
    Item35;
    Item35["export unstable_getServerProps"];
    Item36;
    Item36["export unstable_getServerSideProps"];
    Item37;
    Item37["export routeModule"];
    Item2 --> Item1;
    Item3 --> Item1;
    Item3 --> Item2;
    Item4 --> Item1;
    Item4 --> Item2;
    Item4 --> Item3;
    Item5 --> Item1;
    Item5 --> Item2;
    Item5 --> Item3;
    Item5 --> Item4;
    Item6 --> Item1;
    Item6 --> Item2;
    Item6 --> Item3;
    Item6 --> Item4;
    Item6 --> Item5;
    Item13 --> Item9;
    Item13 --> Item12;
    Item13 --> Item1;
    Item13 --> Item2;
    Item13 --> Item3;
    Item13 --> Item4;
    Item13 --> Item5;
    Item13 --> Item6;
    Item14 --> Item9;
    Item14 --> Item12;
    Item15 --> Item9;
    Item15 --> Item12;
    Item16 --> Item9;
    Item16 --> Item12;
    Item17 --> Item9;
    Item17 --> Item12;
    Item18 --> Item9;
    Item18 --> Item12;
    Item19 --> Item9;
    Item19 --> Item12;
    Item20 --> Item9;
    Item20 --> Item12;
    Item21 --> Item9;
    Item21 --> Item12;
    Item22 --> Item9;
    Item22 --> Item12;
    Item23 --> Item9;
    Item23 --> Item12;
    Item24 --> Item7;
    Item24 --> Item8;
    Item24 --> Item11;
    Item24 --> Item10;
    Item24 --> Item12;
    Item27 --> Item14;
    Item28 --> Item15;
    Item29 --> Item16;
    Item30 --> Item17;
    Item31 --> Item18;
    Item32 --> Item19;
    Item33 --> Item20;
    Item34 --> Item21;
    Item35 --> Item22;
    Item36 --> Item23;
    Item37 --> Item24;
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
    Item25["ModuleEvaluation"];
    Item26;
    Item26["export default"];
    Item27;
    Item27["export getStaticProps"];
    Item28;
    Item28["export getStaticPaths"];
    Item29;
    Item29["export getServerSideProps"];
    Item30;
    Item30["export config"];
    Item31;
    Item31["export reportWebVitals"];
    Item32;
    Item32["export unstable_getStaticProps"];
    Item33;
    Item33["export unstable_getStaticPaths"];
    Item34;
    Item34["export unstable_getStaticParams"];
    Item35;
    Item35["export unstable_getServerProps"];
    Item36;
    Item36["export unstable_getServerSideProps"];
    Item37;
    Item37["export routeModule"];
    Item2 --> Item1;
    Item3 --> Item1;
    Item3 --> Item2;
    Item4 --> Item1;
    Item4 --> Item2;
    Item4 --> Item3;
    Item5 --> Item1;
    Item5 --> Item2;
    Item5 --> Item3;
    Item5 --> Item4;
    Item6 --> Item1;
    Item6 --> Item2;
    Item6 --> Item3;
    Item6 --> Item4;
    Item6 --> Item5;
    Item13 --> Item9;
    Item13 --> Item12;
    Item13 --> Item1;
    Item13 --> Item2;
    Item13 --> Item3;
    Item13 --> Item4;
    Item13 --> Item5;
    Item13 --> Item6;
    Item14 --> Item9;
    Item14 --> Item12;
    Item15 --> Item9;
    Item15 --> Item12;
    Item16 --> Item9;
    Item16 --> Item12;
    Item17 --> Item9;
    Item17 --> Item12;
    Item18 --> Item9;
    Item18 --> Item12;
    Item19 --> Item9;
    Item19 --> Item12;
    Item20 --> Item9;
    Item20 --> Item12;
    Item21 --> Item9;
    Item21 --> Item12;
    Item22 --> Item9;
    Item22 --> Item12;
    Item23 --> Item9;
    Item23 --> Item12;
    Item24 --> Item7;
    Item24 --> Item8;
    Item24 --> Item11;
    Item24 --> Item10;
    Item24 --> Item12;
    Item27 --> Item14;
    Item28 --> Item15;
    Item29 --> Item16;
    Item30 --> Item17;
    Item31 --> Item18;
    Item32 --> Item19;
    Item33 --> Item20;
    Item34 --> Item21;
    Item35 --> Item22;
    Item36 --> Item23;
    Item37 --> Item24;
    Item25 --> Item1;
    Item25 --> Item2;
    Item25 --> Item3;
    Item25 --> Item4;
    Item25 --> Item5;
    Item25 --> Item6;
    Item25 --> Item13;
    Item26 --> Item13;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(ModuleEvaluation)]"];
    N1["Items: [ItemId(Export((&quot;__TURBOPACK__default__export__&quot;, #3), &quot;default&quot;))]"];
    N2["Items: [ItemId(Export((&quot;getStaticProps&quot;, #2), &quot;getStaticProps&quot;)), ItemId(2, ImportBinding(0)), ItemId(5, ImportBinding(0)), ItemId(7, VarDeclarator(0))]"];
    N3["Items: [ItemId(Export((&quot;getStaticPaths&quot;, #2), &quot;getStaticPaths&quot;)), ItemId(2, ImportBinding(0)), ItemId(5, ImportBinding(0)), ItemId(8, VarDeclarator(0))]"];
    N4["Items: [ItemId(Export((&quot;getServerSideProps&quot;, #2), &quot;getServerSideProps&quot;)), ItemId(2, ImportBinding(0)), ItemId(5, ImportBinding(0)), ItemId(9, VarDeclarator(0))]"];
    N5["Items: [ItemId(Export((&quot;config&quot;, #2), &quot;config&quot;)), ItemId(2, ImportBinding(0)), ItemId(5, ImportBinding(0)), ItemId(10, VarDeclarator(0))]"];
    N6["Items: [ItemId(Export((&quot;reportWebVitals&quot;, #2), &quot;reportWebVitals&quot;)), ItemId(2, ImportBinding(0)), ItemId(5, ImportBinding(0)), ItemId(11, VarDeclarator(0))]"];
    N7["Items: [ItemId(Export((&quot;unstable_getStaticProps&quot;, #2), &quot;unstable_getStaticProps&quot;)), ItemId(2, ImportBinding(0)), ItemId(5, ImportBinding(0)), ItemId(12, VarDeclarator(0))]"];
    N8["Items: [ItemId(Export((&quot;unstable_getStaticPaths&quot;, #2), &quot;unstable_getStaticPaths&quot;)), ItemId(2, ImportBinding(0)), ItemId(5, ImportBinding(0)), ItemId(13, VarDeclarator(0))]"];
    N9["Items: [ItemId(Export((&quot;unstable_getStaticParams&quot;, #2), &quot;unstable_getStaticParams&quot;)), ItemId(2, ImportBinding(0)), ItemId(5, ImportBinding(0)), ItemId(14, VarDeclarator(0))]"];
    N10["Items: [ItemId(Export((&quot;unstable_getServerProps&quot;, #2), &quot;unstable_getServerProps&quot;)), ItemId(2, ImportBinding(0)), ItemId(5, ImportBinding(0)), ItemId(15, VarDeclarator(0))]"];
    N11["Items: [ItemId(Export((&quot;unstable_getServerSideProps&quot;, #2), &quot;unstable_getServerSideProps&quot;)), ItemId(2, ImportBinding(0)), ItemId(5, ImportBinding(0)), ItemId(16, VarDeclarator(0))]"];
    N12["Items: [ItemId(Export((&quot;routeModule&quot;, #2), &quot;routeModule&quot;)), ItemId(0, ImportBinding(0)), ItemId(1, ImportBinding(0)), ItemId(3, ImportBinding(0)), ItemId(4, ImportBinding(0)), ItemId(5, ImportBinding(0)), ItemId(17, VarDeclarator(0))]"];
    N13["Items: [ItemId(0, ImportOfModule)]"];
    N14["Items: [ItemId(1, ImportOfModule)]"];
    N15["Items: [ItemId(2, ImportOfModule)]"];
    N16["Items: [ItemId(3, ImportOfModule)]"];
    N17["Items: [ItemId(4, ImportOfModule)]"];
    N18["Items: [ItemId(5, ImportOfModule)]"];
    N19["Items: [ItemId(2, ImportBinding(0)), ItemId(5, ImportBinding(0)), ItemId(6, Normal)]"];
    N0 --> N13;
    N0 --> N14;
    N0 --> N15;
    N0 --> N16;
    N0 --> N17;
    N0 --> N18;
    N0 --> N19;
    N1 --> N19;
    N2 --> N19;
    N3 --> N19;
    N4 --> N19;
    N5 --> N19;
    N6 --> N19;
    N7 --> N19;
    N8 --> N19;
    N9 --> N19;
    N10 --> N19;
    N11 --> N19;
    N12 --> N19;
    N14 --> N13;
    N15 --> N13;
    N15 --> N14;
    N16 --> N13;
    N16 --> N14;
    N16 --> N15;
    N17 --> N13;
    N17 --> N14;
    N17 --> N15;
    N17 --> N16;
    N18 --> N13;
    N18 --> N14;
    N18 --> N15;
    N18 --> N16;
    N18 --> N17;
    N19 --> N13;
    N19 --> N14;
    N19 --> N15;
    N19 --> N16;
    N19 --> N17;
    N19 --> N18;
```
# Entrypoints

```
{
    ModuleEvaluation: 0,
    Export(
        "unstable_getStaticPaths",
    ): 8,
    Export(
        "unstable_getServerSideProps",
    ): 11,
    Export(
        "reportWebVitals",
    ): 6,
    Export(
        "unstable_getServerProps",
    ): 10,
    Export(
        "routeModule",
    ): 12,
    Export(
        "getStaticProps",
    ): 2,
    Export(
        "config",
    ): 5,
    Export(
        "unstable_getStaticParams",
    ): 9,
    Export(
        "unstable_getStaticProps",
    ): 7,
    Export(
        "default",
    ): 1,
    Export(
        "getStaticPaths",
    ): 3,
    Export(
        "getServerSideProps",
    ): 4,
}
```


# Modules (dev)
## Part 0
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 15
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 17
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 18
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 19
};
"module evaluation";

```
## Part 1
```js
import { __TURBOPACK__default__export__ } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 19
};
export { __TURBOPACK__default__export__ as default };

```
## Part 2
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 19
};
export { getStaticProps };
import { hoist } from './helpers';
import * as userland from 'VAR_USERLAND';
const getStaticProps = hoist(userland, 'getStaticProps');
export { hoist } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { userland } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { getStaticProps } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 19
};
export { getStaticPaths };
import { hoist } from './helpers';
import * as userland from 'VAR_USERLAND';
const getStaticPaths = hoist(userland, 'getStaticPaths');
export { hoist } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { userland } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { getStaticPaths } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 19
};
export { getServerSideProps };
import { hoist } from './helpers';
import * as userland from 'VAR_USERLAND';
const getServerSideProps = hoist(userland, 'getServerSideProps');
export { hoist } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { userland } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { getServerSideProps } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 19
};
export { config };
import { hoist } from './helpers';
import * as userland from 'VAR_USERLAND';
const config = hoist(userland, 'config');
export { hoist } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { userland } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { config } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 6
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 19
};
export { reportWebVitals };
import { hoist } from './helpers';
import * as userland from 'VAR_USERLAND';
const reportWebVitals = hoist(userland, 'reportWebVitals');
export { hoist } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { userland } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { reportWebVitals } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 7
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 19
};
export { unstable_getStaticProps };
import { hoist } from './helpers';
import * as userland from 'VAR_USERLAND';
const unstable_getStaticProps = hoist(userland, 'unstable_getStaticProps');
export { hoist } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { userland } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { unstable_getStaticProps } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 8
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 19
};
export { unstable_getStaticPaths };
import { hoist } from './helpers';
import * as userland from 'VAR_USERLAND';
const unstable_getStaticPaths = hoist(userland, 'unstable_getStaticPaths');
export { hoist } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { userland } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { unstable_getStaticPaths } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 9
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 19
};
export { unstable_getStaticParams };
import { hoist } from './helpers';
import * as userland from 'VAR_USERLAND';
const unstable_getStaticParams = hoist(userland, 'unstable_getStaticParams');
export { hoist } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { userland } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { unstable_getStaticParams } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 10
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 19
};
export { unstable_getServerProps };
import { hoist } from './helpers';
import * as userland from 'VAR_USERLAND';
const unstable_getServerProps = hoist(userland, 'unstable_getServerProps');
export { hoist } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { userland } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { unstable_getServerProps } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 11
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 19
};
export { unstable_getServerSideProps };
import { hoist } from './helpers';
import * as userland from 'VAR_USERLAND';
const unstable_getServerSideProps = hoist(userland, 'unstable_getServerSideProps');
export { hoist } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { userland } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { unstable_getServerSideProps } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 12
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 19
};
export { routeModule };
import { PagesRouteModule } from '../../server/future/route-modules/pages/module.compiled';
import { RouteKind } from '../../server/future/route-kind';
import Document from 'VAR_MODULE_DOCUMENT';
import App from 'VAR_MODULE_APP';
import * as userland from 'VAR_USERLAND';
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
export { PagesRouteModule } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { RouteKind } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { Document } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { App } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { userland } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { routeModule } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 13
```js
import '../../server/future/route-modules/pages/module.compiled';

```
## Part 14
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
import '../../server/future/route-kind';

```
## Part 15
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import './helpers';

```
## Part 16
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 15
};
import 'VAR_MODULE_DOCUMENT';

```
## Part 17
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 15
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
import 'VAR_MODULE_APP';

```
## Part 18
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 15
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 17
};
import 'VAR_USERLAND';

```
## Part 19
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 15
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 17
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 18
};
import { hoist } from './helpers';
import * as userland from 'VAR_USERLAND';
const __TURBOPACK__default__export__ = hoist(userland, 'default');
export { hoist } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { userland } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { __TURBOPACK__default__export__ } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 15
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 17
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 18
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 19
};
"module evaluation";

```
# Entrypoints

```
{
    ModuleEvaluation: 0,
    Export(
        "unstable_getStaticPaths",
    ): 8,
    Export(
        "unstable_getServerSideProps",
    ): 11,
    Export(
        "reportWebVitals",
    ): 6,
    Export(
        "unstable_getServerProps",
    ): 10,
    Export(
        "routeModule",
    ): 12,
    Export(
        "getStaticProps",
    ): 2,
    Export(
        "config",
    ): 5,
    Export(
        "unstable_getStaticParams",
    ): 9,
    Export(
        "unstable_getStaticProps",
    ): 7,
    Export(
        "default",
    ): 1,
    Export(
        "getStaticPaths",
    ): 3,
    Export(
        "getServerSideProps",
    ): 4,
}
```


# Modules (prod)
## Part 0
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 15
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 17
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 18
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 19
};
"module evaluation";

```
## Part 1
```js
import { __TURBOPACK__default__export__ } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 19
};
export { __TURBOPACK__default__export__ as default };

```
## Part 2
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 19
};
export { getStaticProps };
import { hoist } from './helpers';
import * as userland from 'VAR_USERLAND';
const getStaticProps = hoist(userland, 'getStaticProps');
export { hoist } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { userland } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { getStaticProps } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 19
};
export { getStaticPaths };
import { hoist } from './helpers';
import * as userland from 'VAR_USERLAND';
const getStaticPaths = hoist(userland, 'getStaticPaths');
export { hoist } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { userland } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { getStaticPaths } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 19
};
export { getServerSideProps };
import { hoist } from './helpers';
import * as userland from 'VAR_USERLAND';
const getServerSideProps = hoist(userland, 'getServerSideProps');
export { hoist } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { userland } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { getServerSideProps } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 19
};
export { config };
import { hoist } from './helpers';
import * as userland from 'VAR_USERLAND';
const config = hoist(userland, 'config');
export { hoist } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { userland } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { config } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 6
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 19
};
export { reportWebVitals };
import { hoist } from './helpers';
import * as userland from 'VAR_USERLAND';
const reportWebVitals = hoist(userland, 'reportWebVitals');
export { hoist } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { userland } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { reportWebVitals } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 7
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 19
};
export { unstable_getStaticProps };
import { hoist } from './helpers';
import * as userland from 'VAR_USERLAND';
const unstable_getStaticProps = hoist(userland, 'unstable_getStaticProps');
export { hoist } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { userland } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { unstable_getStaticProps } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 8
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 19
};
export { unstable_getStaticPaths };
import { hoist } from './helpers';
import * as userland from 'VAR_USERLAND';
const unstable_getStaticPaths = hoist(userland, 'unstable_getStaticPaths');
export { hoist } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { userland } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { unstable_getStaticPaths } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 9
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 19
};
export { unstable_getStaticParams };
import { hoist } from './helpers';
import * as userland from 'VAR_USERLAND';
const unstable_getStaticParams = hoist(userland, 'unstable_getStaticParams');
export { hoist } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { userland } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { unstable_getStaticParams } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 10
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 19
};
export { unstable_getServerProps };
import { hoist } from './helpers';
import * as userland from 'VAR_USERLAND';
const unstable_getServerProps = hoist(userland, 'unstable_getServerProps');
export { hoist } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { userland } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { unstable_getServerProps } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 11
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 19
};
export { unstable_getServerSideProps };
import { hoist } from './helpers';
import * as userland from 'VAR_USERLAND';
const unstable_getServerSideProps = hoist(userland, 'unstable_getServerSideProps');
export { hoist } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { userland } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { unstable_getServerSideProps } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 12
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 19
};
export { routeModule };
import { PagesRouteModule } from '../../server/future/route-modules/pages/module.compiled';
import { RouteKind } from '../../server/future/route-kind';
import Document from 'VAR_MODULE_DOCUMENT';
import App from 'VAR_MODULE_APP';
import * as userland from 'VAR_USERLAND';
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
export { PagesRouteModule } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { RouteKind } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { Document } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { App } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { userland } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { routeModule } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 13
```js
import '../../server/future/route-modules/pages/module.compiled';

```
## Part 14
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
import '../../server/future/route-kind';

```
## Part 15
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import './helpers';

```
## Part 16
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 15
};
import 'VAR_MODULE_DOCUMENT';

```
## Part 17
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 15
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
import 'VAR_MODULE_APP';

```
## Part 18
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 15
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 17
};
import 'VAR_USERLAND';

```
## Part 19
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 15
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 17
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 18
};
import { hoist } from './helpers';
import * as userland from 'VAR_USERLAND';
const __TURBOPACK__default__export__ = hoist(userland, 'default');
export { hoist } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { userland } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { __TURBOPACK__default__export__ } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 15
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 17
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 18
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 19
};
"module evaluation";

```
