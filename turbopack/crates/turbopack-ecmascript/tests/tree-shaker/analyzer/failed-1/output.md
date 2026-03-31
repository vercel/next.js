# Items

Count: 9

## Item 1: Stmt 0, `VarDeclarator(0)`

```js
let source;

```

- Declares: `source`
- Write: `source`

## Item 2: Stmt 1, `VarDeclarator(0)`

```js
const messageCallbacks = [];

```

- Declares: `messageCallbacks`
- Write: `messageCallbacks`

## Item 3: Stmt 2, `Normal`

```js
function getSocketProtocol(assetPrefix) {
    let protocol = location.protocol;
    try {
        protocol = new URL(assetPrefix).protocol;
    } catch (_) {}
    return protocol === "http:" ? "ws" : "wss";
}

```

- Hoisted
- Declares: `getSocketProtocol`
- Write: `getSocketProtocol`

## Item 4: Stmt 3, `Normal`

```js
export function addMessageListener(cb) {
    messageCallbacks.push(cb);
}

```

- Hoisted
- Declares: `addMessageListener`
- Reads (eventual): `messageCallbacks`
- Write: `addMessageListener`
- Write (eventual): `messageCallbacks`

## Item 5: Stmt 4, `Normal`

```js
export function sendMessage(data) {
    if (!source || source.readyState !== source.OPEN) return;
    return source.send(data);
}

```

- Hoisted
- Declares: `sendMessage`
- Reads (eventual): `source`
- Write: `sendMessage`
- Write (eventual): `source`

## Item 6: Stmt 5, `Normal`

```js
export function connectHMR(options) {
    const { timeout = 5 * 1000 } = options;
    function init() {
        if (source) source.close();
        console.log("[HMR] connecting...");
        function handleOnline() {
            const connected = {
                type: "turbopack-connected"
            };
            messageCallbacks.forEach((cb)=>{
                cb(connected);
            });
            if (options.log) console.log("[HMR] connected");
        }
        function handleMessage(event) {
            const message = {
                type: "turbopack-message",
                data: JSON.parse(event.data)
            };
            messageCallbacks.forEach((cb)=>{
                cb(message);
            });
        }
        function handleDisconnect() {
            source.close();
            setTimeout(init, timeout);
        }
        const { hostname, port } = location;
        const protocol = getSocketProtocol(options.assetPrefix || "");
        const assetPrefix = options.assetPrefix.replace(/^\/+/, "");
        let url = `${protocol}://${hostname}:${port}${assetPrefix ? `/${assetPrefix}` : ""}`;
        if (assetPrefix.startsWith("http")) {
            url = `${protocol}://${assetPrefix.split("://")[1]}`;
        }
        source = new window.WebSocket(`${url}${options.path}`);
        source.onopen = handleOnline;
        source.onerror = handleDisconnect;
        source.onmessage = handleMessage;
    }
    init();
}

```

- Hoisted
- Declares: `connectHMR`
- Reads (eventual): `source`, `messageCallbacks`, `getSocketProtocol`
- Write: `connectHMR`
- Write (eventual): `source`, `messageCallbacks`

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
    Item7["export addMessageListener"];
    Item8;
    Item8["export sendMessage"];
    Item9;
    Item9["export connectHMR"];
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
    Item7["export addMessageListener"];
    Item8;
    Item8["export sendMessage"];
    Item9;
    Item9["export connectHMR"];
    Item7 --> Item4;
    Item8 --> Item5;
    Item9 --> Item6;
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
    Item7["export addMessageListener"];
    Item8;
    Item8["export sendMessage"];
    Item9;
    Item9["export connectHMR"];
    Item7 --> Item4;
    Item8 --> Item5;
    Item9 --> Item6;
    Item4 --> Item2;
    Item5 --> Item1;
    Item6 --> Item1;
    Item6 --> Item2;
    Item6 --> Item3;
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
    Item7["export addMessageListener"];
    Item8;
    Item8["export sendMessage"];
    Item9;
    Item9["export connectHMR"];
    Item7 --> Item4;
    Item8 --> Item5;
    Item9 --> Item6;
    Item4 --> Item2;
    Item5 --> Item1;
    Item6 --> Item1;
    Item6 --> Item2;
    Item6 --> Item3;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(0, VarDeclarator(0))]"];
    N1["Items: [ItemId(1, VarDeclarator(0))]"];
    N2["Items: [ItemId(2, Normal), ItemId(5, Normal), ItemId(Export((&quot;connectHMR&quot;, #2), &quot;connectHMR&quot;))]"];
    N3["Items: [ItemId(3, Normal), ItemId(Export((&quot;addMessageListener&quot;, #2), &quot;addMessageListener&quot;))]"];
    N4["Items: [ItemId(4, Normal), ItemId(Export((&quot;sendMessage&quot;, #2), &quot;sendMessage&quot;))]"];
    N4 --> N0;
    N2 --> N1;
    N2 --> N0;
    N3 --> N1;
```
# Entrypoints

```
{
    ModuleEvaluation: 6,
    Export(
        "addMessageListener",
    ): 3,
    Export(
        "connectHMR",
    ): 2,
    Export(
        "sendMessage",
    ): 4,
    Exports: 5,
}
```


# Modules (dev)
## Part 0
```js
let source;
export { source as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
const messageCallbacks = [];
export { messageCallbacks as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
import { b as messageCallbacks } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -1
};
import { a as source } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
function getSocketProtocol(assetPrefix) {
    let protocol = location.protocol;
    try {
        protocol = new URL(assetPrefix).protocol;
    } catch (_) {}
    return protocol === "http:" ? "ws" : "wss";
}
function connectHMR(options) {
    const { timeout = 5 * 1000 } = options;
    function init() {
        if (source) source.close();
        console.log("[HMR] connecting...");
        function handleOnline() {
            const connected = {
                type: "turbopack-connected"
            };
            messageCallbacks.forEach((cb)=>{
                cb(connected);
            });
            if (options.log) console.log("[HMR] connected");
        }
        function handleMessage(event) {
            const message = {
                type: "turbopack-message",
                data: JSON.parse(event.data)
            };
            messageCallbacks.forEach((cb)=>{
                cb(message);
            });
        }
        function handleDisconnect() {
            source.close();
            setTimeout(init, timeout);
        }
        const { hostname, port } = location;
        const protocol = getSocketProtocol(options.assetPrefix || "");
        const assetPrefix = options.assetPrefix.replace(/^\/+/, "");
        let url = `${protocol}://${hostname}:${port}${assetPrefix ? `/${assetPrefix}` : ""}`;
        if (assetPrefix.startsWith("http")) {
            url = `${protocol}://${assetPrefix.split("://")[1]}`;
        }
        source = new window.WebSocket(`${url}${options.path}`);
        source.onopen = handleOnline;
        source.onerror = handleDisconnect;
        source.onmessage = handleMessage;
    }
    init();
}
export { connectHMR };
export { getSocketProtocol as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { connectHMR as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
import { b as messageCallbacks } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -1
};
function addMessageListener(cb) {
    messageCallbacks.push(cb);
}
export { addMessageListener };
export { addMessageListener as e } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
import { a as source } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
function sendMessage(data) {
    if (!source || source.readyState !== source.OPEN) return;
    return source.send(data);
}
export { sendMessage };
export { sendMessage as f } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
export { connectHMR } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export connectHMR"
};
export { addMessageListener } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export addMessageListener"
};
export { sendMessage } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export sendMessage"
};

```
## Part 6
```js
export { };

```
## Merged (module eval)
```js
export { };

```
# Entrypoints

```
{
    ModuleEvaluation: 6,
    Export(
        "addMessageListener",
    ): 3,
    Export(
        "connectHMR",
    ): 2,
    Export(
        "sendMessage",
    ): 4,
    Exports: 5,
}
```


# Modules (prod)
## Part 0
```js
let source;
export { source as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
const messageCallbacks = [];
export { messageCallbacks as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
import { b as messageCallbacks } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -1
};
import { a as source } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
function getSocketProtocol(assetPrefix) {
    let protocol = location.protocol;
    try {
        protocol = new URL(assetPrefix).protocol;
    } catch (_) {}
    return protocol === "http:" ? "ws" : "wss";
}
function connectHMR(options) {
    const { timeout = 5 * 1000 } = options;
    function init() {
        if (source) source.close();
        console.log("[HMR] connecting...");
        function handleOnline() {
            const connected = {
                type: "turbopack-connected"
            };
            messageCallbacks.forEach((cb)=>{
                cb(connected);
            });
            if (options.log) console.log("[HMR] connected");
        }
        function handleMessage(event) {
            const message = {
                type: "turbopack-message",
                data: JSON.parse(event.data)
            };
            messageCallbacks.forEach((cb)=>{
                cb(message);
            });
        }
        function handleDisconnect() {
            source.close();
            setTimeout(init, timeout);
        }
        const { hostname, port } = location;
        const protocol = getSocketProtocol(options.assetPrefix || "");
        const assetPrefix = options.assetPrefix.replace(/^\/+/, "");
        let url = `${protocol}://${hostname}:${port}${assetPrefix ? `/${assetPrefix}` : ""}`;
        if (assetPrefix.startsWith("http")) {
            url = `${protocol}://${assetPrefix.split("://")[1]}`;
        }
        source = new window.WebSocket(`${url}${options.path}`);
        source.onopen = handleOnline;
        source.onerror = handleDisconnect;
        source.onmessage = handleMessage;
    }
    init();
}
export { connectHMR };
export { getSocketProtocol as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { connectHMR as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
import { b as messageCallbacks } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -1
};
function addMessageListener(cb) {
    messageCallbacks.push(cb);
}
export { addMessageListener };
export { addMessageListener as e } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
import { a as source } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
function sendMessage(data) {
    if (!source || source.readyState !== source.OPEN) return;
    return source.send(data);
}
export { sendMessage };
export { sendMessage as f } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
export { connectHMR } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export connectHMR"
};
export { addMessageListener } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export addMessageListener"
};
export { sendMessage } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export sendMessage"
};

```
## Part 6
```js
export { };

```
## Merged (module eval)
```js
export { };

```
