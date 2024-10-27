# Items

Count: 14

## Item 1: Stmt 0, `ImportOfModule`

```js
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";

```

- Hoisted
- Side effects

## Item 2: Stmt 0, `ImportBinding(0)`

```js
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";

```

- Hoisted
- Declares: `_jsx`

## Item 3: Stmt 0, `ImportBinding(1)`

```js
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";

```

- Hoisted
- Declares: `_jsxs`

## Item 4: Stmt 0, `ImportBinding(2)`

```js
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";

```

- Hoisted
- Declares: `_Fragment`

## Item 5: Stmt 1, `ImportOfModule`

```js
import Document, { Html, Head, Main, NextScript } from 'next/document';

```

- Hoisted
- Side effects

## Item 6: Stmt 1, `ImportBinding(0)`

```js
import Document, { Html, Head, Main, NextScript } from 'next/document';

```

- Hoisted
- Declares: `Document`

## Item 7: Stmt 1, `ImportBinding(1)`

```js
import Document, { Html, Head, Main, NextScript } from 'next/document';

```

- Hoisted
- Declares: `Html`

## Item 8: Stmt 1, `ImportBinding(2)`

```js
import Document, { Html, Head, Main, NextScript } from 'next/document';

```

- Hoisted
- Declares: `Head`

## Item 9: Stmt 1, `ImportBinding(3)`

```js
import Document, { Html, Head, Main, NextScript } from 'next/document';

```

- Hoisted
- Declares: `Main`

## Item 10: Stmt 1, `ImportBinding(4)`

```js
import Document, { Html, Head, Main, NextScript } from 'next/document';

```

- Hoisted
- Declares: `NextScript`

## Item 11: Stmt 2, `Normal`

```js
class MyDocument extends Document {
    static async getInitialProps(ctx) {
        const initialProps = await Document.getInitialProps(ctx);
        return {
            ...initialProps,
            styles: _jsxs(_Fragment, {
                children: [
                    initialProps.styles,
                    _jsx("style", {
                        dangerouslySetInnerHTML: {
                            __html: `html { background: hotpink; }`
                        }
                    })
                ]
            })
        };
    }
    render() {
        return _jsxs(Html, {
            children: [
                _jsx(Head, {}),
                _jsxs("body", {
                    children: [
                        _jsx(Main, {}),
                        _jsx(NextScript, {})
                    ]
                })
            ]
        });
    }
}

```

- Declares: `MyDocument`
- Reads: `Document`, `_jsxs`, `_Fragment`, `_jsx`, `Html`, `Head`, `Main`, `NextScript`
- Write: `Document`, `MyDocument`

## Item 12: Stmt 3, `Normal`

```js
export default MyDocument;

```

- Side effects
- Declares: `__TURBOPACK__default__export__`
- Reads: `MyDocument`
- Write: `__TURBOPACK__default__export__`

# Phase 1
```mermaid
graph TD
    Item1;
    Item3;
    Item4;
    Item5;
    Item2;
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
    Item14["export default"];
    Item2 --> Item1;
```
# Phase 2
```mermaid
graph TD
    Item1;
    Item3;
    Item4;
    Item5;
    Item2;
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
    Item14["export default"];
    Item2 --> Item1;
    Item11 --> Item6;
    Item11 --> Item4;
    Item11 --> Item5;
    Item11 --> Item3;
    Item11 --> Item7;
    Item11 --> Item8;
    Item11 --> Item9;
    Item11 --> Item10;
    Item12 --> Item11;
    Item12 --> Item2;
    Item14 --> Item12;
```
# Phase 3
```mermaid
graph TD
    Item1;
    Item3;
    Item4;
    Item5;
    Item2;
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
    Item14["export default"];
    Item2 --> Item1;
    Item11 --> Item6;
    Item11 --> Item4;
    Item11 --> Item5;
    Item11 --> Item3;
    Item11 --> Item7;
    Item11 --> Item8;
    Item11 --> Item9;
    Item11 --> Item10;
    Item12 --> Item11;
    Item12 --> Item2;
    Item14 --> Item12;
```
# Phase 4
```mermaid
graph TD
    Item1;
    Item3;
    Item4;
    Item5;
    Item2;
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
    Item14["export default"];
    Item2 --> Item1;
    Item11 --> Item6;
    Item11 --> Item4;
    Item11 --> Item5;
    Item11 --> Item3;
    Item11 --> Item7;
    Item11 --> Item8;
    Item11 --> Item9;
    Item11 --> Item10;
    Item12 --> Item11;
    Item12 --> Item2;
    Item14 --> Item12;
    Item13 --> Item12;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(ModuleEvaluation)]"];
    N1["Items: [ItemId(Export((&quot;__TURBOPACK__default__export__&quot;, #5), &quot;default&quot;))]"];
    N2["Items: [ItemId(0, ImportOfModule)]"];
    N3["Items: [ItemId(0, ImportBinding(0))]"];
    N4["Items: [ItemId(0, ImportBinding(1))]"];
    N5["Items: [ItemId(0, ImportBinding(2))]"];
    N6["Items: [ItemId(1, ImportOfModule)]"];
    N7["Items: [ItemId(1, ImportBinding(0))]"];
    N8["Items: [ItemId(1, ImportBinding(1))]"];
    N9["Items: [ItemId(1, ImportBinding(2))]"];
    N10["Items: [ItemId(1, ImportBinding(3))]"];
    N11["Items: [ItemId(1, ImportBinding(4))]"];
    N12["Items: [ItemId(2, Normal)]"];
    N13["Items: [ItemId(3, Normal)]"];
    N6 --> N2;
    N12 --> N7;
    N12 --> N4;
    N12 --> N5;
    N12 --> N3;
    N12 --> N8;
    N12 --> N9;
    N12 --> N10;
    N12 --> N11;
    N13 --> N12;
    N13 --> N6;
    N1 --> N13;
    N0 --> N13;
```
# Entrypoints

```
{
    ModuleEvaluation: 0,
    Export(
        "default",
    ): 1,
    Exports: 14,
}
```


# Modules (dev)
## Part 0
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
"module evaluation";

```
## Part 1
```js
import { a as __TURBOPACK__default__export__ } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -13
};
export { __TURBOPACK__default__export__ as default };

```
## Part 2
```js
import "react/jsx-runtime";

```
## Part 3
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { jsx as _jsx } from "react/jsx-runtime";
export { _jsx as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { jsxs as _jsxs } from "react/jsx-runtime";
export { _jsxs as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { Fragment as _Fragment } from "react/jsx-runtime";
export { _Fragment as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 6
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import 'next/document';

```
## Part 7
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import Document from 'next/document';
export { Document as e } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 8
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import { Html } from 'next/document';
export { Html as f } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 9
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import { Head } from 'next/document';
export { Head as g } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 10
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import { Main } from 'next/document';
export { Main as h } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 11
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import { NextScript } from 'next/document';
export { NextScript as i } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 12
```js
import { e as Document } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -7,
    __turbopack_original__: 'next/document'
};
import { c as _jsxs } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -4,
    __turbopack_original__: "react/jsx-runtime"
};
import { d as _Fragment } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -5,
    __turbopack_original__: "react/jsx-runtime"
};
import { b as _jsx } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -3,
    __turbopack_original__: "react/jsx-runtime"
};
import { f as Html } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -8,
    __turbopack_original__: 'next/document'
};
import { g as Head } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -9,
    __turbopack_original__: 'next/document'
};
import { h as Main } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -10,
    __turbopack_original__: 'next/document'
};
import { i as NextScript } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -11,
    __turbopack_original__: 'next/document'
};
class MyDocument extends Document {
    static async getInitialProps(ctx) {
        const initialProps = await Document.getInitialProps(ctx);
        return {
            ...initialProps,
            styles: _jsxs(_Fragment, {
                children: [
                    initialProps.styles,
                    _jsx("style", {
                        dangerouslySetInnerHTML: {
                            __html: `html { background: hotpink; }`
                        }
                    })
                ]
            })
        };
    }
    render() {
        return _jsxs(Html, {
            children: [
                _jsx(Head, {}),
                _jsxs("body", {
                    children: [
                        _jsx(Main, {}),
                        _jsx(NextScript, {})
                    ]
                })
            ]
        });
    }
}
export { MyDocument as j } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 13
```js
import { j as MyDocument } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
const __TURBOPACK__default__export__ = MyDocument;
export { __TURBOPACK__default__export__ as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 14
```js
export { default } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export default"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
"module evaluation";

```
# Entrypoints

```
{
    ModuleEvaluation: 0,
    Export(
        "default",
    ): 1,
    Exports: 14,
}
```


# Modules (prod)
## Part 0
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
"module evaluation";

```
## Part 1
```js
import { a as __TURBOPACK__default__export__ } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -13
};
export { __TURBOPACK__default__export__ as default };

```
## Part 2
```js
import "react/jsx-runtime";

```
## Part 3
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { jsx as _jsx } from "react/jsx-runtime";
export { _jsx as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { jsxs as _jsxs } from "react/jsx-runtime";
export { _jsxs as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { Fragment as _Fragment } from "react/jsx-runtime";
export { _Fragment as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 6
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import 'next/document';

```
## Part 7
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import Document from 'next/document';
export { Document as e } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 8
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import { Html } from 'next/document';
export { Html as f } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 9
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import { Head } from 'next/document';
export { Head as g } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 10
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import { Main } from 'next/document';
export { Main as h } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 11
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import { NextScript } from 'next/document';
export { NextScript as i } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 12
```js
import { e as Document } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -7,
    __turbopack_original__: 'next/document'
};
import { c as _jsxs } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -4,
    __turbopack_original__: "react/jsx-runtime"
};
import { d as _Fragment } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -5,
    __turbopack_original__: "react/jsx-runtime"
};
import { b as _jsx } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -3,
    __turbopack_original__: "react/jsx-runtime"
};
import { f as Html } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -8,
    __turbopack_original__: 'next/document'
};
import { g as Head } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -9,
    __turbopack_original__: 'next/document'
};
import { h as Main } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -10,
    __turbopack_original__: 'next/document'
};
import { i as NextScript } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -11,
    __turbopack_original__: 'next/document'
};
class MyDocument extends Document {
    static async getInitialProps(ctx) {
        const initialProps = await Document.getInitialProps(ctx);
        return {
            ...initialProps,
            styles: _jsxs(_Fragment, {
                children: [
                    initialProps.styles,
                    _jsx("style", {
                        dangerouslySetInnerHTML: {
                            __html: `html { background: hotpink; }`
                        }
                    })
                ]
            })
        };
    }
    render() {
        return _jsxs(Html, {
            children: [
                _jsx(Head, {}),
                _jsxs("body", {
                    children: [
                        _jsx(Main, {}),
                        _jsx(NextScript, {})
                    ]
                })
            ]
        });
    }
}
export { MyDocument as j } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 13
```js
import { j as MyDocument } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
const __TURBOPACK__default__export__ = MyDocument;
export { __TURBOPACK__default__export__ as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 14
```js
export { default } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export default"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
"module evaluation";

```
