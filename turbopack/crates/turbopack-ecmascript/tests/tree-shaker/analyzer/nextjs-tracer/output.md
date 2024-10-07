# Items

Count: 23

## Item 1: Stmt 0, `ImportOfModule`

```js
import { LogSpanAllowList, NextVanillaSpanAllowlist } from './constants';

```

- Hoisted
- Side effects

## Item 2: Stmt 0, `ImportBinding(0)`

```js
import { LogSpanAllowList, NextVanillaSpanAllowlist } from './constants';

```

- Hoisted
- Declares: `LogSpanAllowList`

## Item 3: Stmt 0, `ImportBinding(1)`

```js
import { LogSpanAllowList, NextVanillaSpanAllowlist } from './constants';

```

- Hoisted
- Declares: `NextVanillaSpanAllowlist`

## Item 4: Stmt 1, `VarDeclarator(0)`

```js
let api;

```

- Declares: `api`
- Write: `api`

## Item 5: Stmt 2, `Normal`

```js
if (process.env.NEXT_RUNTIME === 'edge') {
    api = require('@opentelemetry/api');
} else {
    try {
        api = require('@opentelemetry/api');
    } catch (err) {
        api = require('next/dist/compiled/@opentelemetry/api');
    }
}

```

- Side effects
- Write: `api`

## Item 6: Stmt 3, `VarDeclarator(0)`

```js
const { context, propagation, trace, SpanStatusCode, SpanKind, ROOT_CONTEXT } = api;

```

- Declares: `context`, `propagation`, `trace`, `SpanStatusCode`, `SpanKind`, `ROOT_CONTEXT`
- Reads: `api`
- Write: `context`, `propagation`, `trace`, `SpanStatusCode`, `SpanKind`, `ROOT_CONTEXT`

## Item 7: Stmt 4, `VarDeclarator(0)`

```js
const isPromise = (p)=>{
    return p !== null && typeof p === 'object' && typeof p.then === 'function';
};

```

- Declares: `isPromise`
- Write: `isPromise`

## Item 8: Stmt 5, `Normal`

```js
export class BubbledError extends Error {
    constructor(bubble, result){
        super();
        this.bubble = bubble;
        this.result = result;
    }
}

```

- Declares: `BubbledError`
- Write: `BubbledError`

## Item 9: Stmt 6, `Normal`

```js
export function isBubbledError(error) {
    if (typeof error !== 'object' || error === null) return false;
    return error instanceof BubbledError;
}

```

- Hoisted
- Declares: `isBubbledError`
- Reads (eventual): `BubbledError`
- Write: `isBubbledError`

## Item 10: Stmt 7, `VarDeclarator(0)`

```js
const closeSpanWithError = (span, error)=>{
    if (isBubbledError(error) && error.bubble) {
        span.setAttribute('next.bubble', true);
    } else {
        if (error) {
            span.recordException(error);
        }
        span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error == null ? void 0 : error.message
        });
    }
    span.end();
};

```

- Declares: `closeSpanWithError`
- Reads: `isBubbledError`, `SpanStatusCode`
- Write: `SpanStatusCode`, `closeSpanWithError`

## Item 11: Stmt 8, `VarDeclarator(0)`

```js
const rootSpanAttributesStore = new Map();

```

- Side effects
- Declares: `rootSpanAttributesStore`
- Write: `rootSpanAttributesStore`

## Item 12: Stmt 9, `VarDeclarator(0)`

```js
const rootSpanIdKey = api.createContextKey('next.rootSpanId');

```

- Side effects
- Declares: `rootSpanIdKey`
- Reads: `api`
- Write: `api`, `rootSpanIdKey`

## Item 13: Stmt 10, `VarDeclarator(0)`

```js
let lastSpanId = 0;

```

- Declares: `lastSpanId`
- Write: `lastSpanId`

## Item 14: Stmt 11, `VarDeclarator(0)`

```js
const getSpanId = ()=>lastSpanId++;

```

- Declares: `getSpanId`
- Reads: `lastSpanId`
- Write: `getSpanId`

## Item 15: Stmt 12, `VarDeclarator(0)`

```js
const clientTraceDataSetter = {
    set (carrier, key, value) {
        carrier.push({
            key,
            value
        });
    }
};

```

- Declares: `clientTraceDataSetter`
- Write: `clientTraceDataSetter`

## Item 16: Stmt 13, `Normal`

```js
class NextTracerImpl {
    getTracerInstance() {
        return trace.getTracer('next.js', '0.0.1');
    }
    getContext() {
        return context;
    }
    getTracePropagationData() {
        const activeContext = context.active();
        const entries = [];
        propagation.inject(activeContext, entries, clientTraceDataSetter);
        return entries;
    }
    getActiveScopeSpan() {
        return trace.getSpan(context == null ? void 0 : context.active());
    }
    withPropagatedContext(carrier, fn, getter) {
        const activeContext = context.active();
        if (trace.getSpanContext(activeContext)) {
            return fn();
        }
        const remoteContext = propagation.extract(activeContext, carrier, getter);
        return context.with(remoteContext, fn);
    }
    trace(...args) {
        var _trace_getSpanContext;
        const [type, fnOrOptions, fnOrEmpty] = args;
        const { fn, options } = typeof fnOrOptions === 'function' ? {
            fn: fnOrOptions,
            options: {}
        } : {
            fn: fnOrEmpty,
            options: {
                ...fnOrOptions
            }
        };
        const spanName = options.spanName ?? type;
        if (!NextVanillaSpanAllowlist.includes(type) && process.env.NEXT_OTEL_VERBOSE !== '1' || options.hideSpan) {
            return fn();
        }
        let spanContext = this.getSpanContext((options == null ? void 0 : options.parentSpan) ?? this.getActiveScopeSpan());
        let isRootSpan = false;
        if (!spanContext) {
            spanContext = (context == null ? void 0 : context.active()) ?? ROOT_CONTEXT;
            isRootSpan = true;
        } else if ((_trace_getSpanContext = trace.getSpanContext(spanContext)) == null ? void 0 : _trace_getSpanContext.isRemote) {
            isRootSpan = true;
        }
        const spanId = getSpanId();
        options.attributes = {
            'next.span_name': spanName,
            'next.span_type': type,
            ...options.attributes
        };
        return context.with(spanContext.setValue(rootSpanIdKey, spanId), ()=>this.getTracerInstance().startActiveSpan(spanName, options, (span)=>{
                const startTime = 'performance' in globalThis && 'measure' in performance ? globalThis.performance.now() : undefined;
                const onCleanup = ()=>{
                    rootSpanAttributesStore.delete(spanId);
                    if (startTime && process.env.NEXT_OTEL_PERFORMANCE_PREFIX && LogSpanAllowList.includes(type || '')) {
                        performance.measure(`${process.env.NEXT_OTEL_PERFORMANCE_PREFIX}:next-${(type.split('.').pop() || '').replace(/[A-Z]/g, (match)=>'-' + match.toLowerCase())}`, {
                            start: startTime,
                            end: performance.now()
                        });
                    }
                };
                if (isRootSpan) {
                    rootSpanAttributesStore.set(spanId, new Map(Object.entries(options.attributes ?? {})));
                }
                try {
                    if (fn.length > 1) {
                        return fn(span, (err)=>closeSpanWithError(span, err));
                    }
                    const result = fn(span);
                    if (isPromise(result)) {
                        return result.then((res)=>{
                            span.end();
                            return res;
                        }).catch((err)=>{
                            closeSpanWithError(span, err);
                            throw err;
                        }).finally(onCleanup);
                    } else {
                        span.end();
                        onCleanup();
                    }
                    return result;
                } catch (err) {
                    closeSpanWithError(span, err);
                    onCleanup();
                    throw err;
                }
            }));
    }
    wrap(...args) {
        const tracer = this;
        const [name, options, fn] = args.length === 3 ? args : [
            args[0],
            {},
            args[1]
        ];
        if (!NextVanillaSpanAllowlist.includes(name) && process.env.NEXT_OTEL_VERBOSE !== '1') {
            return fn;
        }
        return function() {
            let optionsObj = options;
            if (typeof optionsObj === 'function' && typeof fn === 'function') {
                optionsObj = optionsObj.apply(this, arguments);
            }
            const lastArgId = arguments.length - 1;
            const cb = arguments[lastArgId];
            if (typeof cb === 'function') {
                const scopeBoundCb = tracer.getContext().bind(context.active(), cb);
                return tracer.trace(name, optionsObj, (_span, done)=>{
                    arguments[lastArgId] = function(err) {
                        done == null ? void 0 : done(err);
                        return scopeBoundCb.apply(this, arguments);
                    };
                    return fn.apply(this, arguments);
                });
            } else {
                return tracer.trace(name, optionsObj, ()=>fn.apply(this, arguments));
            }
        };
    }
    startSpan(...args) {
        const [type, options] = args;
        const spanContext = this.getSpanContext((options == null ? void 0 : options.parentSpan) ?? this.getActiveScopeSpan());
        return this.getTracerInstance().startSpan(type, options, spanContext);
    }
    getSpanContext(parentSpan) {
        const spanContext = parentSpan ? trace.setSpan(context.active(), parentSpan) : undefined;
        return spanContext;
    }
    getRootSpanAttributes() {
        const spanId = context.active().getValue(rootSpanIdKey);
        return rootSpanAttributesStore.get(spanId);
    }
}

```

- Declares: `NextTracerImpl`
- Reads: `trace`, `context`, `propagation`, `clientTraceDataSetter`, `NextVanillaSpanAllowlist`, `ROOT_CONTEXT`, `getSpanId`, `rootSpanIdKey`, `rootSpanAttributesStore`, `LogSpanAllowList`, `closeSpanWithError`, `isPromise`
- Write: `trace`, `context`, `propagation`, `NextVanillaSpanAllowlist`, `rootSpanAttributesStore`, `LogSpanAllowList`, `NextTracerImpl`

## Item 17: Stmt 14, `VarDeclarator(0)`

```js
const getTracer = (()=>{
    const tracer = new NextTracerImpl();
    return ()=>tracer;
})();

```

- Side effects
- Declares: `getTracer`
- Reads: `NextTracerImpl`
- Write: `getTracer`

# Phase 1
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item4;
    Item5;
    Item6;
    Item7;
    Item8;
    Item9;
    Item10;
    Item11;
    Item12;
    Item13;
    Item14;
    Item15;
    Item16;
    Item17;
    Item18;
    Item18["ModuleEvaluation"];
    Item19;
    Item19["export BubbledError"];
    Item20;
    Item20["export isBubbledError"];
    Item21;
    Item21["export getTracer"];
    Item22;
    Item22["export SpanStatusCode"];
    Item23;
    Item23["export SpanKind"];
```
# Phase 2
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item4;
    Item5;
    Item6;
    Item7;
    Item8;
    Item9;
    Item10;
    Item11;
    Item12;
    Item13;
    Item14;
    Item15;
    Item16;
    Item17;
    Item18;
    Item18["ModuleEvaluation"];
    Item19;
    Item19["export BubbledError"];
    Item20;
    Item20["export isBubbledError"];
    Item21;
    Item21["export getTracer"];
    Item22;
    Item22["export SpanStatusCode"];
    Item23;
    Item23["export SpanKind"];
    Item5 --> Item4;
    Item5 --> Item1;
    Item6 --> Item5;
    Item6 --> Item4;
    Item10 --> Item9;
    Item10 --> Item6;
    Item11 --> Item1;
    Item11 --> Item5;
    Item11 -.-> Item8;
    Item12 --> Item5;
    Item12 --> Item4;
    Item12 -.-> Item6;
    Item12 --> Item1;
    Item12 --> Item11;
    Item12 -.-> Item8;
    Item14 --> Item13;
    Item16 --> Item6;
    Item16 --> Item15;
    Item16 --> Item3;
    Item16 --> Item14;
    Item16 --> Item12;
    Item16 --> Item11;
    Item16 --> Item2;
    Item16 --> Item10;
    Item16 --> Item7;
    Item17 --> Item16;
    Item17 --> Item1;
    Item17 --> Item5;
    Item17 --> Item11;
    Item17 --> Item12;
    Item17 -.-> Item8;
    Item19 --> Item8;
    Item20 --> Item9;
    Item21 --> Item17;
    Item22 --> Item10;
    Item22 --> Item6;
    Item23 --> Item6;
```
# Phase 3
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item4;
    Item5;
    Item6;
    Item7;
    Item8;
    Item9;
    Item10;
    Item11;
    Item12;
    Item13;
    Item14;
    Item15;
    Item16;
    Item17;
    Item18;
    Item18["ModuleEvaluation"];
    Item19;
    Item19["export BubbledError"];
    Item20;
    Item20["export isBubbledError"];
    Item21;
    Item21["export getTracer"];
    Item22;
    Item22["export SpanStatusCode"];
    Item23;
    Item23["export SpanKind"];
    Item5 --> Item4;
    Item5 --> Item1;
    Item6 --> Item5;
    Item6 --> Item4;
    Item10 --> Item9;
    Item10 --> Item6;
    Item11 --> Item1;
    Item11 --> Item5;
    Item11 -.-> Item8;
    Item12 --> Item5;
    Item12 --> Item4;
    Item12 -.-> Item6;
    Item12 --> Item1;
    Item12 --> Item11;
    Item12 -.-> Item8;
    Item14 --> Item13;
    Item16 --> Item6;
    Item16 --> Item15;
    Item16 --> Item3;
    Item16 --> Item14;
    Item16 --> Item12;
    Item16 --> Item11;
    Item16 --> Item2;
    Item16 --> Item10;
    Item16 --> Item7;
    Item17 --> Item16;
    Item17 --> Item1;
    Item17 --> Item5;
    Item17 --> Item11;
    Item17 --> Item12;
    Item17 -.-> Item8;
    Item19 --> Item8;
    Item20 --> Item9;
    Item21 --> Item17;
    Item22 --> Item10;
    Item22 --> Item6;
    Item23 --> Item6;
    Item9 --> Item8;
```
# Phase 4
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item4;
    Item5;
    Item6;
    Item7;
    Item8;
    Item9;
    Item10;
    Item11;
    Item12;
    Item13;
    Item14;
    Item15;
    Item16;
    Item17;
    Item18;
    Item18["ModuleEvaluation"];
    Item19;
    Item19["export BubbledError"];
    Item20;
    Item20["export isBubbledError"];
    Item21;
    Item21["export getTracer"];
    Item22;
    Item22["export SpanStatusCode"];
    Item23;
    Item23["export SpanKind"];
    Item5 --> Item4;
    Item5 --> Item1;
    Item6 --> Item5;
    Item6 --> Item4;
    Item10 --> Item9;
    Item10 --> Item6;
    Item11 --> Item1;
    Item11 --> Item5;
    Item11 -.-> Item8;
    Item12 --> Item5;
    Item12 --> Item4;
    Item12 -.-> Item6;
    Item12 --> Item1;
    Item12 --> Item11;
    Item12 -.-> Item8;
    Item14 --> Item13;
    Item16 --> Item6;
    Item16 --> Item15;
    Item16 --> Item3;
    Item16 --> Item14;
    Item16 --> Item12;
    Item16 --> Item11;
    Item16 --> Item2;
    Item16 --> Item10;
    Item16 --> Item7;
    Item17 --> Item16;
    Item17 --> Item1;
    Item17 --> Item5;
    Item17 --> Item11;
    Item17 --> Item12;
    Item17 -.-> Item8;
    Item19 --> Item8;
    Item20 --> Item9;
    Item21 --> Item17;
    Item22 --> Item10;
    Item22 --> Item6;
    Item23 --> Item6;
    Item9 --> Item8;
    Item18 --> Item1;
    Item18 --> Item5;
    Item18 --> Item11;
    Item18 --> Item12;
    Item18 --> Item17;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(4, VarDeclarator(0))]"];
    N1["Items: [ItemId(0, ImportBinding(0))]"];
    N2["Items: [ItemId(0, ImportBinding(1))]"];
    N3["Items: [ItemId(12, VarDeclarator(0))]"];
    N4["Items: [ItemId(10, VarDeclarator(0))]"];
    N5["Items: [ItemId(11, VarDeclarator(0))]"];
    N6["Items: [ItemId(5, Normal)]"];
    N7["Items: [ItemId(Export((&quot;BubbledError&quot;, #2), &quot;BubbledError&quot;))]"];
    N8["Items: [ItemId(6, Normal)]"];
    N9["Items: [ItemId(Export((&quot;isBubbledError&quot;, #2), &quot;isBubbledError&quot;))]"];
    N10["Items: [ItemId(0, ImportOfModule)]"];
    N11["Items: [ItemId(1, VarDeclarator(0))]"];
    N12["Items: [ItemId(2, Normal)]"];
    N13["Items: [ItemId(8, VarDeclarator(0))]"];
    N14["Items: [ItemId(3, VarDeclarator(0))]"];
    N15["Items: [ItemId(Export((&quot;SpanKind&quot;, #2), &quot;SpanKind&quot;))]"];
    N16["Items: [ItemId(9, VarDeclarator(0))]"];
    N17["Items: [ItemId(7, VarDeclarator(0))]"];
    N18["Items: [ItemId(Export((&quot;SpanStatusCode&quot;, #2), &quot;SpanStatusCode&quot;))]"];
    N19["Items: [ItemId(13, Normal)]"];
    N20["Items: [ItemId(14, VarDeclarator(0))]"];
    N21["Items: [ItemId(ModuleEvaluation)]"];
    N22["Items: [ItemId(Export((&quot;getTracer&quot;, #2), &quot;getTracer&quot;))]"];
    N12 --> N11;
    N12 --> N10;
    N14 --> N12;
    N14 --> N11;
    N17 --> N8;
    N17 --> N14;
    N13 --> N10;
    N13 --> N12;
    N13 -.-> N6;
    N16 --> N12;
    N16 --> N11;
    N16 -.-> N14;
    N16 --> N10;
    N16 --> N13;
    N16 -.-> N6;
    N5 --> N4;
    N19 --> N14;
    N19 --> N3;
    N19 --> N2;
    N19 --> N5;
    N19 --> N16;
    N19 --> N13;
    N19 --> N1;
    N19 --> N17;
    N19 --> N0;
    N20 --> N19;
    N20 --> N10;
    N20 --> N12;
    N20 --> N13;
    N20 --> N16;
    N20 -.-> N6;
    N7 --> N6;
    N9 --> N8;
    N22 --> N20;
    N18 --> N17;
    N18 --> N14;
    N15 --> N14;
    N8 --> N6;
    N21 --> N10;
    N21 --> N12;
    N21 --> N13;
    N21 --> N16;
    N21 --> N20;
```
# Entrypoints

```
{
    Export(
        "isBubbledError",
    ): 9,
    Export(
        "SpanKind",
    ): 15,
    ModuleEvaluation: 21,
    Exports: 23,
    Export(
        "SpanStatusCode",
    ): 18,
    Export(
        "BubbledError",
    ): 7,
    Export(
        "getTracer",
    ): 22,
}
```


# Modules (dev)
## Part 0
```js
const isPromise = (p)=>{
    return p !== null && typeof p === 'object' && typeof p.then === 'function';
};
export { isPromise as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
import { LogSpanAllowList } from './constants';
export { LogSpanAllowList as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
import { NextVanillaSpanAllowlist } from './constants';
export { NextVanillaSpanAllowlist as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
const clientTraceDataSetter = {
    set (carrier, key, value) {
        carrier.push({
            key,
            value
        });
    }
};
export { clientTraceDataSetter as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
let lastSpanId = 0;
export { lastSpanId as e } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import { e as lastSpanId } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -4
};
const getSpanId = ()=>lastSpanId++;
export { getSpanId as f } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 6
```js
class BubbledError extends Error {
    constructor(bubble, result){
        super();
        this.bubble = bubble;
        this.result = result;
    }
}
export { BubbledError as g } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 7
```js
import { g as BubbledError } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -6
};
export { BubbledError };

```
## Part 8
```js
import { g as BubbledError } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -6
};
function isBubbledError(error) {
    if (typeof error !== 'object' || error === null) return false;
    return error instanceof BubbledError;
}
export { isBubbledError as h } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 9
```js
import { h as isBubbledError } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -8
};
export { isBubbledError };

```
## Part 10
```js
import './constants';

```
## Part 11
```js
let api;
export { api as i } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 12
```js
import { i as api } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
if (process.env.NEXT_RUNTIME === 'edge') {
    api = require('@opentelemetry/api');
} else {
    try {
        api = require('@opentelemetry/api');
    } catch (err) {
        api = require('next/dist/compiled/@opentelemetry/api');
    }
}

```
## Part 13
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
const rootSpanAttributesStore = new Map();
export { rootSpanAttributesStore as j } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 14
```js
import { i as api } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
const { context, propagation, trace, SpanStatusCode, SpanKind, ROOT_CONTEXT } = api;
export { context as k } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { propagation as l } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { trace as m } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { SpanStatusCode as n } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { SpanKind as o } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { ROOT_CONTEXT as p } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 15
```js
import { o as SpanKind } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
export { SpanKind };

```
## Part 16
```js
import { i as api } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
const rootSpanIdKey = api.createContextKey('next.rootSpanId');
export { rootSpanIdKey as q } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 17
```js
import { h as isBubbledError } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -8
};
import { n as SpanStatusCode } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
const closeSpanWithError = (span, error)=>{
    if (isBubbledError(error) && error.bubble) {
        span.setAttribute('next.bubble', true);
    } else {
        if (error) {
            span.recordException(error);
        }
        span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error == null ? void 0 : error.message
        });
    }
    span.end();
};
export { closeSpanWithError as r } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 18
```js
import { n as SpanStatusCode } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 17
};
export { SpanStatusCode };

```
## Part 19
```js
import { m as trace } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
import { k as context } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
import { l as propagation } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
import { d as clientTraceDataSetter } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -3
};
import { c as NextVanillaSpanAllowlist } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -2
};
import { p as ROOT_CONTEXT } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
import { f as getSpanId } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -5
};
import { q as rootSpanIdKey } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -16
};
import { j as rootSpanAttributesStore } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -13
};
import { b as LogSpanAllowList } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -1
};
import { r as closeSpanWithError } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -17
};
import { a as isPromise } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
class NextTracerImpl {
    getTracerInstance() {
        return trace.getTracer('next.js', '0.0.1');
    }
    getContext() {
        return context;
    }
    getTracePropagationData() {
        const activeContext = context.active();
        const entries = [];
        propagation.inject(activeContext, entries, clientTraceDataSetter);
        return entries;
    }
    getActiveScopeSpan() {
        return trace.getSpan(context == null ? void 0 : context.active());
    }
    withPropagatedContext(carrier, fn, getter) {
        const activeContext = context.active();
        if (trace.getSpanContext(activeContext)) {
            return fn();
        }
        const remoteContext = propagation.extract(activeContext, carrier, getter);
        return context.with(remoteContext, fn);
    }
    trace(...args) {
        var _trace_getSpanContext;
        const [type, fnOrOptions, fnOrEmpty] = args;
        const { fn, options } = typeof fnOrOptions === 'function' ? {
            fn: fnOrOptions,
            options: {}
        } : {
            fn: fnOrEmpty,
            options: {
                ...fnOrOptions
            }
        };
        const spanName = options.spanName ?? type;
        if (!NextVanillaSpanAllowlist.includes(type) && process.env.NEXT_OTEL_VERBOSE !== '1' || options.hideSpan) {
            return fn();
        }
        let spanContext = this.getSpanContext((options == null ? void 0 : options.parentSpan) ?? this.getActiveScopeSpan());
        let isRootSpan = false;
        if (!spanContext) {
            spanContext = (context == null ? void 0 : context.active()) ?? ROOT_CONTEXT;
            isRootSpan = true;
        } else if ((_trace_getSpanContext = trace.getSpanContext(spanContext)) == null ? void 0 : _trace_getSpanContext.isRemote) {
            isRootSpan = true;
        }
        const spanId = getSpanId();
        options.attributes = {
            'next.span_name': spanName,
            'next.span_type': type,
            ...options.attributes
        };
        return context.with(spanContext.setValue(rootSpanIdKey, spanId), ()=>this.getTracerInstance().startActiveSpan(spanName, options, (span)=>{
                const startTime = 'performance' in globalThis && 'measure' in performance ? globalThis.performance.now() : undefined;
                const onCleanup = ()=>{
                    rootSpanAttributesStore.delete(spanId);
                    if (startTime && process.env.NEXT_OTEL_PERFORMANCE_PREFIX && LogSpanAllowList.includes(type || '')) {
                        performance.measure(`${process.env.NEXT_OTEL_PERFORMANCE_PREFIX}:next-${(type.split('.').pop() || '').replace(/[A-Z]/g, (match)=>'-' + match.toLowerCase())}`, {
                            start: startTime,
                            end: performance.now()
                        });
                    }
                };
                if (isRootSpan) {
                    rootSpanAttributesStore.set(spanId, new Map(Object.entries(options.attributes ?? {})));
                }
                try {
                    if (fn.length > 1) {
                        return fn(span, (err)=>closeSpanWithError(span, err));
                    }
                    const result = fn(span);
                    if (isPromise(result)) {
                        return result.then((res)=>{
                            span.end();
                            return res;
                        }).catch((err)=>{
                            closeSpanWithError(span, err);
                            throw err;
                        }).finally(onCleanup);
                    } else {
                        span.end();
                        onCleanup();
                    }
                    return result;
                } catch (err) {
                    closeSpanWithError(span, err);
                    onCleanup();
                    throw err;
                }
            }));
    }
    wrap(...args) {
        const tracer = this;
        const [name, options, fn] = args.length === 3 ? args : [
            args[0],
            {},
            args[1]
        ];
        if (!NextVanillaSpanAllowlist.includes(name) && process.env.NEXT_OTEL_VERBOSE !== '1') {
            return fn;
        }
        return function() {
            let optionsObj = options;
            if (typeof optionsObj === 'function' && typeof fn === 'function') {
                optionsObj = optionsObj.apply(this, arguments);
            }
            const lastArgId = arguments.length - 1;
            const cb = arguments[lastArgId];
            if (typeof cb === 'function') {
                const scopeBoundCb = tracer.getContext().bind(context.active(), cb);
                return tracer.trace(name, optionsObj, (_span, done)=>{
                    arguments[lastArgId] = function(err) {
                        done == null ? void 0 : done(err);
                        return scopeBoundCb.apply(this, arguments);
                    };
                    return fn.apply(this, arguments);
                });
            } else {
                return tracer.trace(name, optionsObj, ()=>fn.apply(this, arguments));
            }
        };
    }
    startSpan(...args) {
        const [type, options] = args;
        const spanContext = this.getSpanContext((options == null ? void 0 : options.parentSpan) ?? this.getActiveScopeSpan());
        return this.getTracerInstance().startSpan(type, options, spanContext);
    }
    getSpanContext(parentSpan) {
        const spanContext = parentSpan ? trace.setSpan(context.active(), parentSpan) : undefined;
        return spanContext;
    }
    getRootSpanAttributes() {
        const spanId = context.active().getValue(rootSpanIdKey);
        return rootSpanAttributesStore.get(spanId);
    }
}
export { NextTracerImpl as s } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 20
```js
import { s as NextTracerImpl } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -19
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
const getTracer = (()=>{
    const tracer = new NextTracerImpl();
    return ()=>tracer;
})();
export { getTracer as t } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 21
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
"module evaluation";

```
## Part 22
```js
import { t as getTracer } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -20
};
export { getTracer };

```
## Part 23
```js
export { BubbledError } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export BubbledError"
};
export { isBubbledError } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export isBubbledError"
};
export { SpanKind } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export SpanKind"
};
export { SpanStatusCode } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export SpanStatusCode"
};
export { getTracer } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export getTracer"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
"module evaluation";

```
# Entrypoints

```
{
    Export(
        "isBubbledError",
    ): 9,
    Export(
        "SpanKind",
    ): 16,
    ModuleEvaluation: 22,
    Exports: 23,
    Export(
        "SpanStatusCode",
    ): 18,
    Export(
        "BubbledError",
    ): 7,
    Export(
        "getTracer",
    ): 21,
}
```


# Modules (prod)
## Part 0
```js
const isPromise = (p)=>{
    return p !== null && typeof p === 'object' && typeof p.then === 'function';
};
export { isPromise as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
import { LogSpanAllowList } from './constants';
export { LogSpanAllowList as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
import { NextVanillaSpanAllowlist } from './constants';
export { NextVanillaSpanAllowlist as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
const clientTraceDataSetter = {
    set (carrier, key, value) {
        carrier.push({
            key,
            value
        });
    }
};
export { clientTraceDataSetter as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
let lastSpanId = 0;
export { lastSpanId as e } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import { e as lastSpanId } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -4
};
const getSpanId = ()=>lastSpanId++;
export { getSpanId as f } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 6
```js
class BubbledError extends Error {
    constructor(bubble, result){
        super();
        this.bubble = bubble;
        this.result = result;
    }
}
export { BubbledError as g } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 7
```js
import { g as BubbledError } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -6
};
export { BubbledError };

```
## Part 8
```js
import { g as BubbledError } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -6
};
function isBubbledError(error) {
    if (typeof error !== 'object' || error === null) return false;
    return error instanceof BubbledError;
}
export { isBubbledError as h } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 9
```js
import { h as isBubbledError } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -8
};
export { isBubbledError };

```
## Part 10
```js
import './constants';

```
## Part 11
```js
let api;
export { api as i } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 12
```js
import { i as api } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
if (process.env.NEXT_RUNTIME === 'edge') {
    api = require('@opentelemetry/api');
} else {
    try {
        api = require('@opentelemetry/api');
    } catch (err) {
        api = require('next/dist/compiled/@opentelemetry/api');
    }
}

```
## Part 13
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
const rootSpanAttributesStore = new Map();
export { rootSpanAttributesStore as j } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 14
```js
import { i as api } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
const rootSpanIdKey = api.createContextKey('next.rootSpanId');
export { rootSpanIdKey as k } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 15
```js
import { i as api } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
const { context, propagation, trace, SpanStatusCode, SpanKind, ROOT_CONTEXT } = api;
export { context as l } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { propagation as m } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { trace as n } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { SpanStatusCode as o } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { SpanKind as p } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { ROOT_CONTEXT as q } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 16
```js
import { p as SpanKind } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -15
};
export { SpanKind };

```
## Part 17
```js
import { h as isBubbledError } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -8
};
import { o as SpanStatusCode } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -15
};
const closeSpanWithError = (span, error)=>{
    if (isBubbledError(error) && error.bubble) {
        span.setAttribute('next.bubble', true);
    } else {
        if (error) {
            span.recordException(error);
        }
        span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error == null ? void 0 : error.message
        });
    }
    span.end();
};
export { closeSpanWithError as r } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 18
```js
import { o as SpanStatusCode } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -15
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 17
};
export { SpanStatusCode };

```
## Part 19
```js
import { n as trace } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -15
};
import { l as context } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -15
};
import { m as propagation } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -15
};
import { d as clientTraceDataSetter } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -3
};
import { c as NextVanillaSpanAllowlist } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -2
};
import { q as ROOT_CONTEXT } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -15
};
import { f as getSpanId } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -5
};
import { k as rootSpanIdKey } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
import { j as rootSpanAttributesStore } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -13
};
import { b as LogSpanAllowList } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -1
};
import { r as closeSpanWithError } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -17
};
import { a as isPromise } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
class NextTracerImpl {
    getTracerInstance() {
        return trace.getTracer('next.js', '0.0.1');
    }
    getContext() {
        return context;
    }
    getTracePropagationData() {
        const activeContext = context.active();
        const entries = [];
        propagation.inject(activeContext, entries, clientTraceDataSetter);
        return entries;
    }
    getActiveScopeSpan() {
        return trace.getSpan(context == null ? void 0 : context.active());
    }
    withPropagatedContext(carrier, fn, getter) {
        const activeContext = context.active();
        if (trace.getSpanContext(activeContext)) {
            return fn();
        }
        const remoteContext = propagation.extract(activeContext, carrier, getter);
        return context.with(remoteContext, fn);
    }
    trace(...args) {
        var _trace_getSpanContext;
        const [type, fnOrOptions, fnOrEmpty] = args;
        const { fn, options } = typeof fnOrOptions === 'function' ? {
            fn: fnOrOptions,
            options: {}
        } : {
            fn: fnOrEmpty,
            options: {
                ...fnOrOptions
            }
        };
        const spanName = options.spanName ?? type;
        if (!NextVanillaSpanAllowlist.includes(type) && process.env.NEXT_OTEL_VERBOSE !== '1' || options.hideSpan) {
            return fn();
        }
        let spanContext = this.getSpanContext((options == null ? void 0 : options.parentSpan) ?? this.getActiveScopeSpan());
        let isRootSpan = false;
        if (!spanContext) {
            spanContext = (context == null ? void 0 : context.active()) ?? ROOT_CONTEXT;
            isRootSpan = true;
        } else if ((_trace_getSpanContext = trace.getSpanContext(spanContext)) == null ? void 0 : _trace_getSpanContext.isRemote) {
            isRootSpan = true;
        }
        const spanId = getSpanId();
        options.attributes = {
            'next.span_name': spanName,
            'next.span_type': type,
            ...options.attributes
        };
        return context.with(spanContext.setValue(rootSpanIdKey, spanId), ()=>this.getTracerInstance().startActiveSpan(spanName, options, (span)=>{
                const startTime = 'performance' in globalThis && 'measure' in performance ? globalThis.performance.now() : undefined;
                const onCleanup = ()=>{
                    rootSpanAttributesStore.delete(spanId);
                    if (startTime && process.env.NEXT_OTEL_PERFORMANCE_PREFIX && LogSpanAllowList.includes(type || '')) {
                        performance.measure(`${process.env.NEXT_OTEL_PERFORMANCE_PREFIX}:next-${(type.split('.').pop() || '').replace(/[A-Z]/g, (match)=>'-' + match.toLowerCase())}`, {
                            start: startTime,
                            end: performance.now()
                        });
                    }
                };
                if (isRootSpan) {
                    rootSpanAttributesStore.set(spanId, new Map(Object.entries(options.attributes ?? {})));
                }
                try {
                    if (fn.length > 1) {
                        return fn(span, (err)=>closeSpanWithError(span, err));
                    }
                    const result = fn(span);
                    if (isPromise(result)) {
                        return result.then((res)=>{
                            span.end();
                            return res;
                        }).catch((err)=>{
                            closeSpanWithError(span, err);
                            throw err;
                        }).finally(onCleanup);
                    } else {
                        span.end();
                        onCleanup();
                    }
                    return result;
                } catch (err) {
                    closeSpanWithError(span, err);
                    onCleanup();
                    throw err;
                }
            }));
    }
    wrap(...args) {
        const tracer = this;
        const [name, options, fn] = args.length === 3 ? args : [
            args[0],
            {},
            args[1]
        ];
        if (!NextVanillaSpanAllowlist.includes(name) && process.env.NEXT_OTEL_VERBOSE !== '1') {
            return fn;
        }
        return function() {
            let optionsObj = options;
            if (typeof optionsObj === 'function' && typeof fn === 'function') {
                optionsObj = optionsObj.apply(this, arguments);
            }
            const lastArgId = arguments.length - 1;
            const cb = arguments[lastArgId];
            if (typeof cb === 'function') {
                const scopeBoundCb = tracer.getContext().bind(context.active(), cb);
                return tracer.trace(name, optionsObj, (_span, done)=>{
                    arguments[lastArgId] = function(err) {
                        done == null ? void 0 : done(err);
                        return scopeBoundCb.apply(this, arguments);
                    };
                    return fn.apply(this, arguments);
                });
            } else {
                return tracer.trace(name, optionsObj, ()=>fn.apply(this, arguments));
            }
        };
    }
    startSpan(...args) {
        const [type, options] = args;
        const spanContext = this.getSpanContext((options == null ? void 0 : options.parentSpan) ?? this.getActiveScopeSpan());
        return this.getTracerInstance().startSpan(type, options, spanContext);
    }
    getSpanContext(parentSpan) {
        const spanContext = parentSpan ? trace.setSpan(context.active(), parentSpan) : undefined;
        return spanContext;
    }
    getRootSpanAttributes() {
        const spanId = context.active().getValue(rootSpanIdKey);
        return rootSpanAttributesStore.get(spanId);
    }
}
export { NextTracerImpl as s } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 20
```js
import { s as NextTracerImpl } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -19
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
const getTracer = (()=>{
    const tracer = new NextTracerImpl();
    return ()=>tracer;
})();
export { getTracer as t } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 21
```js
import { t as getTracer } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -20
};
export { getTracer };

```
## Part 22
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
"module evaluation";

```
## Part 23
```js
export { BubbledError } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export BubbledError"
};
export { isBubbledError } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export isBubbledError"
};
export { SpanKind } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export SpanKind"
};
export { SpanStatusCode } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export SpanStatusCode"
};
export { getTracer } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export getTracer"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
"module evaluation";

```
