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
    Item14 --> Item1;
    Item14 --> Item2;
    Item14 --> Item3;
    Item14 --> Item4;
    Item14 --> Item5;
    Item14 --> Item6;
    Item14 --> Item13;
    Item15 --> Item9;
    Item15 --> Item12;
    Item15 --> Item1;
    Item15 --> Item2;
    Item15 --> Item3;
    Item15 --> Item4;
    Item15 --> Item5;
    Item15 --> Item6;
    Item15 --> Item13;
    Item15 --> Item14;
    Item16 --> Item9;
    Item16 --> Item12;
    Item16 --> Item1;
    Item16 --> Item2;
    Item16 --> Item3;
    Item16 --> Item4;
    Item16 --> Item5;
    Item16 --> Item6;
    Item16 --> Item13;
    Item16 --> Item14;
    Item16 --> Item15;
    Item17 --> Item9;
    Item17 --> Item12;
    Item17 --> Item1;
    Item17 --> Item2;
    Item17 --> Item3;
    Item17 --> Item4;
    Item17 --> Item5;
    Item17 --> Item6;
    Item17 --> Item13;
    Item17 --> Item14;
    Item17 --> Item15;
    Item17 --> Item16;
    Item18 --> Item9;
    Item18 --> Item12;
    Item18 --> Item1;
    Item18 --> Item2;
    Item18 --> Item3;
    Item18 --> Item4;
    Item18 --> Item5;
    Item18 --> Item6;
    Item18 --> Item13;
    Item18 --> Item14;
    Item18 --> Item15;
    Item18 --> Item16;
    Item18 --> Item17;
    Item19 --> Item9;
    Item19 --> Item12;
    Item19 --> Item1;
    Item19 --> Item2;
    Item19 --> Item3;
    Item19 --> Item4;
    Item19 --> Item5;
    Item19 --> Item6;
    Item19 --> Item13;
    Item19 --> Item14;
    Item19 --> Item15;
    Item19 --> Item16;
    Item19 --> Item17;
    Item19 --> Item18;
    Item20 --> Item9;
    Item20 --> Item12;
    Item20 --> Item1;
    Item20 --> Item2;
    Item20 --> Item3;
    Item20 --> Item4;
    Item20 --> Item5;
    Item20 --> Item6;
    Item20 --> Item13;
    Item20 --> Item14;
    Item20 --> Item15;
    Item20 --> Item16;
    Item20 --> Item17;
    Item20 --> Item18;
    Item20 --> Item19;
    Item21 --> Item9;
    Item21 --> Item12;
    Item21 --> Item1;
    Item21 --> Item2;
    Item21 --> Item3;
    Item21 --> Item4;
    Item21 --> Item5;
    Item21 --> Item6;
    Item21 --> Item13;
    Item21 --> Item14;
    Item21 --> Item15;
    Item21 --> Item16;
    Item21 --> Item17;
    Item21 --> Item18;
    Item21 --> Item19;
    Item21 --> Item20;
    Item22 --> Item9;
    Item22 --> Item12;
    Item22 --> Item1;
    Item22 --> Item2;
    Item22 --> Item3;
    Item22 --> Item4;
    Item22 --> Item5;
    Item22 --> Item6;
    Item22 --> Item13;
    Item22 --> Item14;
    Item22 --> Item15;
    Item22 --> Item16;
    Item22 --> Item17;
    Item22 --> Item18;
    Item22 --> Item19;
    Item22 --> Item20;
    Item22 --> Item21;
    Item23 --> Item9;
    Item23 --> Item12;
    Item23 --> Item1;
    Item23 --> Item2;
    Item23 --> Item3;
    Item23 --> Item4;
    Item23 --> Item5;
    Item23 --> Item6;
    Item23 --> Item13;
    Item23 --> Item14;
    Item23 --> Item15;
    Item23 --> Item16;
    Item23 --> Item17;
    Item23 --> Item18;
    Item23 --> Item19;
    Item23 --> Item20;
    Item23 --> Item21;
    Item23 --> Item22;
    Item24 --> Item7;
    Item24 --> Item8;
    Item24 --> Item11;
    Item24 --> Item10;
    Item24 --> Item12;
    Item24 --> Item23;
    Item24 --> Item1;
    Item24 --> Item2;
    Item24 --> Item3;
    Item24 --> Item4;
    Item24 --> Item5;
    Item24 --> Item6;
    Item24 --> Item13;
    Item24 --> Item14;
    Item24 --> Item15;
    Item24 --> Item16;
    Item24 --> Item17;
    Item24 --> Item18;
    Item24 --> Item19;
    Item24 --> Item20;
    Item24 --> Item21;
    Item24 --> Item22;
    Item26 --> Item13;
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
    Item14 --> Item1;
    Item14 --> Item2;
    Item14 --> Item3;
    Item14 --> Item4;
    Item14 --> Item5;
    Item14 --> Item6;
    Item14 --> Item13;
    Item15 --> Item9;
    Item15 --> Item12;
    Item15 --> Item1;
    Item15 --> Item2;
    Item15 --> Item3;
    Item15 --> Item4;
    Item15 --> Item5;
    Item15 --> Item6;
    Item15 --> Item13;
    Item15 --> Item14;
    Item16 --> Item9;
    Item16 --> Item12;
    Item16 --> Item1;
    Item16 --> Item2;
    Item16 --> Item3;
    Item16 --> Item4;
    Item16 --> Item5;
    Item16 --> Item6;
    Item16 --> Item13;
    Item16 --> Item14;
    Item16 --> Item15;
    Item17 --> Item9;
    Item17 --> Item12;
    Item17 --> Item1;
    Item17 --> Item2;
    Item17 --> Item3;
    Item17 --> Item4;
    Item17 --> Item5;
    Item17 --> Item6;
    Item17 --> Item13;
    Item17 --> Item14;
    Item17 --> Item15;
    Item17 --> Item16;
    Item18 --> Item9;
    Item18 --> Item12;
    Item18 --> Item1;
    Item18 --> Item2;
    Item18 --> Item3;
    Item18 --> Item4;
    Item18 --> Item5;
    Item18 --> Item6;
    Item18 --> Item13;
    Item18 --> Item14;
    Item18 --> Item15;
    Item18 --> Item16;
    Item18 --> Item17;
    Item19 --> Item9;
    Item19 --> Item12;
    Item19 --> Item1;
    Item19 --> Item2;
    Item19 --> Item3;
    Item19 --> Item4;
    Item19 --> Item5;
    Item19 --> Item6;
    Item19 --> Item13;
    Item19 --> Item14;
    Item19 --> Item15;
    Item19 --> Item16;
    Item19 --> Item17;
    Item19 --> Item18;
    Item20 --> Item9;
    Item20 --> Item12;
    Item20 --> Item1;
    Item20 --> Item2;
    Item20 --> Item3;
    Item20 --> Item4;
    Item20 --> Item5;
    Item20 --> Item6;
    Item20 --> Item13;
    Item20 --> Item14;
    Item20 --> Item15;
    Item20 --> Item16;
    Item20 --> Item17;
    Item20 --> Item18;
    Item20 --> Item19;
    Item21 --> Item9;
    Item21 --> Item12;
    Item21 --> Item1;
    Item21 --> Item2;
    Item21 --> Item3;
    Item21 --> Item4;
    Item21 --> Item5;
    Item21 --> Item6;
    Item21 --> Item13;
    Item21 --> Item14;
    Item21 --> Item15;
    Item21 --> Item16;
    Item21 --> Item17;
    Item21 --> Item18;
    Item21 --> Item19;
    Item21 --> Item20;
    Item22 --> Item9;
    Item22 --> Item12;
    Item22 --> Item1;
    Item22 --> Item2;
    Item22 --> Item3;
    Item22 --> Item4;
    Item22 --> Item5;
    Item22 --> Item6;
    Item22 --> Item13;
    Item22 --> Item14;
    Item22 --> Item15;
    Item22 --> Item16;
    Item22 --> Item17;
    Item22 --> Item18;
    Item22 --> Item19;
    Item22 --> Item20;
    Item22 --> Item21;
    Item23 --> Item9;
    Item23 --> Item12;
    Item23 --> Item1;
    Item23 --> Item2;
    Item23 --> Item3;
    Item23 --> Item4;
    Item23 --> Item5;
    Item23 --> Item6;
    Item23 --> Item13;
    Item23 --> Item14;
    Item23 --> Item15;
    Item23 --> Item16;
    Item23 --> Item17;
    Item23 --> Item18;
    Item23 --> Item19;
    Item23 --> Item20;
    Item23 --> Item21;
    Item23 --> Item22;
    Item24 --> Item7;
    Item24 --> Item8;
    Item24 --> Item11;
    Item24 --> Item10;
    Item24 --> Item12;
    Item24 --> Item23;
    Item24 --> Item1;
    Item24 --> Item2;
    Item24 --> Item3;
    Item24 --> Item4;
    Item24 --> Item5;
    Item24 --> Item6;
    Item24 --> Item13;
    Item24 --> Item14;
    Item24 --> Item15;
    Item24 --> Item16;
    Item24 --> Item17;
    Item24 --> Item18;
    Item24 --> Item19;
    Item24 --> Item20;
    Item24 --> Item21;
    Item24 --> Item22;
    Item26 --> Item13;
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
    Item14 --> Item1;
    Item14 --> Item2;
    Item14 --> Item3;
    Item14 --> Item4;
    Item14 --> Item5;
    Item14 --> Item6;
    Item14 --> Item13;
    Item15 --> Item9;
    Item15 --> Item12;
    Item15 --> Item1;
    Item15 --> Item2;
    Item15 --> Item3;
    Item15 --> Item4;
    Item15 --> Item5;
    Item15 --> Item6;
    Item15 --> Item13;
    Item15 --> Item14;
    Item16 --> Item9;
    Item16 --> Item12;
    Item16 --> Item1;
    Item16 --> Item2;
    Item16 --> Item3;
    Item16 --> Item4;
    Item16 --> Item5;
    Item16 --> Item6;
    Item16 --> Item13;
    Item16 --> Item14;
    Item16 --> Item15;
    Item17 --> Item9;
    Item17 --> Item12;
    Item17 --> Item1;
    Item17 --> Item2;
    Item17 --> Item3;
    Item17 --> Item4;
    Item17 --> Item5;
    Item17 --> Item6;
    Item17 --> Item13;
    Item17 --> Item14;
    Item17 --> Item15;
    Item17 --> Item16;
    Item18 --> Item9;
    Item18 --> Item12;
    Item18 --> Item1;
    Item18 --> Item2;
    Item18 --> Item3;
    Item18 --> Item4;
    Item18 --> Item5;
    Item18 --> Item6;
    Item18 --> Item13;
    Item18 --> Item14;
    Item18 --> Item15;
    Item18 --> Item16;
    Item18 --> Item17;
    Item19 --> Item9;
    Item19 --> Item12;
    Item19 --> Item1;
    Item19 --> Item2;
    Item19 --> Item3;
    Item19 --> Item4;
    Item19 --> Item5;
    Item19 --> Item6;
    Item19 --> Item13;
    Item19 --> Item14;
    Item19 --> Item15;
    Item19 --> Item16;
    Item19 --> Item17;
    Item19 --> Item18;
    Item20 --> Item9;
    Item20 --> Item12;
    Item20 --> Item1;
    Item20 --> Item2;
    Item20 --> Item3;
    Item20 --> Item4;
    Item20 --> Item5;
    Item20 --> Item6;
    Item20 --> Item13;
    Item20 --> Item14;
    Item20 --> Item15;
    Item20 --> Item16;
    Item20 --> Item17;
    Item20 --> Item18;
    Item20 --> Item19;
    Item21 --> Item9;
    Item21 --> Item12;
    Item21 --> Item1;
    Item21 --> Item2;
    Item21 --> Item3;
    Item21 --> Item4;
    Item21 --> Item5;
    Item21 --> Item6;
    Item21 --> Item13;
    Item21 --> Item14;
    Item21 --> Item15;
    Item21 --> Item16;
    Item21 --> Item17;
    Item21 --> Item18;
    Item21 --> Item19;
    Item21 --> Item20;
    Item22 --> Item9;
    Item22 --> Item12;
    Item22 --> Item1;
    Item22 --> Item2;
    Item22 --> Item3;
    Item22 --> Item4;
    Item22 --> Item5;
    Item22 --> Item6;
    Item22 --> Item13;
    Item22 --> Item14;
    Item22 --> Item15;
    Item22 --> Item16;
    Item22 --> Item17;
    Item22 --> Item18;
    Item22 --> Item19;
    Item22 --> Item20;
    Item22 --> Item21;
    Item23 --> Item9;
    Item23 --> Item12;
    Item23 --> Item1;
    Item23 --> Item2;
    Item23 --> Item3;
    Item23 --> Item4;
    Item23 --> Item5;
    Item23 --> Item6;
    Item23 --> Item13;
    Item23 --> Item14;
    Item23 --> Item15;
    Item23 --> Item16;
    Item23 --> Item17;
    Item23 --> Item18;
    Item23 --> Item19;
    Item23 --> Item20;
    Item23 --> Item21;
    Item23 --> Item22;
    Item24 --> Item7;
    Item24 --> Item8;
    Item24 --> Item11;
    Item24 --> Item10;
    Item24 --> Item12;
    Item24 --> Item23;
    Item24 --> Item1;
    Item24 --> Item2;
    Item24 --> Item3;
    Item24 --> Item4;
    Item24 --> Item5;
    Item24 --> Item6;
    Item24 --> Item13;
    Item24 --> Item14;
    Item24 --> Item15;
    Item24 --> Item16;
    Item24 --> Item17;
    Item24 --> Item18;
    Item24 --> Item19;
    Item24 --> Item20;
    Item24 --> Item21;
    Item24 --> Item22;
    Item26 --> Item13;
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
    Item25 --> Item14;
    Item25 --> Item15;
    Item25 --> Item16;
    Item25 --> Item17;
    Item25 --> Item18;
    Item25 --> Item19;
    Item25 --> Item20;
    Item25 --> Item21;
    Item25 --> Item22;
    Item25 --> Item23;
    Item25 --> Item24;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(3, ImportBinding(0))]"];
    N1["Items: [ItemId(4, ImportBinding(0))]"];
    N2["Items: [ItemId(1, ImportBinding(0))]"];
    N3["Items: [ItemId(0, ImportBinding(0))]"];
    N4["Items: [ItemId(5, ImportBinding(0))]"];
    N5["Items: [ItemId(2, ImportBinding(0))]"];
    N6["Items: [ItemId(0, ImportOfModule)]"];
    N7["Items: [ItemId(1, ImportOfModule)]"];
    N8["Items: [ItemId(2, ImportOfModule)]"];
    N9["Items: [ItemId(3, ImportOfModule)]"];
    N10["Items: [ItemId(4, ImportOfModule)]"];
    N11["Items: [ItemId(5, ImportOfModule)]"];
    N12["Items: [ItemId(6, Normal)]"];
    N13["Items: [ItemId(Export((&quot;__TURBOPACK__default__export__&quot;, #3), &quot;default&quot;))]"];
    N14["Items: [ItemId(7, VarDeclarator(0))]"];
    N15["Items: [ItemId(Export((&quot;getStaticProps&quot;, #2), &quot;getStaticProps&quot;))]"];
    N16["Items: [ItemId(8, VarDeclarator(0))]"];
    N17["Items: [ItemId(Export((&quot;getStaticPaths&quot;, #2), &quot;getStaticPaths&quot;))]"];
    N18["Items: [ItemId(9, VarDeclarator(0))]"];
    N19["Items: [ItemId(Export((&quot;getServerSideProps&quot;, #2), &quot;getServerSideProps&quot;))]"];
    N20["Items: [ItemId(10, VarDeclarator(0))]"];
    N21["Items: [ItemId(Export((&quot;config&quot;, #2), &quot;config&quot;))]"];
    N22["Items: [ItemId(11, VarDeclarator(0))]"];
    N23["Items: [ItemId(Export((&quot;reportWebVitals&quot;, #2), &quot;reportWebVitals&quot;))]"];
    N24["Items: [ItemId(12, VarDeclarator(0))]"];
    N25["Items: [ItemId(Export((&quot;unstable_getStaticProps&quot;, #2), &quot;unstable_getStaticProps&quot;))]"];
    N26["Items: [ItemId(13, VarDeclarator(0))]"];
    N27["Items: [ItemId(Export((&quot;unstable_getStaticPaths&quot;, #2), &quot;unstable_getStaticPaths&quot;))]"];
    N28["Items: [ItemId(14, VarDeclarator(0))]"];
    N29["Items: [ItemId(Export((&quot;unstable_getStaticParams&quot;, #2), &quot;unstable_getStaticParams&quot;))]"];
    N30["Items: [ItemId(15, VarDeclarator(0))]"];
    N31["Items: [ItemId(Export((&quot;unstable_getServerProps&quot;, #2), &quot;unstable_getServerProps&quot;))]"];
    N32["Items: [ItemId(16, VarDeclarator(0))]"];
    N33["Items: [ItemId(Export((&quot;unstable_getServerSideProps&quot;, #2), &quot;unstable_getServerSideProps&quot;))]"];
    N34["Items: [ItemId(17, VarDeclarator(0))]"];
    N35["Items: [ItemId(ModuleEvaluation)]"];
    N36["Items: [ItemId(Export((&quot;routeModule&quot;, #2), &quot;routeModule&quot;))]"];
    N7 --> N6;
    N8 --> N6;
    N8 --> N7;
    N9 --> N6;
    N9 --> N7;
    N9 --> N8;
    N10 --> N6;
    N10 --> N7;
    N10 --> N8;
    N10 --> N9;
    N11 --> N6;
    N11 --> N7;
    N11 --> N8;
    N11 --> N9;
    N11 --> N10;
    N12 --> N5;
    N12 --> N4;
    N12 --> N6;
    N12 --> N7;
    N12 --> N8;
    N12 --> N9;
    N12 --> N10;
    N12 --> N11;
    N14 --> N5;
    N14 --> N4;
    N14 --> N6;
    N14 --> N7;
    N14 --> N8;
    N14 --> N9;
    N14 --> N10;
    N14 --> N11;
    N14 --> N12;
    N16 --> N5;
    N16 --> N4;
    N16 --> N6;
    N16 --> N7;
    N16 --> N8;
    N16 --> N9;
    N16 --> N10;
    N16 --> N11;
    N16 --> N12;
    N16 --> N14;
    N18 --> N5;
    N18 --> N4;
    N18 --> N6;
    N18 --> N7;
    N18 --> N8;
    N18 --> N9;
    N18 --> N10;
    N18 --> N11;
    N18 --> N12;
    N18 --> N14;
    N18 --> N16;
    N20 --> N5;
    N20 --> N4;
    N20 --> N6;
    N20 --> N7;
    N20 --> N8;
    N20 --> N9;
    N20 --> N10;
    N20 --> N11;
    N20 --> N12;
    N20 --> N14;
    N20 --> N16;
    N20 --> N18;
    N22 --> N5;
    N22 --> N4;
    N22 --> N6;
    N22 --> N7;
    N22 --> N8;
    N22 --> N9;
    N22 --> N10;
    N22 --> N11;
    N22 --> N12;
    N22 --> N14;
    N22 --> N16;
    N22 --> N18;
    N22 --> N20;
    N24 --> N5;
    N24 --> N4;
    N24 --> N6;
    N24 --> N7;
    N24 --> N8;
    N24 --> N9;
    N24 --> N10;
    N24 --> N11;
    N24 --> N12;
    N24 --> N14;
    N24 --> N16;
    N24 --> N18;
    N24 --> N20;
    N24 --> N22;
    N26 --> N5;
    N26 --> N4;
    N26 --> N6;
    N26 --> N7;
    N26 --> N8;
    N26 --> N9;
    N26 --> N10;
    N26 --> N11;
    N26 --> N12;
    N26 --> N14;
    N26 --> N16;
    N26 --> N18;
    N26 --> N20;
    N26 --> N22;
    N26 --> N24;
    N28 --> N5;
    N28 --> N4;
    N28 --> N6;
    N28 --> N7;
    N28 --> N8;
    N28 --> N9;
    N28 --> N10;
    N28 --> N11;
    N28 --> N12;
    N28 --> N14;
    N28 --> N16;
    N28 --> N18;
    N28 --> N20;
    N28 --> N22;
    N28 --> N24;
    N28 --> N26;
    N30 --> N5;
    N30 --> N4;
    N30 --> N6;
    N30 --> N7;
    N30 --> N8;
    N30 --> N9;
    N30 --> N10;
    N30 --> N11;
    N30 --> N12;
    N30 --> N14;
    N30 --> N16;
    N30 --> N18;
    N30 --> N20;
    N30 --> N22;
    N30 --> N24;
    N30 --> N26;
    N30 --> N28;
    N32 --> N5;
    N32 --> N4;
    N32 --> N6;
    N32 --> N7;
    N32 --> N8;
    N32 --> N9;
    N32 --> N10;
    N32 --> N11;
    N32 --> N12;
    N32 --> N14;
    N32 --> N16;
    N32 --> N18;
    N32 --> N20;
    N32 --> N22;
    N32 --> N24;
    N32 --> N26;
    N32 --> N28;
    N32 --> N30;
    N34 --> N3;
    N34 --> N2;
    N34 --> N1;
    N34 --> N0;
    N34 --> N4;
    N34 --> N32;
    N34 --> N6;
    N34 --> N7;
    N34 --> N8;
    N34 --> N9;
    N34 --> N10;
    N34 --> N11;
    N34 --> N12;
    N34 --> N14;
    N34 --> N16;
    N34 --> N18;
    N34 --> N20;
    N34 --> N22;
    N34 --> N24;
    N34 --> N26;
    N34 --> N28;
    N34 --> N30;
    N13 --> N12;
    N15 --> N14;
    N17 --> N16;
    N19 --> N18;
    N21 --> N20;
    N23 --> N22;
    N25 --> N24;
    N27 --> N26;
    N29 --> N28;
    N31 --> N30;
    N33 --> N32;
    N36 --> N34;
    N35 --> N6;
    N35 --> N7;
    N35 --> N8;
    N35 --> N9;
    N35 --> N10;
    N35 --> N11;
    N35 --> N12;
    N35 --> N14;
    N35 --> N16;
    N35 --> N18;
    N35 --> N20;
    N35 --> N22;
    N35 --> N24;
    N35 --> N26;
    N35 --> N28;
    N35 --> N30;
    N35 --> N32;
    N35 --> N34;
```
# Entrypoints

```
{
    Export(
        "unstable_getStaticPaths",
    ): 27,
    Export(
        "unstable_getServerSideProps",
    ): 33,
    ModuleEvaluation: 35,
    Export(
        "reportWebVitals",
    ): 23,
    Export(
        "unstable_getServerProps",
    ): 31,
    Export(
        "routeModule",
    ): 36,
    Export(
        "getStaticProps",
    ): 15,
    Export(
        "config",
    ): 21,
    Export(
        "unstable_getStaticParams",
    ): 29,
    Export(
        "unstable_getStaticProps",
    ): 25,
    Exports: 37,
    Export(
        "default",
    ): 13,
    Export(
        "getStaticPaths",
    ): 17,
    Export(
        "getServerSideProps",
    ): 19,
}
```


# Modules (dev)
## Part 0
```js
import Document from 'VAR_MODULE_DOCUMENT';
export { Document as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
import App from 'VAR_MODULE_APP';
export { App as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
import { RouteKind } from '../../server/future/route-kind';
export { RouteKind as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
import { PagesRouteModule } from '../../server/future/route-modules/pages/module.compiled';
export { PagesRouteModule as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
import * as userland from 'VAR_USERLAND';
export { userland as e } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import { hoist } from './helpers';
export { hoist as f } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 6
```js
import '../../server/future/route-modules/pages/module.compiled';

```
## Part 7
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import '../../server/future/route-kind';

```
## Part 8
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import './helpers';

```
## Part 9
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import 'VAR_MODULE_DOCUMENT';

```
## Part 10
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import 'VAR_MODULE_APP';

```
## Part 11
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import 'VAR_USERLAND';

```
## Part 12
```js
import { f as hoist } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -5
};
import { e as userland } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
const __TURBOPACK__default__export__ = hoist(userland, 'default');
export { __TURBOPACK__default__export__ as g } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 13
```js
import { g as __TURBOPACK__default__export__ } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -12
};
export { __TURBOPACK__default__export__ as default };

```
## Part 14
```js
import { f as hoist } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -5
};
import { e as userland } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
const getStaticProps = hoist(userland, 'getStaticProps');
export { getStaticProps as h } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 15
```js
import { h as getStaticProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
export { getStaticProps };

```
## Part 16
```js
import { f as hoist } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -5
};
import { e as userland } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
const getStaticPaths = hoist(userland, 'getStaticPaths');
export { getStaticPaths as i } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 17
```js
import { i as getStaticPaths } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -16
};
export { getStaticPaths };

```
## Part 18
```js
import { f as hoist } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -5
};
import { e as userland } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
const getServerSideProps = hoist(userland, 'getServerSideProps');
export { getServerSideProps as j } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 19
```js
import { j as getServerSideProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -18
};
export { getServerSideProps };

```
## Part 20
```js
import { f as hoist } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -5
};
import { e as userland } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 18
};
const config = hoist(userland, 'config');
export { config as k } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 21
```js
import { k as config } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -20
};
export { config };

```
## Part 22
```js
import { f as hoist } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -5
};
import { e as userland } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 18
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
const reportWebVitals = hoist(userland, 'reportWebVitals');
export { reportWebVitals as l } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 23
```js
import { l as reportWebVitals } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -22
};
export { reportWebVitals };

```
## Part 24
```js
import { f as hoist } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -5
};
import { e as userland } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 18
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 22
};
const unstable_getStaticProps = hoist(userland, 'unstable_getStaticProps');
export { unstable_getStaticProps as m } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 25
```js
import { m as unstable_getStaticProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -24
};
export { unstable_getStaticProps };

```
## Part 26
```js
import { f as hoist } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -5
};
import { e as userland } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 18
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 22
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 24
};
const unstable_getStaticPaths = hoist(userland, 'unstable_getStaticPaths');
export { unstable_getStaticPaths as n } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 27
```js
import { n as unstable_getStaticPaths } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -26
};
export { unstable_getStaticPaths };

```
## Part 28
```js
import { f as hoist } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -5
};
import { e as userland } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 18
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 22
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 24
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 26
};
const unstable_getStaticParams = hoist(userland, 'unstable_getStaticParams');
export { unstable_getStaticParams as o } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 29
```js
import { o as unstable_getStaticParams } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -28
};
export { unstable_getStaticParams };

```
## Part 30
```js
import { f as hoist } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -5
};
import { e as userland } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 18
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 22
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 24
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 26
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 28
};
const unstable_getServerProps = hoist(userland, 'unstable_getServerProps');
export { unstable_getServerProps as p } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 31
```js
import { p as unstable_getServerProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -30
};
export { unstable_getServerProps };

```
## Part 32
```js
import { f as hoist } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -5
};
import { e as userland } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 18
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 22
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 24
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 26
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 28
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 30
};
const unstable_getServerSideProps = hoist(userland, 'unstable_getServerSideProps');
export { unstable_getServerSideProps as q } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 33
```js
import { q as unstable_getServerSideProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -32
};
export { unstable_getServerSideProps };

```
## Part 34
```js
import { d as PagesRouteModule } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -3
};
import { c as RouteKind } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -2
};
import { b as App } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -1
};
import { a as Document } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
import { e as userland } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 32
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 18
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 22
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 24
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 26
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 28
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 30
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
export { routeModule as r } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 35
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 18
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 22
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 24
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 26
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 28
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 30
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 32
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 34
};
"module evaluation";

```
## Part 36
```js
import { r as routeModule } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -34
};
export { routeModule };

```
## Part 37
```js
export { default } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export default"
};
export { getStaticProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export getStaticProps"
};
export { getStaticPaths } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export getStaticPaths"
};
export { getServerSideProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export getServerSideProps"
};
export { config } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export config"
};
export { reportWebVitals } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export reportWebVitals"
};
export { unstable_getStaticProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export unstable_getStaticProps"
};
export { unstable_getStaticPaths } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export unstable_getStaticPaths"
};
export { unstable_getStaticParams } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export unstable_getStaticParams"
};
export { unstable_getServerProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export unstable_getServerProps"
};
export { unstable_getServerSideProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export unstable_getServerSideProps"
};
export { routeModule } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export routeModule"
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
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 18
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 22
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 24
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 26
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 28
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 30
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 32
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 34
};
"module evaluation";

```
# Entrypoints

```
{
    Export(
        "unstable_getStaticPaths",
    ): 27,
    Export(
        "unstable_getServerSideProps",
    ): 33,
    ModuleEvaluation: 35,
    Export(
        "reportWebVitals",
    ): 23,
    Export(
        "unstable_getServerProps",
    ): 31,
    Export(
        "routeModule",
    ): 36,
    Export(
        "getStaticProps",
    ): 15,
    Export(
        "config",
    ): 21,
    Export(
        "unstable_getStaticParams",
    ): 29,
    Export(
        "unstable_getStaticProps",
    ): 25,
    Exports: 37,
    Export(
        "default",
    ): 13,
    Export(
        "getStaticPaths",
    ): 17,
    Export(
        "getServerSideProps",
    ): 19,
}
```


# Modules (prod)
## Part 0
```js
import Document from 'VAR_MODULE_DOCUMENT';
export { Document as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
import App from 'VAR_MODULE_APP';
export { App as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
import { RouteKind } from '../../server/future/route-kind';
export { RouteKind as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
import { PagesRouteModule } from '../../server/future/route-modules/pages/module.compiled';
export { PagesRouteModule as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
import * as userland from 'VAR_USERLAND';
export { userland as e } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import { hoist } from './helpers';
export { hoist as f } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 6
```js
import '../../server/future/route-modules/pages/module.compiled';

```
## Part 7
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import '../../server/future/route-kind';

```
## Part 8
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import './helpers';

```
## Part 9
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import 'VAR_MODULE_DOCUMENT';

```
## Part 10
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import 'VAR_MODULE_APP';

```
## Part 11
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import 'VAR_USERLAND';

```
## Part 12
```js
import { f as hoist } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -5
};
import { e as userland } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
const __TURBOPACK__default__export__ = hoist(userland, 'default');
export { __TURBOPACK__default__export__ as g } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 13
```js
import { g as __TURBOPACK__default__export__ } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -12
};
export { __TURBOPACK__default__export__ as default };

```
## Part 14
```js
import { f as hoist } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -5
};
import { e as userland } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
const getStaticProps = hoist(userland, 'getStaticProps');
export { getStaticProps as h } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 15
```js
import { h as getStaticProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
export { getStaticProps };

```
## Part 16
```js
import { f as hoist } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -5
};
import { e as userland } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
const getStaticPaths = hoist(userland, 'getStaticPaths');
export { getStaticPaths as i } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 17
```js
import { i as getStaticPaths } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -16
};
export { getStaticPaths };

```
## Part 18
```js
import { f as hoist } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -5
};
import { e as userland } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
const getServerSideProps = hoist(userland, 'getServerSideProps');
export { getServerSideProps as j } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 19
```js
import { j as getServerSideProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -18
};
export { getServerSideProps };

```
## Part 20
```js
import { f as hoist } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -5
};
import { e as userland } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 18
};
const config = hoist(userland, 'config');
export { config as k } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 21
```js
import { k as config } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -20
};
export { config };

```
## Part 22
```js
import { f as hoist } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -5
};
import { e as userland } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 18
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
const reportWebVitals = hoist(userland, 'reportWebVitals');
export { reportWebVitals as l } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 23
```js
import { l as reportWebVitals } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -22
};
export { reportWebVitals };

```
## Part 24
```js
import { f as hoist } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -5
};
import { e as userland } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 18
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 22
};
const unstable_getStaticProps = hoist(userland, 'unstable_getStaticProps');
export { unstable_getStaticProps as m } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 25
```js
import { m as unstable_getStaticProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -24
};
export { unstable_getStaticProps };

```
## Part 26
```js
import { f as hoist } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -5
};
import { e as userland } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 18
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 22
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 24
};
const unstable_getStaticPaths = hoist(userland, 'unstable_getStaticPaths');
export { unstable_getStaticPaths as n } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 27
```js
import { n as unstable_getStaticPaths } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -26
};
export { unstable_getStaticPaths };

```
## Part 28
```js
import { f as hoist } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -5
};
import { e as userland } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 18
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 22
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 24
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 26
};
const unstable_getStaticParams = hoist(userland, 'unstable_getStaticParams');
export { unstable_getStaticParams as o } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 29
```js
import { o as unstable_getStaticParams } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -28
};
export { unstable_getStaticParams };

```
## Part 30
```js
import { f as hoist } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -5
};
import { e as userland } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 18
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 22
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 24
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 26
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 28
};
const unstable_getServerProps = hoist(userland, 'unstable_getServerProps');
export { unstable_getServerProps as p } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 31
```js
import { p as unstable_getServerProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -30
};
export { unstable_getServerProps };

```
## Part 32
```js
import { f as hoist } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -5
};
import { e as userland } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 18
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 22
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 24
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 26
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 28
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 30
};
const unstable_getServerSideProps = hoist(userland, 'unstable_getServerSideProps');
export { unstable_getServerSideProps as q } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 33
```js
import { q as unstable_getServerSideProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -32
};
export { unstable_getServerSideProps };

```
## Part 34
```js
import { d as PagesRouteModule } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -3
};
import { c as RouteKind } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -2
};
import { b as App } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -1
};
import { a as Document } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
import { e as userland } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 32
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 18
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 22
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 24
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 26
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 28
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 30
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
export { routeModule as r } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 35
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 18
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 22
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 24
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 26
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 28
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 30
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 32
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 34
};
"module evaluation";

```
## Part 36
```js
import { r as routeModule } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -34
};
export { routeModule };

```
## Part 37
```js
export { default } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export default"
};
export { getStaticProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export getStaticProps"
};
export { getStaticPaths } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export getStaticPaths"
};
export { getServerSideProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export getServerSideProps"
};
export { config } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export config"
};
export { reportWebVitals } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export reportWebVitals"
};
export { unstable_getStaticProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export unstable_getStaticProps"
};
export { unstable_getStaticPaths } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export unstable_getStaticPaths"
};
export { unstable_getStaticParams } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export unstable_getStaticParams"
};
export { unstable_getServerProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export unstable_getServerProps"
};
export { unstable_getServerSideProps } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export unstable_getServerSideProps"
};
export { routeModule } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export routeModule"
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
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 18
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 22
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 24
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 26
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 28
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 30
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 32
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 34
};
"module evaluation";

```
