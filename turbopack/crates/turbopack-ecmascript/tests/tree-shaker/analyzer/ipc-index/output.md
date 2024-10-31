# Items

Count: 31

## Item 1: Stmt 0, `ImportOfModule`

```js
import { createConnection } from "node:net";

```

- Hoisted
- Side effects

## Item 2: Stmt 0, `ImportBinding(0)`

```js
import { createConnection } from "node:net";

```

- Hoisted
- Declares: `createConnection`

## Item 3: Stmt 1, `ImportOfModule`

```js
import { parse as parseStackTrace } from "../compiled/stacktrace-parser";

```

- Hoisted
- Side effects

## Item 4: Stmt 1, `ImportBinding(0)`

```js
import { parse as parseStackTrace } from "../compiled/stacktrace-parser";

```

- Hoisted
- Declares: `parseStackTrace`

## Item 5: Stmt 2, `ImportOfModule`

```js
import { getProperError } from "./error";

```

- Hoisted
- Side effects

## Item 6: Stmt 2, `ImportBinding(0)`

```js
import { getProperError } from "./error";

```

- Hoisted
- Declares: `getProperError`

## Item 7: Stmt 3, `Normal`

```js
export function structuredError(e) {
    e = getProperError(e);
    return {
        name: e.name,
        message: e.message,
        stack: typeof e.stack === "string" ? parseStackTrace(e.stack) : []
    };
}

```

- Hoisted
- Declares: `structuredError`
- Reads (eventual): `getProperError`, `parseStackTrace`
- Write: `structuredError`

## Item 8: Stmt 4, `Normal`

```js
function createIpc(port) {
    const socket = createConnection(port, "127.0.0.1");
    const packetQueue = [];
    const recvPromiseResolveQueue = [];
    function pushPacket(packet) {
        const recvPromiseResolve = recvPromiseResolveQueue.shift();
        if (recvPromiseResolve != null) {
            recvPromiseResolve(JSON.parse(packet.toString("utf8")));
        } else {
            packetQueue.push(packet);
        }
    }
    let state = {
        type: "waiting"
    };
    let buffer = Buffer.alloc(0);
    socket.once("connect", ()=>{
        socket.on("data", (chunk)=>{
            buffer = Buffer.concat([
                buffer,
                chunk
            ]);
            loop: while(true){
                switch(state.type){
                    case "waiting":
                        {
                            if (buffer.length >= 4) {
                                const length = buffer.readUInt32BE(0);
                                buffer = buffer.subarray(4);
                                state = {
                                    type: "packet",
                                    length
                                };
                            } else {
                                break loop;
                            }
                            break;
                        }
                    case "packet":
                        {
                            if (buffer.length >= state.length) {
                                const packet = buffer.subarray(0, state.length);
                                buffer = buffer.subarray(state.length);
                                state = {
                                    type: "waiting"
                                };
                                pushPacket(packet);
                            } else {
                                break loop;
                            }
                            break;
                        }
                }
            }
        });
    });
    socket.once("close", ()=>{
        process.exit(0);
    });
    function send(message) {
        const packet = Buffer.from(JSON.stringify(message), "utf8");
        const length = Buffer.alloc(4);
        length.writeUInt32BE(packet.length);
        socket.write(length);
        return new Promise((resolve, reject)=>{
            socket.write(packet, (err)=>{
                process.stderr.write(`TURBOPACK_OUTPUT_D\n`);
                process.stdout.write(`TURBOPACK_OUTPUT_D\n`);
                if (err != null) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }
    function sendReady() {
        const length = Buffer.from([
            0,
            0,
            0,
            0
        ]);
        return new Promise((resolve, reject)=>{
            socket.write(length, (err)=>{
                process.stderr.write(`TURBOPACK_OUTPUT_D\n`);
                process.stdout.write(`TURBOPACK_OUTPUT_D\n`);
                if (err != null) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }
    return {
        async recv () {
            const packet = packetQueue.shift();
            if (packet != null) {
                return JSON.parse(packet.toString("utf8"));
            }
            const result = await new Promise((resolve)=>{
                recvPromiseResolveQueue.push((result)=>{
                    resolve(result);
                });
            });
            return result;
        },
        send (message) {
            return send(message);
        },
        sendReady,
        async sendError (error) {
            try {
                await send({
                    type: "error",
                    ...structuredError(error)
                });
            } catch (err) {
                console.error("failed to send error back to rust:", err);
                process.exit(1);
            }
            process.exit(0);
        }
    };
}

```

- Hoisted
- Declares: `createIpc`
- Reads (eventual): `createConnection`, `loop`, `structuredError`
- Write: `createIpc`

## Item 9: Stmt 5, `VarDeclarator(0)`

```js
const PORT = process.argv[2];

```

- Side effects
- Declares: `PORT`
- Write: `PORT`

## Item 10: Stmt 6, `VarDeclarator(0)`

```js
export const IPC = createIpc(parseInt(PORT, 10));

```

- Side effects
- Declares: `IPC`
- Reads: `createIpc`, `PORT`
- Write: `IPC`

## Item 11: Stmt 7, `Normal`

```js
process.on("uncaughtException", (err)=>{
    IPC.sendError(err);
});

```

- Side effects
- Reads: `IPC`
- Write: `IPC`

## Item 12: Stmt 8, `VarDeclarator(0)`

```js
const improveConsole = (name, stream, addStack)=>{
    const original = console[name];
    const stdio = process[stream];
    console[name] = (...args)=>{
        stdio.write(`TURBOPACK_OUTPUT_B\n`);
        original(...args);
        if (addStack) {
            const stack = new Error().stack?.replace(/^.+\n.+\n/, "") + "\n";
            stdio.write("TURBOPACK_OUTPUT_S\n");
            stdio.write(stack);
        }
        stdio.write("TURBOPACK_OUTPUT_E\n");
    };
};

```

- Side effects
- Declares: `improveConsole`
- Write: `improveConsole`

## Item 13: Stmt 9, `Normal`

```js
improveConsole("error", "stderr", true);

```

- Side effects
- Reads: `improveConsole`

## Item 14: Stmt 10, `Normal`

```js
improveConsole("warn", "stderr", true);

```

- Side effects
- Reads: `improveConsole`

## Item 15: Stmt 11, `Normal`

```js
improveConsole("count", "stdout", true);

```

- Side effects
- Reads: `improveConsole`

## Item 16: Stmt 12, `Normal`

```js
improveConsole("trace", "stderr", false);

```

- Side effects
- Reads: `improveConsole`

## Item 17: Stmt 13, `Normal`

```js
improveConsole("log", "stdout", true);

```

- Side effects
- Reads: `improveConsole`

## Item 18: Stmt 14, `Normal`

```js
improveConsole("group", "stdout", true);

```

- Side effects
- Reads: `improveConsole`

## Item 19: Stmt 15, `Normal`

```js
improveConsole("groupCollapsed", "stdout", true);

```

- Side effects
- Reads: `improveConsole`

## Item 20: Stmt 16, `Normal`

```js
improveConsole("table", "stdout", true);

```

- Side effects
- Reads: `improveConsole`

## Item 21: Stmt 17, `Normal`

```js
improveConsole("debug", "stdout", true);

```

- Side effects
- Reads: `improveConsole`

## Item 22: Stmt 18, `Normal`

```js
improveConsole("info", "stdout", true);

```

- Side effects
- Reads: `improveConsole`

## Item 23: Stmt 19, `Normal`

```js
improveConsole("dir", "stdout", true);

```

- Side effects
- Reads: `improveConsole`

## Item 24: Stmt 20, `Normal`

```js
improveConsole("dirxml", "stdout", true);

```

- Side effects
- Reads: `improveConsole`

## Item 25: Stmt 21, `Normal`

```js
improveConsole("timeEnd", "stdout", true);

```

- Side effects
- Reads: `improveConsole`

## Item 26: Stmt 22, `Normal`

```js
improveConsole("timeLog", "stdout", true);

```

- Side effects
- Reads: `improveConsole`

## Item 27: Stmt 23, `Normal`

```js
improveConsole("timeStamp", "stdout", true);

```

- Side effects
- Reads: `improveConsole`

## Item 28: Stmt 24, `Normal`

```js
improveConsole("assert", "stderr", true);

```

- Side effects
- Reads: `improveConsole`

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
    Item19;
    Item20;
    Item21;
    Item22;
    Item23;
    Item24;
    Item25;
    Item26;
    Item27;
    Item28;
    Item29;
    Item29["ModuleEvaluation"];
    Item30;
    Item30["export structuredError"];
    Item31;
    Item31["export IPC"];
    Item2 --> Item1;
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
    Item19;
    Item20;
    Item21;
    Item22;
    Item23;
    Item24;
    Item25;
    Item26;
    Item27;
    Item28;
    Item29;
    Item29["ModuleEvaluation"];
    Item30;
    Item30["export structuredError"];
    Item31;
    Item31["export IPC"];
    Item2 --> Item1;
    Item3 --> Item2;
    Item9 --> Item3;
    Item9 -.-> Item6;
    Item9 -.-> Item5;
    Item9 -.-> Item4;
    Item9 -.-> Item7;
    Item10 --> Item8;
    Item10 --> Item9;
    Item10 -.-> Item6;
    Item10 -.-> Item5;
    Item10 -.-> Item4;
    Item10 -.-> Item7;
    Item11 --> Item10;
    Item11 -.-> Item6;
    Item11 -.-> Item5;
    Item11 -.-> Item4;
    Item11 -.-> Item7;
    Item12 --> Item11;
    Item12 -.-> Item6;
    Item12 -.-> Item5;
    Item12 -.-> Item4;
    Item12 -.-> Item7;
    Item13 --> Item12;
    Item13 -.-> Item6;
    Item13 -.-> Item5;
    Item13 -.-> Item4;
    Item13 -.-> Item7;
    Item14 --> Item12;
    Item14 --> Item13;
    Item14 -.-> Item6;
    Item14 -.-> Item5;
    Item14 -.-> Item4;
    Item14 -.-> Item7;
    Item15 --> Item12;
    Item15 --> Item14;
    Item15 -.-> Item6;
    Item15 -.-> Item5;
    Item15 -.-> Item4;
    Item15 -.-> Item7;
    Item16 --> Item12;
    Item16 --> Item15;
    Item16 -.-> Item6;
    Item16 -.-> Item5;
    Item16 -.-> Item4;
    Item16 -.-> Item7;
    Item17 --> Item12;
    Item17 --> Item16;
    Item17 -.-> Item6;
    Item17 -.-> Item5;
    Item17 -.-> Item4;
    Item17 -.-> Item7;
    Item18 --> Item12;
    Item18 --> Item17;
    Item18 -.-> Item6;
    Item18 -.-> Item5;
    Item18 -.-> Item4;
    Item18 -.-> Item7;
    Item19 --> Item12;
    Item19 --> Item18;
    Item19 -.-> Item6;
    Item19 -.-> Item5;
    Item19 -.-> Item4;
    Item19 -.-> Item7;
    Item20 --> Item12;
    Item20 --> Item19;
    Item20 -.-> Item6;
    Item20 -.-> Item5;
    Item20 -.-> Item4;
    Item20 -.-> Item7;
    Item21 --> Item12;
    Item21 --> Item20;
    Item21 -.-> Item6;
    Item21 -.-> Item5;
    Item21 -.-> Item4;
    Item21 -.-> Item7;
    Item22 --> Item12;
    Item22 --> Item21;
    Item22 -.-> Item6;
    Item22 -.-> Item5;
    Item22 -.-> Item4;
    Item22 -.-> Item7;
    Item23 --> Item12;
    Item23 --> Item22;
    Item23 -.-> Item6;
    Item23 -.-> Item5;
    Item23 -.-> Item4;
    Item23 -.-> Item7;
    Item24 --> Item12;
    Item24 --> Item23;
    Item24 -.-> Item6;
    Item24 -.-> Item5;
    Item24 -.-> Item4;
    Item24 -.-> Item7;
    Item25 --> Item12;
    Item25 --> Item24;
    Item25 -.-> Item6;
    Item25 -.-> Item5;
    Item25 -.-> Item4;
    Item25 -.-> Item7;
    Item26 --> Item12;
    Item26 --> Item25;
    Item26 -.-> Item6;
    Item26 -.-> Item5;
    Item26 -.-> Item4;
    Item26 -.-> Item7;
    Item27 --> Item12;
    Item27 --> Item26;
    Item27 -.-> Item6;
    Item27 -.-> Item5;
    Item27 -.-> Item4;
    Item27 -.-> Item7;
    Item28 --> Item12;
    Item28 --> Item27;
    Item28 -.-> Item6;
    Item28 -.-> Item5;
    Item28 -.-> Item4;
    Item28 -.-> Item7;
    Item30 --> Item7;
    Item31 --> Item11;
    Item31 --> Item10;
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
    Item19;
    Item20;
    Item21;
    Item22;
    Item23;
    Item24;
    Item25;
    Item26;
    Item27;
    Item28;
    Item29;
    Item29["ModuleEvaluation"];
    Item30;
    Item30["export structuredError"];
    Item31;
    Item31["export IPC"];
    Item2 --> Item1;
    Item3 --> Item2;
    Item9 --> Item3;
    Item9 -.-> Item6;
    Item9 -.-> Item5;
    Item9 -.-> Item4;
    Item9 -.-> Item7;
    Item10 --> Item8;
    Item10 --> Item9;
    Item10 -.-> Item6;
    Item10 -.-> Item5;
    Item10 -.-> Item4;
    Item10 -.-> Item7;
    Item11 --> Item10;
    Item11 -.-> Item6;
    Item11 -.-> Item5;
    Item11 -.-> Item4;
    Item11 -.-> Item7;
    Item12 --> Item11;
    Item12 -.-> Item6;
    Item12 -.-> Item5;
    Item12 -.-> Item4;
    Item12 -.-> Item7;
    Item13 --> Item12;
    Item13 -.-> Item6;
    Item13 -.-> Item5;
    Item13 -.-> Item4;
    Item13 -.-> Item7;
    Item14 --> Item12;
    Item14 --> Item13;
    Item14 -.-> Item6;
    Item14 -.-> Item5;
    Item14 -.-> Item4;
    Item14 -.-> Item7;
    Item15 --> Item12;
    Item15 --> Item14;
    Item15 -.-> Item6;
    Item15 -.-> Item5;
    Item15 -.-> Item4;
    Item15 -.-> Item7;
    Item16 --> Item12;
    Item16 --> Item15;
    Item16 -.-> Item6;
    Item16 -.-> Item5;
    Item16 -.-> Item4;
    Item16 -.-> Item7;
    Item17 --> Item12;
    Item17 --> Item16;
    Item17 -.-> Item6;
    Item17 -.-> Item5;
    Item17 -.-> Item4;
    Item17 -.-> Item7;
    Item18 --> Item12;
    Item18 --> Item17;
    Item18 -.-> Item6;
    Item18 -.-> Item5;
    Item18 -.-> Item4;
    Item18 -.-> Item7;
    Item19 --> Item12;
    Item19 --> Item18;
    Item19 -.-> Item6;
    Item19 -.-> Item5;
    Item19 -.-> Item4;
    Item19 -.-> Item7;
    Item20 --> Item12;
    Item20 --> Item19;
    Item20 -.-> Item6;
    Item20 -.-> Item5;
    Item20 -.-> Item4;
    Item20 -.-> Item7;
    Item21 --> Item12;
    Item21 --> Item20;
    Item21 -.-> Item6;
    Item21 -.-> Item5;
    Item21 -.-> Item4;
    Item21 -.-> Item7;
    Item22 --> Item12;
    Item22 --> Item21;
    Item22 -.-> Item6;
    Item22 -.-> Item5;
    Item22 -.-> Item4;
    Item22 -.-> Item7;
    Item23 --> Item12;
    Item23 --> Item22;
    Item23 -.-> Item6;
    Item23 -.-> Item5;
    Item23 -.-> Item4;
    Item23 -.-> Item7;
    Item24 --> Item12;
    Item24 --> Item23;
    Item24 -.-> Item6;
    Item24 -.-> Item5;
    Item24 -.-> Item4;
    Item24 -.-> Item7;
    Item25 --> Item12;
    Item25 --> Item24;
    Item25 -.-> Item6;
    Item25 -.-> Item5;
    Item25 -.-> Item4;
    Item25 -.-> Item7;
    Item26 --> Item12;
    Item26 --> Item25;
    Item26 -.-> Item6;
    Item26 -.-> Item5;
    Item26 -.-> Item4;
    Item26 -.-> Item7;
    Item27 --> Item12;
    Item27 --> Item26;
    Item27 -.-> Item6;
    Item27 -.-> Item5;
    Item27 -.-> Item4;
    Item27 -.-> Item7;
    Item28 --> Item12;
    Item28 --> Item27;
    Item28 -.-> Item6;
    Item28 -.-> Item5;
    Item28 -.-> Item4;
    Item28 -.-> Item7;
    Item30 --> Item7;
    Item31 --> Item11;
    Item31 --> Item10;
    Item7 --> Item6;
    Item7 --> Item5;
    Item8 --> Item4;
    Item8 --> Item7;
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
    Item19;
    Item20;
    Item21;
    Item22;
    Item23;
    Item24;
    Item25;
    Item26;
    Item27;
    Item28;
    Item29;
    Item29["ModuleEvaluation"];
    Item30;
    Item30["export structuredError"];
    Item31;
    Item31["export IPC"];
    Item2 --> Item1;
    Item3 --> Item2;
    Item9 --> Item3;
    Item9 -.-> Item6;
    Item9 -.-> Item5;
    Item9 -.-> Item4;
    Item9 -.-> Item7;
    Item10 --> Item8;
    Item10 --> Item9;
    Item10 -.-> Item6;
    Item10 -.-> Item5;
    Item10 -.-> Item4;
    Item10 -.-> Item7;
    Item11 --> Item10;
    Item11 -.-> Item6;
    Item11 -.-> Item5;
    Item11 -.-> Item4;
    Item11 -.-> Item7;
    Item12 --> Item11;
    Item12 -.-> Item6;
    Item12 -.-> Item5;
    Item12 -.-> Item4;
    Item12 -.-> Item7;
    Item13 --> Item12;
    Item13 -.-> Item6;
    Item13 -.-> Item5;
    Item13 -.-> Item4;
    Item13 -.-> Item7;
    Item14 --> Item12;
    Item14 --> Item13;
    Item14 -.-> Item6;
    Item14 -.-> Item5;
    Item14 -.-> Item4;
    Item14 -.-> Item7;
    Item15 --> Item12;
    Item15 --> Item14;
    Item15 -.-> Item6;
    Item15 -.-> Item5;
    Item15 -.-> Item4;
    Item15 -.-> Item7;
    Item16 --> Item12;
    Item16 --> Item15;
    Item16 -.-> Item6;
    Item16 -.-> Item5;
    Item16 -.-> Item4;
    Item16 -.-> Item7;
    Item17 --> Item12;
    Item17 --> Item16;
    Item17 -.-> Item6;
    Item17 -.-> Item5;
    Item17 -.-> Item4;
    Item17 -.-> Item7;
    Item18 --> Item12;
    Item18 --> Item17;
    Item18 -.-> Item6;
    Item18 -.-> Item5;
    Item18 -.-> Item4;
    Item18 -.-> Item7;
    Item19 --> Item12;
    Item19 --> Item18;
    Item19 -.-> Item6;
    Item19 -.-> Item5;
    Item19 -.-> Item4;
    Item19 -.-> Item7;
    Item20 --> Item12;
    Item20 --> Item19;
    Item20 -.-> Item6;
    Item20 -.-> Item5;
    Item20 -.-> Item4;
    Item20 -.-> Item7;
    Item21 --> Item12;
    Item21 --> Item20;
    Item21 -.-> Item6;
    Item21 -.-> Item5;
    Item21 -.-> Item4;
    Item21 -.-> Item7;
    Item22 --> Item12;
    Item22 --> Item21;
    Item22 -.-> Item6;
    Item22 -.-> Item5;
    Item22 -.-> Item4;
    Item22 -.-> Item7;
    Item23 --> Item12;
    Item23 --> Item22;
    Item23 -.-> Item6;
    Item23 -.-> Item5;
    Item23 -.-> Item4;
    Item23 -.-> Item7;
    Item24 --> Item12;
    Item24 --> Item23;
    Item24 -.-> Item6;
    Item24 -.-> Item5;
    Item24 -.-> Item4;
    Item24 -.-> Item7;
    Item25 --> Item12;
    Item25 --> Item24;
    Item25 -.-> Item6;
    Item25 -.-> Item5;
    Item25 -.-> Item4;
    Item25 -.-> Item7;
    Item26 --> Item12;
    Item26 --> Item25;
    Item26 -.-> Item6;
    Item26 -.-> Item5;
    Item26 -.-> Item4;
    Item26 -.-> Item7;
    Item27 --> Item12;
    Item27 --> Item26;
    Item27 -.-> Item6;
    Item27 -.-> Item5;
    Item27 -.-> Item4;
    Item27 -.-> Item7;
    Item28 --> Item12;
    Item28 --> Item27;
    Item28 -.-> Item6;
    Item28 -.-> Item5;
    Item28 -.-> Item4;
    Item28 -.-> Item7;
    Item30 --> Item7;
    Item31 --> Item11;
    Item31 --> Item10;
    Item7 --> Item6;
    Item7 --> Item5;
    Item8 --> Item4;
    Item8 --> Item7;
    Item29 --> Item28;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(ModuleEvaluation)]"];
    N1["Items: [ItemId(Export((&quot;IPC&quot;, #2), &quot;IPC&quot;))]"];
    N2["Items: [ItemId(Export((&quot;structuredError&quot;, #2), &quot;structuredError&quot;))]"];
    N3["Items: [ItemId(0, ImportOfModule)]"];
    N4["Items: [ItemId(0, ImportBinding(0))]"];
    N5["Items: [ItemId(1, ImportOfModule)]"];
    N6["Items: [ItemId(1, ImportBinding(0))]"];
    N7["Items: [ItemId(2, ImportOfModule)]"];
    N8["Items: [ItemId(2, ImportBinding(0))]"];
    N9["Items: [ItemId(3, Normal)]"];
    N10["Items: [ItemId(4, Normal)]"];
    N11["Items: [ItemId(5, VarDeclarator(0))]"];
    N12["Items: [ItemId(6, VarDeclarator(0))]"];
    N13["Items: [ItemId(7, Normal)]"];
    N14["Items: [ItemId(8, VarDeclarator(0))]"];
    N15["Items: [ItemId(9, Normal)]"];
    N16["Items: [ItemId(10, Normal)]"];
    N17["Items: [ItemId(11, Normal)]"];
    N18["Items: [ItemId(12, Normal)]"];
    N19["Items: [ItemId(13, Normal)]"];
    N20["Items: [ItemId(14, Normal)]"];
    N21["Items: [ItemId(15, Normal)]"];
    N22["Items: [ItemId(16, Normal)]"];
    N23["Items: [ItemId(17, Normal)]"];
    N24["Items: [ItemId(18, Normal)]"];
    N25["Items: [ItemId(19, Normal)]"];
    N26["Items: [ItemId(20, Normal)]"];
    N27["Items: [ItemId(21, Normal)]"];
    N28["Items: [ItemId(22, Normal)]"];
    N29["Items: [ItemId(23, Normal)]"];
    N30["Items: [ItemId(24, Normal)]"];
    N5 --> N3;
    N7 --> N5;
    N11 --> N7;
    N11 -.-> N8;
    N11 -.-> N6;
    N11 -.-> N4;
    N11 -.-> N9;
    N12 --> N10;
    N12 --> N11;
    N12 -.-> N8;
    N12 -.-> N6;
    N12 -.-> N4;
    N12 -.-> N9;
    N13 --> N12;
    N13 -.-> N8;
    N13 -.-> N6;
    N13 -.-> N4;
    N13 -.-> N9;
    N14 --> N13;
    N14 -.-> N8;
    N14 -.-> N6;
    N14 -.-> N4;
    N14 -.-> N9;
    N15 --> N14;
    N15 -.-> N8;
    N15 -.-> N6;
    N15 -.-> N4;
    N15 -.-> N9;
    N16 --> N14;
    N16 --> N15;
    N16 -.-> N8;
    N16 -.-> N6;
    N16 -.-> N4;
    N16 -.-> N9;
    N17 --> N14;
    N17 --> N16;
    N17 -.-> N8;
    N17 -.-> N6;
    N17 -.-> N4;
    N17 -.-> N9;
    N18 --> N14;
    N18 --> N17;
    N18 -.-> N8;
    N18 -.-> N6;
    N18 -.-> N4;
    N18 -.-> N9;
    N19 --> N14;
    N19 --> N18;
    N19 -.-> N8;
    N19 -.-> N6;
    N19 -.-> N4;
    N19 -.-> N9;
    N20 --> N14;
    N20 --> N19;
    N20 -.-> N8;
    N20 -.-> N6;
    N20 -.-> N4;
    N20 -.-> N9;
    N21 --> N14;
    N21 --> N20;
    N21 -.-> N8;
    N21 -.-> N6;
    N21 -.-> N4;
    N21 -.-> N9;
    N22 --> N14;
    N22 --> N21;
    N22 -.-> N8;
    N22 -.-> N6;
    N22 -.-> N4;
    N22 -.-> N9;
    N23 --> N14;
    N23 --> N22;
    N23 -.-> N8;
    N23 -.-> N6;
    N23 -.-> N4;
    N23 -.-> N9;
    N24 --> N14;
    N24 --> N23;
    N24 -.-> N8;
    N24 -.-> N6;
    N24 -.-> N4;
    N24 -.-> N9;
    N25 --> N14;
    N25 --> N24;
    N25 -.-> N8;
    N25 -.-> N6;
    N25 -.-> N4;
    N25 -.-> N9;
    N26 --> N14;
    N26 --> N25;
    N26 -.-> N8;
    N26 -.-> N6;
    N26 -.-> N4;
    N26 -.-> N9;
    N27 --> N14;
    N27 --> N26;
    N27 -.-> N8;
    N27 -.-> N6;
    N27 -.-> N4;
    N27 -.-> N9;
    N28 --> N14;
    N28 --> N27;
    N28 -.-> N8;
    N28 -.-> N6;
    N28 -.-> N4;
    N28 -.-> N9;
    N29 --> N14;
    N29 --> N28;
    N29 -.-> N8;
    N29 -.-> N6;
    N29 -.-> N4;
    N29 -.-> N9;
    N30 --> N14;
    N30 --> N29;
    N30 -.-> N8;
    N30 -.-> N6;
    N30 -.-> N4;
    N30 -.-> N9;
    N2 --> N9;
    N1 --> N13;
    N1 --> N12;
    N9 --> N8;
    N9 --> N6;
    N10 --> N4;
    N10 --> N9;
    N0 --> N30;
```
# Entrypoints

```
{
    ModuleEvaluation: 0,
    Export(
        "IPC",
    ): 1,
    Exports: 31,
    Export(
        "structuredError",
    ): 2,
}
```


# Modules (dev)
## Part 0
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 30
};
"module evaluation";

```
## Part 1
```js
import { a as IPC } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
export { IPC };

```
## Part 2
```js
import { b as structuredError } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -9
};
export { structuredError };

```
## Part 3
```js
import "node:net";

```
## Part 4
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import { createConnection } from "node:net";
export { createConnection as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import "../compiled/stacktrace-parser";

```
## Part 6
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import { parse as parseStackTrace } from "../compiled/stacktrace-parser";
export { parseStackTrace as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 7
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import "./error";

```
## Part 8
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import { getProperError } from "./error";
export { getProperError as e } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 9
```js
import { d as parseStackTrace } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -6,
    __turbopack_original__: "../compiled/stacktrace-parser"
};
import { e as getProperError } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -8,
    __turbopack_original__: "./error"
};
function structuredError(e) {
    e = getProperError(e);
    return {
        name: e.name,
        message: e.message,
        stack: typeof e.stack === "string" ? parseStackTrace(e.stack) : []
    };
}
export { structuredError as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 10
```js
import { b as structuredError } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -9
};
import { c as createConnection } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -4,
    __turbopack_original__: "node:net"
};
function createIpc(port) {
    const socket = createConnection(port, "127.0.0.1");
    const packetQueue = [];
    const recvPromiseResolveQueue = [];
    function pushPacket(packet) {
        const recvPromiseResolve = recvPromiseResolveQueue.shift();
        if (recvPromiseResolve != null) {
            recvPromiseResolve(JSON.parse(packet.toString("utf8")));
        } else {
            packetQueue.push(packet);
        }
    }
    let state = {
        type: "waiting"
    };
    let buffer = Buffer.alloc(0);
    socket.once("connect", ()=>{
        socket.on("data", (chunk)=>{
            buffer = Buffer.concat([
                buffer,
                chunk
            ]);
            loop: while(true){
                switch(state.type){
                    case "waiting":
                        {
                            if (buffer.length >= 4) {
                                const length = buffer.readUInt32BE(0);
                                buffer = buffer.subarray(4);
                                state = {
                                    type: "packet",
                                    length
                                };
                            } else {
                                break loop;
                            }
                            break;
                        }
                    case "packet":
                        {
                            if (buffer.length >= state.length) {
                                const packet = buffer.subarray(0, state.length);
                                buffer = buffer.subarray(state.length);
                                state = {
                                    type: "waiting"
                                };
                                pushPacket(packet);
                            } else {
                                break loop;
                            }
                            break;
                        }
                }
            }
        });
    });
    socket.once("close", ()=>{
        process.exit(0);
    });
    function send(message) {
        const packet = Buffer.from(JSON.stringify(message), "utf8");
        const length = Buffer.alloc(4);
        length.writeUInt32BE(packet.length);
        socket.write(length);
        return new Promise((resolve, reject)=>{
            socket.write(packet, (err)=>{
                process.stderr.write(`TURBOPACK_OUTPUT_D\n`);
                process.stdout.write(`TURBOPACK_OUTPUT_D\n`);
                if (err != null) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }
    function sendReady() {
        const length = Buffer.from([
            0,
            0,
            0,
            0
        ]);
        return new Promise((resolve, reject)=>{
            socket.write(length, (err)=>{
                process.stderr.write(`TURBOPACK_OUTPUT_D\n`);
                process.stdout.write(`TURBOPACK_OUTPUT_D\n`);
                if (err != null) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }
    return {
        async recv () {
            const packet = packetQueue.shift();
            if (packet != null) {
                return JSON.parse(packet.toString("utf8"));
            }
            const result = await new Promise((resolve)=>{
                recvPromiseResolveQueue.push((result)=>{
                    resolve(result);
                });
            });
            return result;
        },
        send (message) {
            return send(message);
        },
        sendReady,
        async sendError (error) {
            try {
                await send({
                    type: "error",
                    ...structuredError(error)
                });
            } catch (err) {
                console.error("failed to send error back to rust:", err);
                process.exit(1);
            }
            process.exit(0);
        }
    };
}
export { createIpc as f } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 11
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
const PORT = process.argv[2];
export { PORT as g } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 12
```js
import { f as createIpc } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -10
};
import { g as PORT } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
const IPC = createIpc(parseInt(PORT, 10));
export { IPC as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 13
```js
import { a as IPC } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
process.on("uncaughtException", (err)=>{
    IPC.sendError(err);
});

```
## Part 14
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
const improveConsole = (name, stream, addStack)=>{
    const original = console[name];
    const stdio = process[stream];
    console[name] = (...args)=>{
        stdio.write(`TURBOPACK_OUTPUT_B\n`);
        original(...args);
        if (addStack) {
            const stack = new Error().stack?.replace(/^.+\n.+\n/, "") + "\n";
            stdio.write("TURBOPACK_OUTPUT_S\n");
            stdio.write(stack);
        }
        stdio.write("TURBOPACK_OUTPUT_E\n");
    };
};
export { improveConsole as h } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 15
```js
import { h as improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
improveConsole("error", "stderr", true);

```
## Part 16
```js
import { h as improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 15
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
improveConsole("warn", "stderr", true);

```
## Part 17
```js
import { h as improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
improveConsole("count", "stdout", true);

```
## Part 18
```js
import { h as improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 17
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
improveConsole("trace", "stderr", false);

```
## Part 19
```js
import { h as improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 18
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
improveConsole("log", "stdout", true);

```
## Part 20
```js
import { h as improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 19
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
improveConsole("group", "stdout", true);

```
## Part 21
```js
import { h as improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
improveConsole("groupCollapsed", "stdout", true);

```
## Part 22
```js
import { h as improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 21
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
improveConsole("table", "stdout", true);

```
## Part 23
```js
import { h as improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 22
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
improveConsole("debug", "stdout", true);

```
## Part 24
```js
import { h as improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 23
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
improveConsole("info", "stdout", true);

```
## Part 25
```js
import { h as improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 24
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
improveConsole("dir", "stdout", true);

```
## Part 26
```js
import { h as improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 25
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
improveConsole("dirxml", "stdout", true);

```
## Part 27
```js
import { h as improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 26
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
improveConsole("timeEnd", "stdout", true);

```
## Part 28
```js
import { h as improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 27
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
improveConsole("timeLog", "stdout", true);

```
## Part 29
```js
import { h as improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 28
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
improveConsole("timeStamp", "stdout", true);

```
## Part 30
```js
import { h as improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 29
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
improveConsole("assert", "stderr", true);

```
## Part 31
```js
export { IPC } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export IPC"
};
export { structuredError } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export structuredError"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 30
};
"module evaluation";

```
# Entrypoints

```
{
    ModuleEvaluation: 0,
    Export(
        "IPC",
    ): 1,
    Exports: 31,
    Export(
        "structuredError",
    ): 2,
}
```


# Modules (prod)
## Part 0
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 30
};
"module evaluation";

```
## Part 1
```js
import { a as IPC } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
export { IPC };

```
## Part 2
```js
import { b as structuredError } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -9
};
export { structuredError };

```
## Part 3
```js
import "node:net";

```
## Part 4
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import { createConnection } from "node:net";
export { createConnection as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import "../compiled/stacktrace-parser";

```
## Part 6
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import { parse as parseStackTrace } from "../compiled/stacktrace-parser";
export { parseStackTrace as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 7
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import "./error";

```
## Part 8
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import { getProperError } from "./error";
export { getProperError as e } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 9
```js
import { d as parseStackTrace } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -6,
    __turbopack_original__: "../compiled/stacktrace-parser"
};
import { e as getProperError } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -8,
    __turbopack_original__: "./error"
};
function structuredError(e) {
    e = getProperError(e);
    return {
        name: e.name,
        message: e.message,
        stack: typeof e.stack === "string" ? parseStackTrace(e.stack) : []
    };
}
export { structuredError as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 10
```js
import { b as structuredError } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -9
};
import { c as createConnection } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -4,
    __turbopack_original__: "node:net"
};
function createIpc(port) {
    const socket = createConnection(port, "127.0.0.1");
    const packetQueue = [];
    const recvPromiseResolveQueue = [];
    function pushPacket(packet) {
        const recvPromiseResolve = recvPromiseResolveQueue.shift();
        if (recvPromiseResolve != null) {
            recvPromiseResolve(JSON.parse(packet.toString("utf8")));
        } else {
            packetQueue.push(packet);
        }
    }
    let state = {
        type: "waiting"
    };
    let buffer = Buffer.alloc(0);
    socket.once("connect", ()=>{
        socket.on("data", (chunk)=>{
            buffer = Buffer.concat([
                buffer,
                chunk
            ]);
            loop: while(true){
                switch(state.type){
                    case "waiting":
                        {
                            if (buffer.length >= 4) {
                                const length = buffer.readUInt32BE(0);
                                buffer = buffer.subarray(4);
                                state = {
                                    type: "packet",
                                    length
                                };
                            } else {
                                break loop;
                            }
                            break;
                        }
                    case "packet":
                        {
                            if (buffer.length >= state.length) {
                                const packet = buffer.subarray(0, state.length);
                                buffer = buffer.subarray(state.length);
                                state = {
                                    type: "waiting"
                                };
                                pushPacket(packet);
                            } else {
                                break loop;
                            }
                            break;
                        }
                }
            }
        });
    });
    socket.once("close", ()=>{
        process.exit(0);
    });
    function send(message) {
        const packet = Buffer.from(JSON.stringify(message), "utf8");
        const length = Buffer.alloc(4);
        length.writeUInt32BE(packet.length);
        socket.write(length);
        return new Promise((resolve, reject)=>{
            socket.write(packet, (err)=>{
                process.stderr.write(`TURBOPACK_OUTPUT_D\n`);
                process.stdout.write(`TURBOPACK_OUTPUT_D\n`);
                if (err != null) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }
    function sendReady() {
        const length = Buffer.from([
            0,
            0,
            0,
            0
        ]);
        return new Promise((resolve, reject)=>{
            socket.write(length, (err)=>{
                process.stderr.write(`TURBOPACK_OUTPUT_D\n`);
                process.stdout.write(`TURBOPACK_OUTPUT_D\n`);
                if (err != null) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }
    return {
        async recv () {
            const packet = packetQueue.shift();
            if (packet != null) {
                return JSON.parse(packet.toString("utf8"));
            }
            const result = await new Promise((resolve)=>{
                recvPromiseResolveQueue.push((result)=>{
                    resolve(result);
                });
            });
            return result;
        },
        send (message) {
            return send(message);
        },
        sendReady,
        async sendError (error) {
            try {
                await send({
                    type: "error",
                    ...structuredError(error)
                });
            } catch (err) {
                console.error("failed to send error back to rust:", err);
                process.exit(1);
            }
            process.exit(0);
        }
    };
}
export { createIpc as f } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 11
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
const PORT = process.argv[2];
export { PORT as g } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 12
```js
import { f as createIpc } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -10
};
import { g as PORT } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -11
};
const IPC = createIpc(parseInt(PORT, 10));
export { IPC as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 13
```js
import { a as IPC } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -12
};
process.on("uncaughtException", (err)=>{
    IPC.sendError(err);
});

```
## Part 14
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
const improveConsole = (name, stream, addStack)=>{
    const original = console[name];
    const stdio = process[stream];
    console[name] = (...args)=>{
        stdio.write(`TURBOPACK_OUTPUT_B\n`);
        original(...args);
        if (addStack) {
            const stack = new Error().stack?.replace(/^.+\n.+\n/, "") + "\n";
            stdio.write("TURBOPACK_OUTPUT_S\n");
            stdio.write(stack);
        }
        stdio.write("TURBOPACK_OUTPUT_E\n");
    };
};
export { improveConsole as h } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 15
```js
import { h as improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
improveConsole("error", "stderr", true);

```
## Part 16
```js
import { h as improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 15
};
improveConsole("warn", "stderr", true);

```
## Part 17
```js
import { h as improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
improveConsole("count", "stdout", true);

```
## Part 18
```js
import { h as improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 17
};
improveConsole("trace", "stderr", false);

```
## Part 19
```js
import { h as improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 18
};
improveConsole("log", "stdout", true);

```
## Part 20
```js
import { h as improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 19
};
improveConsole("group", "stdout", true);

```
## Part 21
```js
import { h as improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
improveConsole("groupCollapsed", "stdout", true);

```
## Part 22
```js
import { h as improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 21
};
improveConsole("table", "stdout", true);

```
## Part 23
```js
import { h as improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 22
};
improveConsole("debug", "stdout", true);

```
## Part 24
```js
import { h as improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 23
};
improveConsole("info", "stdout", true);

```
## Part 25
```js
import { h as improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 24
};
improveConsole("dir", "stdout", true);

```
## Part 26
```js
import { h as improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 25
};
improveConsole("dirxml", "stdout", true);

```
## Part 27
```js
import { h as improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 26
};
improveConsole("timeEnd", "stdout", true);

```
## Part 28
```js
import { h as improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 27
};
improveConsole("timeLog", "stdout", true);

```
## Part 29
```js
import { h as improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 28
};
improveConsole("timeStamp", "stdout", true);

```
## Part 30
```js
import { h as improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 29
};
improveConsole("assert", "stderr", true);

```
## Part 31
```js
export { IPC } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export IPC"
};
export { structuredError } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export structuredError"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 30
};
"module evaluation";

```
