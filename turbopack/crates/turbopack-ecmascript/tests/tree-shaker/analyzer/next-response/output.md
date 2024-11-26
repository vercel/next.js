# Items

Count: 17

## Item 1: Stmt 0, `ImportOfModule`

```js
import { stringifyCookie } from '../../web/spec-extension/cookies';

```

- Hoisted
- Side effects

## Item 2: Stmt 0, `ImportBinding(0)`

```js
import { stringifyCookie } from '../../web/spec-extension/cookies';

```

- Hoisted
- Declares: `stringifyCookie`

## Item 3: Stmt 1, `ImportOfModule`

```js
import { NextURL } from '../next-url';

```

- Hoisted
- Side effects

## Item 4: Stmt 1, `ImportBinding(0)`

```js
import { NextURL } from '../next-url';

```

- Hoisted
- Declares: `NextURL`

## Item 5: Stmt 2, `ImportOfModule`

```js
import { toNodeOutgoingHttpHeaders, validateURL } from '../utils';

```

- Hoisted
- Side effects

## Item 6: Stmt 2, `ImportBinding(0)`

```js
import { toNodeOutgoingHttpHeaders, validateURL } from '../utils';

```

- Hoisted
- Declares: `toNodeOutgoingHttpHeaders`

## Item 7: Stmt 2, `ImportBinding(1)`

```js
import { toNodeOutgoingHttpHeaders, validateURL } from '../utils';

```

- Hoisted
- Declares: `validateURL`

## Item 8: Stmt 3, `ImportOfModule`

```js
import { ReflectAdapter } from './adapters/reflect';

```

- Hoisted
- Side effects

## Item 9: Stmt 3, `ImportBinding(0)`

```js
import { ReflectAdapter } from './adapters/reflect';

```

- Hoisted
- Declares: `ReflectAdapter`

## Item 10: Stmt 4, `ImportOfModule`

```js
import { ResponseCookies } from './cookies';

```

- Hoisted
- Side effects

## Item 11: Stmt 4, `ImportBinding(0)`

```js
import { ResponseCookies } from './cookies';

```

- Hoisted
- Declares: `ResponseCookies`

## Item 12: Stmt 5, `VarDeclarator(0)`

```js
const INTERNALS = Symbol('internal response');

```

- Side effects
- Declares: `INTERNALS`
- Write: `INTERNALS`

## Item 13: Stmt 6, `VarDeclarator(0)`

```js
const REDIRECTS = new Set([
    301,
    302,
    303,
    307,
    308
]);

```

- Side effects
- Declares: `REDIRECTS`
- Write: `REDIRECTS`

## Item 14: Stmt 7, `Normal`

```js
function handleMiddlewareField(init, headers) {
    var _init_request;
    if (init == null ? void 0 : (_init_request = init.request) == null ? void 0 : _init_request.headers) {
        if (!(init.request.headers instanceof Headers)) {
            throw new Error('request.headers must be an instance of Headers');
        }
        const keys = [];
        for (const [key, value] of init.request.headers){
            headers.set('x-middleware-request-' + key, value);
            keys.push(key);
        }
        headers.set('x-middleware-override-headers', keys.join(','));
    }
}

```

- Hoisted
- Declares: `handleMiddlewareField`
- Write: `handleMiddlewareField`

## Item 15: Stmt 8, `Normal`

```js
export class NextResponse extends Response {
    constructor(body, init = {}){
        super(body, init);
        const headers = this.headers;
        const cookies = new ResponseCookies(headers);
        const cookiesProxy = new Proxy(cookies, {
            get (target, prop, receiver) {
                switch(prop){
                    case 'delete':
                    case 'set':
                        {
                            return (...args)=>{
                                const result = Reflect.apply(target[prop], target, args);
                                const newHeaders = new Headers(headers);
                                if (result instanceof ResponseCookies) {
                                    headers.set('x-middleware-set-cookie', result.getAll().map((cookie)=>stringifyCookie(cookie)).join(','));
                                }
                                handleMiddlewareField(init, newHeaders);
                                return result;
                            };
                        }
                    default:
                        return ReflectAdapter.get(target, prop, receiver);
                }
            }
        });
        this[INTERNALS] = {
            cookies: cookiesProxy,
            url: init.url ? new NextURL(init.url, {
                headers: toNodeOutgoingHttpHeaders(headers),
                nextConfig: init.nextConfig
            }) : undefined
        };
    }
    [Symbol.for('edge-runtime.inspect.custom')]() {
        return {
            cookies: this.cookies,
            url: this.url,
            body: this.body,
            bodyUsed: this.bodyUsed,
            headers: Object.fromEntries(this.headers),
            ok: this.ok,
            redirected: this.redirected,
            status: this.status,
            statusText: this.statusText,
            type: this.type
        };
    }
    get cookies() {
        return this[INTERNALS].cookies;
    }
    static json(body, init) {
        const response = Response.json(body, init);
        return new NextResponse(response.body, response);
    }
    static redirect(url, init) {
        const status = typeof init === 'number' ? init : (init == null ? void 0 : init.status) ?? 307;
        if (!REDIRECTS.has(status)) {
            throw new RangeError('Failed to execute "redirect" on "response": Invalid status code');
        }
        const initObj = typeof init === 'object' ? init : {};
        const headers = new Headers(initObj == null ? void 0 : initObj.headers);
        headers.set('Location', validateURL(url));
        return new NextResponse(null, {
            ...initObj,
            headers,
            status
        });
    }
    static rewrite(destination, init) {
        const headers = new Headers(init == null ? void 0 : init.headers);
        headers.set('x-middleware-rewrite', validateURL(destination));
        handleMiddlewareField(init, headers);
        return new NextResponse(null, {
            ...init,
            headers
        });
    }
    static next(init) {
        const headers = new Headers(init == null ? void 0 : init.headers);
        headers.set('x-middleware-next', '1');
        handleMiddlewareField(init, headers);
        return new NextResponse(null, {
            ...init,
            headers
        });
    }
}

```

- Declares: `NextResponse`
- Reads: `ResponseCookies`, `stringifyCookie`, `handleMiddlewareField`, `ReflectAdapter`, `INTERNALS`, `NextURL`, `toNodeOutgoingHttpHeaders`, `NextResponse`, `REDIRECTS`, `validateURL`
- Write: `ReflectAdapter`, `REDIRECTS`, `NextResponse`

# Phase 1
```mermaid
graph TD
    Item1;
    Item6;
    Item2;
    Item7;
    Item3;
    Item8;
    Item9;
    Item4;
    Item10;
    Item5;
    Item11;
    Item12;
    Item13;
    Item14;
    Item15;
    Item16;
    Item16["ModuleEvaluation"];
    Item17;
    Item17["export NextResponse"];
    Item2 --> Item1;
    Item3 --> Item2;
    Item4 --> Item3;
    Item5 --> Item4;
```
# Phase 2
```mermaid
graph TD
    Item1;
    Item6;
    Item2;
    Item7;
    Item3;
    Item8;
    Item9;
    Item4;
    Item10;
    Item5;
    Item11;
    Item12;
    Item13;
    Item14;
    Item15;
    Item16;
    Item16["ModuleEvaluation"];
    Item17;
    Item17["export NextResponse"];
    Item2 --> Item1;
    Item3 --> Item2;
    Item4 --> Item3;
    Item5 --> Item4;
    Item12 --> Item5;
    Item13 --> Item12;
    Item15 --> Item11;
    Item15 --> Item6;
    Item15 --> Item14;
    Item15 --> Item10;
    Item15 --> Item12;
    Item15 --> Item7;
    Item15 --> Item8;
    Item15 --> Item13;
    Item15 --> Item9;
    Item17 --> Item15;
```
# Phase 3
```mermaid
graph TD
    Item1;
    Item6;
    Item2;
    Item7;
    Item3;
    Item8;
    Item9;
    Item4;
    Item10;
    Item5;
    Item11;
    Item12;
    Item13;
    Item14;
    Item15;
    Item16;
    Item16["ModuleEvaluation"];
    Item17;
    Item17["export NextResponse"];
    Item2 --> Item1;
    Item3 --> Item2;
    Item4 --> Item3;
    Item5 --> Item4;
    Item12 --> Item5;
    Item13 --> Item12;
    Item15 --> Item11;
    Item15 --> Item6;
    Item15 --> Item14;
    Item15 --> Item10;
    Item15 --> Item12;
    Item15 --> Item7;
    Item15 --> Item8;
    Item15 --> Item13;
    Item15 --> Item9;
    Item17 --> Item15;
```
# Phase 4
```mermaid
graph TD
    Item1;
    Item6;
    Item2;
    Item7;
    Item3;
    Item8;
    Item9;
    Item4;
    Item10;
    Item5;
    Item11;
    Item12;
    Item13;
    Item14;
    Item15;
    Item16;
    Item16["ModuleEvaluation"];
    Item17;
    Item17["export NextResponse"];
    Item2 --> Item1;
    Item3 --> Item2;
    Item4 --> Item3;
    Item5 --> Item4;
    Item12 --> Item5;
    Item13 --> Item12;
    Item15 --> Item11;
    Item15 --> Item6;
    Item15 --> Item14;
    Item15 --> Item10;
    Item15 --> Item12;
    Item15 --> Item7;
    Item15 --> Item8;
    Item15 --> Item13;
    Item15 --> Item9;
    Item17 --> Item15;
    Item16 --> Item13;
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
    N6["Items: [ItemId(2, ImportBinding(1))]"];
    N7["Items: [ItemId(3, ImportOfModule)]"];
    N8["Items: [ItemId(3, ImportBinding(0))]"];
    N9["Items: [ItemId(4, ImportOfModule)]"];
    N10["Items: [ItemId(4, ImportBinding(0))]"];
    N11["Items: [ItemId(5, VarDeclarator(0))]"];
    N12["Items: [ItemId(6, VarDeclarator(0))]"];
    N13["Items: [ItemId(7, Normal), ItemId(8, Normal), ItemId(Export((&quot;NextResponse&quot;, #2), &quot;NextResponse&quot;))]"];
    N14["Items: [ItemId(ModuleEvaluation)]"];
    N2 --> N0;
    N4 --> N2;
    N7 --> N4;
    N9 --> N7;
    N11 --> N9;
    N12 --> N11;
    N13 --> N6;
    N13 --> N12;
    N13 --> N5;
    N13 --> N3;
    N13 --> N11;
    N13 --> N8;
    N8 --> N7;
    N13 --> N1;
    N13 --> N10;
    N10 --> N9;
    N14 --> N12;
    N1 --> N0;
    N3 --> N2;
    N5 --> N4;
    N6 --> N4;
```
# Entrypoints

```
{
    ModuleEvaluation: 14,
    Export(
        "NextResponse",
    ): 13,
    Exports: 15,
}
```


# Modules (dev)
## Part 0
```js
import '../../web/spec-extension/cookies';

```
## Part 1
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { stringifyCookie } from '../../web/spec-extension/cookies';
export { stringifyCookie as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import '../next-url';

```
## Part 3
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { NextURL } from '../next-url';
export { NextURL as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import '../utils';

```
## Part 5
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { toNodeOutgoingHttpHeaders } from '../utils';
export { toNodeOutgoingHttpHeaders as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 6
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { validateURL } from '../utils';
export { validateURL as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 7
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import './adapters/reflect';

```
## Part 8
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import { ReflectAdapter } from './adapters/reflect';
export { ReflectAdapter as e } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 9
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import './cookies';

```
## Part 10
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import { ResponseCookies } from './cookies';
export { ResponseCookies as f } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 11
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
const INTERNALS = Symbol('internal response');
export { INTERNALS as g } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 12
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
const REDIRECTS = new Set([
    301,
    302,
    303,
    307,
    308
]);
export { REDIRECTS as h } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 13
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { validateURL } from '../utils';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import { ResponseCookies } from './cookies';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { stringifyCookie } from '../../web/spec-extension/cookies';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import { ReflectAdapter } from './adapters/reflect';
import { g as INTERNALS } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { NextURL } from '../next-url';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { toNodeOutgoingHttpHeaders } from '../utils';
import { h as REDIRECTS } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -12
};
function handleMiddlewareField(init, headers) {
    var _init_request;
    if (init == null ? void 0 : (_init_request = init.request) == null ? void 0 : _init_request.headers) {
        if (!(init.request.headers instanceof Headers)) {
            throw new Error('request.headers must be an instance of Headers');
        }
        const keys = [];
        for (const [key, value] of init.request.headers){
            headers.set('x-middleware-request-' + key, value);
            keys.push(key);
        }
        headers.set('x-middleware-override-headers', keys.join(','));
    }
}
class NextResponse extends Response {
    constructor(body, init = {}){
        super(body, init);
        const headers = this.headers;
        const cookies = new ResponseCookies(headers);
        const cookiesProxy = new Proxy(cookies, {
            get (target, prop, receiver) {
                switch(prop){
                    case 'delete':
                    case 'set':
                        {
                            return (...args)=>{
                                const result = Reflect.apply(target[prop], target, args);
                                const newHeaders = new Headers(headers);
                                if (result instanceof ResponseCookies) {
                                    headers.set('x-middleware-set-cookie', result.getAll().map((cookie)=>stringifyCookie(cookie)).join(','));
                                }
                                handleMiddlewareField(init, newHeaders);
                                return result;
                            };
                        }
                    default:
                        return ReflectAdapter.get(target, prop, receiver);
                }
            }
        });
        this[INTERNALS] = {
            cookies: cookiesProxy,
            url: init.url ? new NextURL(init.url, {
                headers: toNodeOutgoingHttpHeaders(headers),
                nextConfig: init.nextConfig
            }) : undefined
        };
    }
    [Symbol.for('edge-runtime.inspect.custom')]() {
        return {
            cookies: this.cookies,
            url: this.url,
            body: this.body,
            bodyUsed: this.bodyUsed,
            headers: Object.fromEntries(this.headers),
            ok: this.ok,
            redirected: this.redirected,
            status: this.status,
            statusText: this.statusText,
            type: this.type
        };
    }
    get cookies() {
        return this[INTERNALS].cookies;
    }
    static json(body, init) {
        const response = Response.json(body, init);
        return new NextResponse(response.body, response);
    }
    static redirect(url, init) {
        const status = typeof init === 'number' ? init : (init == null ? void 0 : init.status) ?? 307;
        if (!REDIRECTS.has(status)) {
            throw new RangeError('Failed to execute "redirect" on "response": Invalid status code');
        }
        const initObj = typeof init === 'object' ? init : {};
        const headers = new Headers(initObj == null ? void 0 : initObj.headers);
        headers.set('Location', validateURL(url));
        return new NextResponse(null, {
            ...initObj,
            headers,
            status
        });
    }
    static rewrite(destination, init) {
        const headers = new Headers(init == null ? void 0 : init.headers);
        headers.set('x-middleware-rewrite', validateURL(destination));
        handleMiddlewareField(init, headers);
        return new NextResponse(null, {
            ...init,
            headers
        });
    }
    static next(init) {
        const headers = new Headers(init == null ? void 0 : init.headers);
        headers.set('x-middleware-next', '1');
        handleMiddlewareField(init, headers);
        return new NextResponse(null, {
            ...init,
            headers
        });
    }
}
export { NextResponse };
export { handleMiddlewareField as i } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { NextResponse as j } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 14
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
"module evaluation";

```
## Part 15
```js
export { NextResponse } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export NextResponse"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
"module evaluation";

```
# Entrypoints

```
{
    ModuleEvaluation: 14,
    Export(
        "NextResponse",
    ): 13,
    Exports: 15,
}
```


# Modules (prod)
## Part 0
```js
import '../../web/spec-extension/cookies';

```
## Part 1
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { stringifyCookie } from '../../web/spec-extension/cookies';
export { stringifyCookie as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import '../next-url';

```
## Part 3
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { NextURL } from '../next-url';
export { NextURL as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import '../utils';

```
## Part 5
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { toNodeOutgoingHttpHeaders } from '../utils';
export { toNodeOutgoingHttpHeaders as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 6
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { validateURL } from '../utils';
export { validateURL as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 7
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import './adapters/reflect';

```
## Part 8
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import { ReflectAdapter } from './adapters/reflect';
export { ReflectAdapter as e } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 9
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import './cookies';

```
## Part 10
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import { ResponseCookies } from './cookies';
export { ResponseCookies as f } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 11
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
const INTERNALS = Symbol('internal response');
export { INTERNALS as g } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 12
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
const REDIRECTS = new Set([
    301,
    302,
    303,
    307,
    308
]);
export { REDIRECTS as h } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 13
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { validateURL } from '../utils';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import { ResponseCookies } from './cookies';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { stringifyCookie } from '../../web/spec-extension/cookies';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import { ReflectAdapter } from './adapters/reflect';
import { g as INTERNALS } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { NextURL } from '../next-url';
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { toNodeOutgoingHttpHeaders } from '../utils';
import { h as REDIRECTS } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -12
};
function handleMiddlewareField(init, headers) {
    var _init_request;
    if (init == null ? void 0 : (_init_request = init.request) == null ? void 0 : _init_request.headers) {
        if (!(init.request.headers instanceof Headers)) {
            throw new Error('request.headers must be an instance of Headers');
        }
        const keys = [];
        for (const [key, value] of init.request.headers){
            headers.set('x-middleware-request-' + key, value);
            keys.push(key);
        }
        headers.set('x-middleware-override-headers', keys.join(','));
    }
}
class NextResponse extends Response {
    constructor(body, init = {}){
        super(body, init);
        const headers = this.headers;
        const cookies = new ResponseCookies(headers);
        const cookiesProxy = new Proxy(cookies, {
            get (target, prop, receiver) {
                switch(prop){
                    case 'delete':
                    case 'set':
                        {
                            return (...args)=>{
                                const result = Reflect.apply(target[prop], target, args);
                                const newHeaders = new Headers(headers);
                                if (result instanceof ResponseCookies) {
                                    headers.set('x-middleware-set-cookie', result.getAll().map((cookie)=>stringifyCookie(cookie)).join(','));
                                }
                                handleMiddlewareField(init, newHeaders);
                                return result;
                            };
                        }
                    default:
                        return ReflectAdapter.get(target, prop, receiver);
                }
            }
        });
        this[INTERNALS] = {
            cookies: cookiesProxy,
            url: init.url ? new NextURL(init.url, {
                headers: toNodeOutgoingHttpHeaders(headers),
                nextConfig: init.nextConfig
            }) : undefined
        };
    }
    [Symbol.for('edge-runtime.inspect.custom')]() {
        return {
            cookies: this.cookies,
            url: this.url,
            body: this.body,
            bodyUsed: this.bodyUsed,
            headers: Object.fromEntries(this.headers),
            ok: this.ok,
            redirected: this.redirected,
            status: this.status,
            statusText: this.statusText,
            type: this.type
        };
    }
    get cookies() {
        return this[INTERNALS].cookies;
    }
    static json(body, init) {
        const response = Response.json(body, init);
        return new NextResponse(response.body, response);
    }
    static redirect(url, init) {
        const status = typeof init === 'number' ? init : (init == null ? void 0 : init.status) ?? 307;
        if (!REDIRECTS.has(status)) {
            throw new RangeError('Failed to execute "redirect" on "response": Invalid status code');
        }
        const initObj = typeof init === 'object' ? init : {};
        const headers = new Headers(initObj == null ? void 0 : initObj.headers);
        headers.set('Location', validateURL(url));
        return new NextResponse(null, {
            ...initObj,
            headers,
            status
        });
    }
    static rewrite(destination, init) {
        const headers = new Headers(init == null ? void 0 : init.headers);
        headers.set('x-middleware-rewrite', validateURL(destination));
        handleMiddlewareField(init, headers);
        return new NextResponse(null, {
            ...init,
            headers
        });
    }
    static next(init) {
        const headers = new Headers(init == null ? void 0 : init.headers);
        headers.set('x-middleware-next', '1');
        handleMiddlewareField(init, headers);
        return new NextResponse(null, {
            ...init,
            headers
        });
    }
}
export { NextResponse };
export { handleMiddlewareField as i } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { NextResponse as j } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 14
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
"module evaluation";

```
## Part 15
```js
export { NextResponse } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export NextResponse"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
"module evaluation";

```
