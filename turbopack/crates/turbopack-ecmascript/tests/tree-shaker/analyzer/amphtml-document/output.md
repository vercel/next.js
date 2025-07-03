# Items

Count: 13

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
    Item13["export default"];
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
    Item13["export default"];
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
    Item13 --> Item12;
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
    Item13["export default"];
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
    Item13 --> Item12;
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
    Item13["export default"];
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
    Item13 --> Item12;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(0, ImportOfModule)]"];
    N1["Items: [ItemId(0, ImportBinding(0))]"];
    N2["Items: [ItemId(0, ImportBinding(1))]"];
    N3["Items: [ItemId(0, ImportBinding(2))]"];
    N4["Items: [ItemId(1, ImportOfModule)]"];
    N5["Items: [ItemId(1, ImportBinding(0))]"];
    N6["Items: [ItemId(1, ImportBinding(1))]"];
    N7["Items: [ItemId(1, ImportBinding(2))]"];
    N8["Items: [ItemId(1, ImportBinding(3))]"];
    N9["Items: [ItemId(1, ImportBinding(4))]"];
    N10["Items: [ItemId(2, Normal), ItemId(3, Normal), ItemId(Export((&quot;__TURBOPACK__default__export__&quot;, #0), &quot;default&quot;))]"];
    N4 --> N0;
    N9 --> N4;
    N1 --> N0;
    N2 --> N0;
    N3 --> N0;
    N5 --> N4;
    N6 --> N4;
    N7 --> N4;
    N8 --> N4;
    N10 --> N4;
```
# Entrypoints

```
{
    ModuleEvaluation: 10,
    Export(
        "default",
    ): 10,
    Exports: 11,
}
```


# Modules (dev)
## Part 0
```js
import "react/jsx-runtime";

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

```
## Part 3
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};

```
## Part 4
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import 'next/document';

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

```
## Part 7
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};

```
## Part 8
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};

```
## Part 9
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};

```
## Part 10
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import Document from 'next/document';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { jsxs as _jsxs } from "react/jsx-runtime";
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { Fragment as _Fragment } from "react/jsx-runtime";
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { jsx as _jsx } from "react/jsx-runtime";
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { Html } from 'next/document';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { Head } from 'next/document';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { Main } from 'next/document';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { NextScript } from 'next/document';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
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
const __TURBOPACK__default__export__ = MyDocument;
export { __TURBOPACK__default__export__ as default };
export { MyDocument as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { __TURBOPACK__default__export__ as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { };

```
## Part 11
```js
export { default } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export default"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import Document from 'next/document';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { jsxs as _jsxs } from "react/jsx-runtime";
import { Fragment as _Fragment } from "react/jsx-runtime";
import { jsx as _jsx } from "react/jsx-runtime";
import { Html } from 'next/document';
import { Head } from 'next/document';
import { Main } from 'next/document';
import { NextScript } from 'next/document';
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
const __TURBOPACK__default__export__ = MyDocument;
export { __TURBOPACK__default__export__ as default };
export { MyDocument as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { __TURBOPACK__default__export__ as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { };

```
# Entrypoints

```
{
    ModuleEvaluation: 10,
    Export(
        "default",
    ): 10,
    Exports: 11,
}
```


# Modules (prod)
## Part 0
```js
import "react/jsx-runtime";

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

```
## Part 3
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};

```
## Part 4
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import 'next/document';

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

```
## Part 7
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};

```
## Part 8
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};

```
## Part 9
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};

```
## Part 10
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import Document from 'next/document';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { jsxs as _jsxs } from "react/jsx-runtime";
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { Fragment as _Fragment } from "react/jsx-runtime";
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { jsx as _jsx } from "react/jsx-runtime";
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { Html } from 'next/document';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { Head } from 'next/document';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { Main } from 'next/document';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { NextScript } from 'next/document';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
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
const __TURBOPACK__default__export__ = MyDocument;
export { __TURBOPACK__default__export__ as default };
export { MyDocument as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { __TURBOPACK__default__export__ as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { };

```
## Part 11
```js
export { default } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export default"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import Document from 'next/document';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { jsxs as _jsxs } from "react/jsx-runtime";
import { Fragment as _Fragment } from "react/jsx-runtime";
import { jsx as _jsx } from "react/jsx-runtime";
import { Html } from 'next/document';
import { Head } from 'next/document';
import { Main } from 'next/document';
import { NextScript } from 'next/document';
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
const __TURBOPACK__default__export__ = MyDocument;
export { __TURBOPACK__default__export__ as default };
export { MyDocument as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { __TURBOPACK__default__export__ as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { };

```
