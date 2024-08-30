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
    Item3 --> Item1;
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
    Item3 --> Item1;
    Item3 --> Item2;
    Item9 --> Item1;
    Item9 --> Item2;
    Item9 --> Item3;
    Item9 -.-> Item6;
    Item9 -.-> Item5;
    Item9 -.-> Item4;
    Item9 -.-> Item7;
    Item10 --> Item8;
    Item10 --> Item9;
    Item10 --> Item1;
    Item10 --> Item2;
    Item10 --> Item3;
    Item10 -.-> Item6;
    Item10 -.-> Item5;
    Item10 -.-> Item4;
    Item10 -.-> Item7;
    Item11 --> Item10;
    Item11 --> Item1;
    Item11 --> Item2;
    Item11 --> Item3;
    Item11 --> Item9;
    Item11 -.-> Item6;
    Item11 -.-> Item5;
    Item11 -.-> Item4;
    Item11 -.-> Item7;
    Item12 --> Item1;
    Item12 --> Item2;
    Item12 --> Item3;
    Item12 --> Item9;
    Item12 --> Item10;
    Item12 --> Item11;
    Item12 -.-> Item6;
    Item12 -.-> Item5;
    Item12 -.-> Item4;
    Item12 -.-> Item7;
    Item13 --> Item12;
    Item13 --> Item1;
    Item13 --> Item2;
    Item13 --> Item3;
    Item13 --> Item9;
    Item13 --> Item10;
    Item13 --> Item11;
    Item13 -.-> Item6;
    Item13 -.-> Item5;
    Item13 -.-> Item4;
    Item13 -.-> Item7;
    Item14 --> Item12;
    Item14 --> Item1;
    Item14 --> Item2;
    Item14 --> Item3;
    Item14 --> Item9;
    Item14 --> Item10;
    Item14 --> Item11;
    Item14 --> Item13;
    Item14 -.-> Item6;
    Item14 -.-> Item5;
    Item14 -.-> Item4;
    Item14 -.-> Item7;
    Item15 --> Item12;
    Item15 --> Item1;
    Item15 --> Item2;
    Item15 --> Item3;
    Item15 --> Item9;
    Item15 --> Item10;
    Item15 --> Item11;
    Item15 --> Item13;
    Item15 --> Item14;
    Item15 -.-> Item6;
    Item15 -.-> Item5;
    Item15 -.-> Item4;
    Item15 -.-> Item7;
    Item16 --> Item12;
    Item16 --> Item1;
    Item16 --> Item2;
    Item16 --> Item3;
    Item16 --> Item9;
    Item16 --> Item10;
    Item16 --> Item11;
    Item16 --> Item13;
    Item16 --> Item14;
    Item16 --> Item15;
    Item16 -.-> Item6;
    Item16 -.-> Item5;
    Item16 -.-> Item4;
    Item16 -.-> Item7;
    Item17 --> Item12;
    Item17 --> Item1;
    Item17 --> Item2;
    Item17 --> Item3;
    Item17 --> Item9;
    Item17 --> Item10;
    Item17 --> Item11;
    Item17 --> Item13;
    Item17 --> Item14;
    Item17 --> Item15;
    Item17 --> Item16;
    Item17 -.-> Item6;
    Item17 -.-> Item5;
    Item17 -.-> Item4;
    Item17 -.-> Item7;
    Item18 --> Item12;
    Item18 --> Item1;
    Item18 --> Item2;
    Item18 --> Item3;
    Item18 --> Item9;
    Item18 --> Item10;
    Item18 --> Item11;
    Item18 --> Item13;
    Item18 --> Item14;
    Item18 --> Item15;
    Item18 --> Item16;
    Item18 --> Item17;
    Item18 -.-> Item6;
    Item18 -.-> Item5;
    Item18 -.-> Item4;
    Item18 -.-> Item7;
    Item19 --> Item12;
    Item19 --> Item1;
    Item19 --> Item2;
    Item19 --> Item3;
    Item19 --> Item9;
    Item19 --> Item10;
    Item19 --> Item11;
    Item19 --> Item13;
    Item19 --> Item14;
    Item19 --> Item15;
    Item19 --> Item16;
    Item19 --> Item17;
    Item19 --> Item18;
    Item19 -.-> Item6;
    Item19 -.-> Item5;
    Item19 -.-> Item4;
    Item19 -.-> Item7;
    Item20 --> Item12;
    Item20 --> Item1;
    Item20 --> Item2;
    Item20 --> Item3;
    Item20 --> Item9;
    Item20 --> Item10;
    Item20 --> Item11;
    Item20 --> Item13;
    Item20 --> Item14;
    Item20 --> Item15;
    Item20 --> Item16;
    Item20 --> Item17;
    Item20 --> Item18;
    Item20 --> Item19;
    Item20 -.-> Item6;
    Item20 -.-> Item5;
    Item20 -.-> Item4;
    Item20 -.-> Item7;
    Item21 --> Item12;
    Item21 --> Item1;
    Item21 --> Item2;
    Item21 --> Item3;
    Item21 --> Item9;
    Item21 --> Item10;
    Item21 --> Item11;
    Item21 --> Item13;
    Item21 --> Item14;
    Item21 --> Item15;
    Item21 --> Item16;
    Item21 --> Item17;
    Item21 --> Item18;
    Item21 --> Item19;
    Item21 --> Item20;
    Item21 -.-> Item6;
    Item21 -.-> Item5;
    Item21 -.-> Item4;
    Item21 -.-> Item7;
    Item22 --> Item12;
    Item22 --> Item1;
    Item22 --> Item2;
    Item22 --> Item3;
    Item22 --> Item9;
    Item22 --> Item10;
    Item22 --> Item11;
    Item22 --> Item13;
    Item22 --> Item14;
    Item22 --> Item15;
    Item22 --> Item16;
    Item22 --> Item17;
    Item22 --> Item18;
    Item22 --> Item19;
    Item22 --> Item20;
    Item22 --> Item21;
    Item22 -.-> Item6;
    Item22 -.-> Item5;
    Item22 -.-> Item4;
    Item22 -.-> Item7;
    Item23 --> Item12;
    Item23 --> Item1;
    Item23 --> Item2;
    Item23 --> Item3;
    Item23 --> Item9;
    Item23 --> Item10;
    Item23 --> Item11;
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
    Item23 -.-> Item6;
    Item23 -.-> Item5;
    Item23 -.-> Item4;
    Item23 -.-> Item7;
    Item24 --> Item12;
    Item24 --> Item1;
    Item24 --> Item2;
    Item24 --> Item3;
    Item24 --> Item9;
    Item24 --> Item10;
    Item24 --> Item11;
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
    Item24 --> Item23;
    Item24 -.-> Item6;
    Item24 -.-> Item5;
    Item24 -.-> Item4;
    Item24 -.-> Item7;
    Item25 --> Item12;
    Item25 --> Item1;
    Item25 --> Item2;
    Item25 --> Item3;
    Item25 --> Item9;
    Item25 --> Item10;
    Item25 --> Item11;
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
    Item25 -.-> Item6;
    Item25 -.-> Item5;
    Item25 -.-> Item4;
    Item25 -.-> Item7;
    Item26 --> Item12;
    Item26 --> Item1;
    Item26 --> Item2;
    Item26 --> Item3;
    Item26 --> Item9;
    Item26 --> Item10;
    Item26 --> Item11;
    Item26 --> Item13;
    Item26 --> Item14;
    Item26 --> Item15;
    Item26 --> Item16;
    Item26 --> Item17;
    Item26 --> Item18;
    Item26 --> Item19;
    Item26 --> Item20;
    Item26 --> Item21;
    Item26 --> Item22;
    Item26 --> Item23;
    Item26 --> Item24;
    Item26 --> Item25;
    Item26 -.-> Item6;
    Item26 -.-> Item5;
    Item26 -.-> Item4;
    Item26 -.-> Item7;
    Item27 --> Item12;
    Item27 --> Item1;
    Item27 --> Item2;
    Item27 --> Item3;
    Item27 --> Item9;
    Item27 --> Item10;
    Item27 --> Item11;
    Item27 --> Item13;
    Item27 --> Item14;
    Item27 --> Item15;
    Item27 --> Item16;
    Item27 --> Item17;
    Item27 --> Item18;
    Item27 --> Item19;
    Item27 --> Item20;
    Item27 --> Item21;
    Item27 --> Item22;
    Item27 --> Item23;
    Item27 --> Item24;
    Item27 --> Item25;
    Item27 --> Item26;
    Item27 -.-> Item6;
    Item27 -.-> Item5;
    Item27 -.-> Item4;
    Item27 -.-> Item7;
    Item28 --> Item12;
    Item28 --> Item1;
    Item28 --> Item2;
    Item28 --> Item3;
    Item28 --> Item9;
    Item28 --> Item10;
    Item28 --> Item11;
    Item28 --> Item13;
    Item28 --> Item14;
    Item28 --> Item15;
    Item28 --> Item16;
    Item28 --> Item17;
    Item28 --> Item18;
    Item28 --> Item19;
    Item28 --> Item20;
    Item28 --> Item21;
    Item28 --> Item22;
    Item28 --> Item23;
    Item28 --> Item24;
    Item28 --> Item25;
    Item28 --> Item26;
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
    Item3 --> Item1;
    Item3 --> Item2;
    Item9 --> Item1;
    Item9 --> Item2;
    Item9 --> Item3;
    Item9 -.-> Item6;
    Item9 -.-> Item5;
    Item9 -.-> Item4;
    Item9 -.-> Item7;
    Item10 --> Item8;
    Item10 --> Item9;
    Item10 --> Item1;
    Item10 --> Item2;
    Item10 --> Item3;
    Item10 -.-> Item6;
    Item10 -.-> Item5;
    Item10 -.-> Item4;
    Item10 -.-> Item7;
    Item11 --> Item10;
    Item11 --> Item1;
    Item11 --> Item2;
    Item11 --> Item3;
    Item11 --> Item9;
    Item11 -.-> Item6;
    Item11 -.-> Item5;
    Item11 -.-> Item4;
    Item11 -.-> Item7;
    Item12 --> Item1;
    Item12 --> Item2;
    Item12 --> Item3;
    Item12 --> Item9;
    Item12 --> Item10;
    Item12 --> Item11;
    Item12 -.-> Item6;
    Item12 -.-> Item5;
    Item12 -.-> Item4;
    Item12 -.-> Item7;
    Item13 --> Item12;
    Item13 --> Item1;
    Item13 --> Item2;
    Item13 --> Item3;
    Item13 --> Item9;
    Item13 --> Item10;
    Item13 --> Item11;
    Item13 -.-> Item6;
    Item13 -.-> Item5;
    Item13 -.-> Item4;
    Item13 -.-> Item7;
    Item14 --> Item12;
    Item14 --> Item1;
    Item14 --> Item2;
    Item14 --> Item3;
    Item14 --> Item9;
    Item14 --> Item10;
    Item14 --> Item11;
    Item14 --> Item13;
    Item14 -.-> Item6;
    Item14 -.-> Item5;
    Item14 -.-> Item4;
    Item14 -.-> Item7;
    Item15 --> Item12;
    Item15 --> Item1;
    Item15 --> Item2;
    Item15 --> Item3;
    Item15 --> Item9;
    Item15 --> Item10;
    Item15 --> Item11;
    Item15 --> Item13;
    Item15 --> Item14;
    Item15 -.-> Item6;
    Item15 -.-> Item5;
    Item15 -.-> Item4;
    Item15 -.-> Item7;
    Item16 --> Item12;
    Item16 --> Item1;
    Item16 --> Item2;
    Item16 --> Item3;
    Item16 --> Item9;
    Item16 --> Item10;
    Item16 --> Item11;
    Item16 --> Item13;
    Item16 --> Item14;
    Item16 --> Item15;
    Item16 -.-> Item6;
    Item16 -.-> Item5;
    Item16 -.-> Item4;
    Item16 -.-> Item7;
    Item17 --> Item12;
    Item17 --> Item1;
    Item17 --> Item2;
    Item17 --> Item3;
    Item17 --> Item9;
    Item17 --> Item10;
    Item17 --> Item11;
    Item17 --> Item13;
    Item17 --> Item14;
    Item17 --> Item15;
    Item17 --> Item16;
    Item17 -.-> Item6;
    Item17 -.-> Item5;
    Item17 -.-> Item4;
    Item17 -.-> Item7;
    Item18 --> Item12;
    Item18 --> Item1;
    Item18 --> Item2;
    Item18 --> Item3;
    Item18 --> Item9;
    Item18 --> Item10;
    Item18 --> Item11;
    Item18 --> Item13;
    Item18 --> Item14;
    Item18 --> Item15;
    Item18 --> Item16;
    Item18 --> Item17;
    Item18 -.-> Item6;
    Item18 -.-> Item5;
    Item18 -.-> Item4;
    Item18 -.-> Item7;
    Item19 --> Item12;
    Item19 --> Item1;
    Item19 --> Item2;
    Item19 --> Item3;
    Item19 --> Item9;
    Item19 --> Item10;
    Item19 --> Item11;
    Item19 --> Item13;
    Item19 --> Item14;
    Item19 --> Item15;
    Item19 --> Item16;
    Item19 --> Item17;
    Item19 --> Item18;
    Item19 -.-> Item6;
    Item19 -.-> Item5;
    Item19 -.-> Item4;
    Item19 -.-> Item7;
    Item20 --> Item12;
    Item20 --> Item1;
    Item20 --> Item2;
    Item20 --> Item3;
    Item20 --> Item9;
    Item20 --> Item10;
    Item20 --> Item11;
    Item20 --> Item13;
    Item20 --> Item14;
    Item20 --> Item15;
    Item20 --> Item16;
    Item20 --> Item17;
    Item20 --> Item18;
    Item20 --> Item19;
    Item20 -.-> Item6;
    Item20 -.-> Item5;
    Item20 -.-> Item4;
    Item20 -.-> Item7;
    Item21 --> Item12;
    Item21 --> Item1;
    Item21 --> Item2;
    Item21 --> Item3;
    Item21 --> Item9;
    Item21 --> Item10;
    Item21 --> Item11;
    Item21 --> Item13;
    Item21 --> Item14;
    Item21 --> Item15;
    Item21 --> Item16;
    Item21 --> Item17;
    Item21 --> Item18;
    Item21 --> Item19;
    Item21 --> Item20;
    Item21 -.-> Item6;
    Item21 -.-> Item5;
    Item21 -.-> Item4;
    Item21 -.-> Item7;
    Item22 --> Item12;
    Item22 --> Item1;
    Item22 --> Item2;
    Item22 --> Item3;
    Item22 --> Item9;
    Item22 --> Item10;
    Item22 --> Item11;
    Item22 --> Item13;
    Item22 --> Item14;
    Item22 --> Item15;
    Item22 --> Item16;
    Item22 --> Item17;
    Item22 --> Item18;
    Item22 --> Item19;
    Item22 --> Item20;
    Item22 --> Item21;
    Item22 -.-> Item6;
    Item22 -.-> Item5;
    Item22 -.-> Item4;
    Item22 -.-> Item7;
    Item23 --> Item12;
    Item23 --> Item1;
    Item23 --> Item2;
    Item23 --> Item3;
    Item23 --> Item9;
    Item23 --> Item10;
    Item23 --> Item11;
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
    Item23 -.-> Item6;
    Item23 -.-> Item5;
    Item23 -.-> Item4;
    Item23 -.-> Item7;
    Item24 --> Item12;
    Item24 --> Item1;
    Item24 --> Item2;
    Item24 --> Item3;
    Item24 --> Item9;
    Item24 --> Item10;
    Item24 --> Item11;
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
    Item24 --> Item23;
    Item24 -.-> Item6;
    Item24 -.-> Item5;
    Item24 -.-> Item4;
    Item24 -.-> Item7;
    Item25 --> Item12;
    Item25 --> Item1;
    Item25 --> Item2;
    Item25 --> Item3;
    Item25 --> Item9;
    Item25 --> Item10;
    Item25 --> Item11;
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
    Item25 -.-> Item6;
    Item25 -.-> Item5;
    Item25 -.-> Item4;
    Item25 -.-> Item7;
    Item26 --> Item12;
    Item26 --> Item1;
    Item26 --> Item2;
    Item26 --> Item3;
    Item26 --> Item9;
    Item26 --> Item10;
    Item26 --> Item11;
    Item26 --> Item13;
    Item26 --> Item14;
    Item26 --> Item15;
    Item26 --> Item16;
    Item26 --> Item17;
    Item26 --> Item18;
    Item26 --> Item19;
    Item26 --> Item20;
    Item26 --> Item21;
    Item26 --> Item22;
    Item26 --> Item23;
    Item26 --> Item24;
    Item26 --> Item25;
    Item26 -.-> Item6;
    Item26 -.-> Item5;
    Item26 -.-> Item4;
    Item26 -.-> Item7;
    Item27 --> Item12;
    Item27 --> Item1;
    Item27 --> Item2;
    Item27 --> Item3;
    Item27 --> Item9;
    Item27 --> Item10;
    Item27 --> Item11;
    Item27 --> Item13;
    Item27 --> Item14;
    Item27 --> Item15;
    Item27 --> Item16;
    Item27 --> Item17;
    Item27 --> Item18;
    Item27 --> Item19;
    Item27 --> Item20;
    Item27 --> Item21;
    Item27 --> Item22;
    Item27 --> Item23;
    Item27 --> Item24;
    Item27 --> Item25;
    Item27 --> Item26;
    Item27 -.-> Item6;
    Item27 -.-> Item5;
    Item27 -.-> Item4;
    Item27 -.-> Item7;
    Item28 --> Item12;
    Item28 --> Item1;
    Item28 --> Item2;
    Item28 --> Item3;
    Item28 --> Item9;
    Item28 --> Item10;
    Item28 --> Item11;
    Item28 --> Item13;
    Item28 --> Item14;
    Item28 --> Item15;
    Item28 --> Item16;
    Item28 --> Item17;
    Item28 --> Item18;
    Item28 --> Item19;
    Item28 --> Item20;
    Item28 --> Item21;
    Item28 --> Item22;
    Item28 --> Item23;
    Item28 --> Item24;
    Item28 --> Item25;
    Item28 --> Item26;
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
    Item3 --> Item1;
    Item3 --> Item2;
    Item9 --> Item1;
    Item9 --> Item2;
    Item9 --> Item3;
    Item9 -.-> Item6;
    Item9 -.-> Item5;
    Item9 -.-> Item4;
    Item9 -.-> Item7;
    Item10 --> Item8;
    Item10 --> Item9;
    Item10 --> Item1;
    Item10 --> Item2;
    Item10 --> Item3;
    Item10 -.-> Item6;
    Item10 -.-> Item5;
    Item10 -.-> Item4;
    Item10 -.-> Item7;
    Item11 --> Item10;
    Item11 --> Item1;
    Item11 --> Item2;
    Item11 --> Item3;
    Item11 --> Item9;
    Item11 -.-> Item6;
    Item11 -.-> Item5;
    Item11 -.-> Item4;
    Item11 -.-> Item7;
    Item12 --> Item1;
    Item12 --> Item2;
    Item12 --> Item3;
    Item12 --> Item9;
    Item12 --> Item10;
    Item12 --> Item11;
    Item12 -.-> Item6;
    Item12 -.-> Item5;
    Item12 -.-> Item4;
    Item12 -.-> Item7;
    Item13 --> Item12;
    Item13 --> Item1;
    Item13 --> Item2;
    Item13 --> Item3;
    Item13 --> Item9;
    Item13 --> Item10;
    Item13 --> Item11;
    Item13 -.-> Item6;
    Item13 -.-> Item5;
    Item13 -.-> Item4;
    Item13 -.-> Item7;
    Item14 --> Item12;
    Item14 --> Item1;
    Item14 --> Item2;
    Item14 --> Item3;
    Item14 --> Item9;
    Item14 --> Item10;
    Item14 --> Item11;
    Item14 --> Item13;
    Item14 -.-> Item6;
    Item14 -.-> Item5;
    Item14 -.-> Item4;
    Item14 -.-> Item7;
    Item15 --> Item12;
    Item15 --> Item1;
    Item15 --> Item2;
    Item15 --> Item3;
    Item15 --> Item9;
    Item15 --> Item10;
    Item15 --> Item11;
    Item15 --> Item13;
    Item15 --> Item14;
    Item15 -.-> Item6;
    Item15 -.-> Item5;
    Item15 -.-> Item4;
    Item15 -.-> Item7;
    Item16 --> Item12;
    Item16 --> Item1;
    Item16 --> Item2;
    Item16 --> Item3;
    Item16 --> Item9;
    Item16 --> Item10;
    Item16 --> Item11;
    Item16 --> Item13;
    Item16 --> Item14;
    Item16 --> Item15;
    Item16 -.-> Item6;
    Item16 -.-> Item5;
    Item16 -.-> Item4;
    Item16 -.-> Item7;
    Item17 --> Item12;
    Item17 --> Item1;
    Item17 --> Item2;
    Item17 --> Item3;
    Item17 --> Item9;
    Item17 --> Item10;
    Item17 --> Item11;
    Item17 --> Item13;
    Item17 --> Item14;
    Item17 --> Item15;
    Item17 --> Item16;
    Item17 -.-> Item6;
    Item17 -.-> Item5;
    Item17 -.-> Item4;
    Item17 -.-> Item7;
    Item18 --> Item12;
    Item18 --> Item1;
    Item18 --> Item2;
    Item18 --> Item3;
    Item18 --> Item9;
    Item18 --> Item10;
    Item18 --> Item11;
    Item18 --> Item13;
    Item18 --> Item14;
    Item18 --> Item15;
    Item18 --> Item16;
    Item18 --> Item17;
    Item18 -.-> Item6;
    Item18 -.-> Item5;
    Item18 -.-> Item4;
    Item18 -.-> Item7;
    Item19 --> Item12;
    Item19 --> Item1;
    Item19 --> Item2;
    Item19 --> Item3;
    Item19 --> Item9;
    Item19 --> Item10;
    Item19 --> Item11;
    Item19 --> Item13;
    Item19 --> Item14;
    Item19 --> Item15;
    Item19 --> Item16;
    Item19 --> Item17;
    Item19 --> Item18;
    Item19 -.-> Item6;
    Item19 -.-> Item5;
    Item19 -.-> Item4;
    Item19 -.-> Item7;
    Item20 --> Item12;
    Item20 --> Item1;
    Item20 --> Item2;
    Item20 --> Item3;
    Item20 --> Item9;
    Item20 --> Item10;
    Item20 --> Item11;
    Item20 --> Item13;
    Item20 --> Item14;
    Item20 --> Item15;
    Item20 --> Item16;
    Item20 --> Item17;
    Item20 --> Item18;
    Item20 --> Item19;
    Item20 -.-> Item6;
    Item20 -.-> Item5;
    Item20 -.-> Item4;
    Item20 -.-> Item7;
    Item21 --> Item12;
    Item21 --> Item1;
    Item21 --> Item2;
    Item21 --> Item3;
    Item21 --> Item9;
    Item21 --> Item10;
    Item21 --> Item11;
    Item21 --> Item13;
    Item21 --> Item14;
    Item21 --> Item15;
    Item21 --> Item16;
    Item21 --> Item17;
    Item21 --> Item18;
    Item21 --> Item19;
    Item21 --> Item20;
    Item21 -.-> Item6;
    Item21 -.-> Item5;
    Item21 -.-> Item4;
    Item21 -.-> Item7;
    Item22 --> Item12;
    Item22 --> Item1;
    Item22 --> Item2;
    Item22 --> Item3;
    Item22 --> Item9;
    Item22 --> Item10;
    Item22 --> Item11;
    Item22 --> Item13;
    Item22 --> Item14;
    Item22 --> Item15;
    Item22 --> Item16;
    Item22 --> Item17;
    Item22 --> Item18;
    Item22 --> Item19;
    Item22 --> Item20;
    Item22 --> Item21;
    Item22 -.-> Item6;
    Item22 -.-> Item5;
    Item22 -.-> Item4;
    Item22 -.-> Item7;
    Item23 --> Item12;
    Item23 --> Item1;
    Item23 --> Item2;
    Item23 --> Item3;
    Item23 --> Item9;
    Item23 --> Item10;
    Item23 --> Item11;
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
    Item23 -.-> Item6;
    Item23 -.-> Item5;
    Item23 -.-> Item4;
    Item23 -.-> Item7;
    Item24 --> Item12;
    Item24 --> Item1;
    Item24 --> Item2;
    Item24 --> Item3;
    Item24 --> Item9;
    Item24 --> Item10;
    Item24 --> Item11;
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
    Item24 --> Item23;
    Item24 -.-> Item6;
    Item24 -.-> Item5;
    Item24 -.-> Item4;
    Item24 -.-> Item7;
    Item25 --> Item12;
    Item25 --> Item1;
    Item25 --> Item2;
    Item25 --> Item3;
    Item25 --> Item9;
    Item25 --> Item10;
    Item25 --> Item11;
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
    Item25 -.-> Item6;
    Item25 -.-> Item5;
    Item25 -.-> Item4;
    Item25 -.-> Item7;
    Item26 --> Item12;
    Item26 --> Item1;
    Item26 --> Item2;
    Item26 --> Item3;
    Item26 --> Item9;
    Item26 --> Item10;
    Item26 --> Item11;
    Item26 --> Item13;
    Item26 --> Item14;
    Item26 --> Item15;
    Item26 --> Item16;
    Item26 --> Item17;
    Item26 --> Item18;
    Item26 --> Item19;
    Item26 --> Item20;
    Item26 --> Item21;
    Item26 --> Item22;
    Item26 --> Item23;
    Item26 --> Item24;
    Item26 --> Item25;
    Item26 -.-> Item6;
    Item26 -.-> Item5;
    Item26 -.-> Item4;
    Item26 -.-> Item7;
    Item27 --> Item12;
    Item27 --> Item1;
    Item27 --> Item2;
    Item27 --> Item3;
    Item27 --> Item9;
    Item27 --> Item10;
    Item27 --> Item11;
    Item27 --> Item13;
    Item27 --> Item14;
    Item27 --> Item15;
    Item27 --> Item16;
    Item27 --> Item17;
    Item27 --> Item18;
    Item27 --> Item19;
    Item27 --> Item20;
    Item27 --> Item21;
    Item27 --> Item22;
    Item27 --> Item23;
    Item27 --> Item24;
    Item27 --> Item25;
    Item27 --> Item26;
    Item27 -.-> Item6;
    Item27 -.-> Item5;
    Item27 -.-> Item4;
    Item27 -.-> Item7;
    Item28 --> Item12;
    Item28 --> Item1;
    Item28 --> Item2;
    Item28 --> Item3;
    Item28 --> Item9;
    Item28 --> Item10;
    Item28 --> Item11;
    Item28 --> Item13;
    Item28 --> Item14;
    Item28 --> Item15;
    Item28 --> Item16;
    Item28 --> Item17;
    Item28 --> Item18;
    Item28 --> Item19;
    Item28 --> Item20;
    Item28 --> Item21;
    Item28 --> Item22;
    Item28 --> Item23;
    Item28 --> Item24;
    Item28 --> Item25;
    Item28 --> Item26;
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
    Item29 --> Item1;
    Item29 --> Item2;
    Item29 --> Item3;
    Item29 --> Item9;
    Item29 --> Item10;
    Item29 --> Item11;
    Item29 --> Item12;
    Item29 --> Item13;
    Item29 --> Item14;
    Item29 --> Item15;
    Item29 --> Item16;
    Item29 --> Item17;
    Item29 --> Item18;
    Item29 --> Item19;
    Item29 --> Item20;
    Item29 --> Item21;
    Item29 --> Item22;
    Item29 --> Item23;
    Item29 --> Item24;
    Item29 --> Item25;
    Item29 --> Item26;
    Item29 --> Item27;
    Item29 --> Item28;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(0, ImportBinding(0))]"];
    N1["Items: [ItemId(1, ImportBinding(0))]"];
    N2["Items: [ItemId(2, ImportBinding(0))]"];
    N3["Items: [ItemId(3, Normal)]"];
    N4["Items: [ItemId(4, Normal)]"];
    N5["Items: [ItemId(Export((&quot;structuredError&quot;, #2), &quot;structuredError&quot;))]"];
    N6["Items: [ItemId(0, ImportOfModule)]"];
    N7["Items: [ItemId(1, ImportOfModule)]"];
    N8["Items: [ItemId(2, ImportOfModule)]"];
    N9["Items: [ItemId(5, VarDeclarator(0))]"];
    N10["Items: [ItemId(6, VarDeclarator(0))]"];
    N11["Items: [ItemId(7, Normal)]"];
    N12["Items: [ItemId(Export((&quot;IPC&quot;, #2), &quot;IPC&quot;))]"];
    N13["Items: [ItemId(8, VarDeclarator(0))]"];
    N14["Items: [ItemId(9, Normal)]"];
    N15["Items: [ItemId(10, Normal)]"];
    N16["Items: [ItemId(11, Normal)]"];
    N17["Items: [ItemId(12, Normal)]"];
    N18["Items: [ItemId(13, Normal)]"];
    N19["Items: [ItemId(14, Normal)]"];
    N20["Items: [ItemId(15, Normal)]"];
    N21["Items: [ItemId(16, Normal)]"];
    N22["Items: [ItemId(17, Normal)]"];
    N23["Items: [ItemId(18, Normal)]"];
    N24["Items: [ItemId(19, Normal)]"];
    N25["Items: [ItemId(20, Normal)]"];
    N26["Items: [ItemId(21, Normal)]"];
    N27["Items: [ItemId(22, Normal)]"];
    N28["Items: [ItemId(23, Normal)]"];
    N29["Items: [ItemId(24, Normal)]"];
    N30["Items: [ItemId(ModuleEvaluation)]"];
    N7 --> N6;
    N8 --> N6;
    N8 --> N7;
    N9 --> N6;
    N9 --> N7;
    N9 --> N8;
    N9 -.-> N2;
    N9 -.-> N1;
    N9 -.-> N0;
    N9 -.-> N3;
    N10 --> N4;
    N10 --> N9;
    N10 --> N6;
    N10 --> N7;
    N10 --> N8;
    N10 -.-> N2;
    N10 -.-> N1;
    N10 -.-> N0;
    N10 -.-> N3;
    N11 --> N10;
    N11 --> N6;
    N11 --> N7;
    N11 --> N8;
    N11 --> N9;
    N11 -.-> N2;
    N11 -.-> N1;
    N11 -.-> N0;
    N11 -.-> N3;
    N13 --> N6;
    N13 --> N7;
    N13 --> N8;
    N13 --> N9;
    N13 --> N10;
    N13 --> N11;
    N13 -.-> N2;
    N13 -.-> N1;
    N13 -.-> N0;
    N13 -.-> N3;
    N14 --> N13;
    N14 --> N6;
    N14 --> N7;
    N14 --> N8;
    N14 --> N9;
    N14 --> N10;
    N14 --> N11;
    N14 -.-> N2;
    N14 -.-> N1;
    N14 -.-> N0;
    N14 -.-> N3;
    N15 --> N13;
    N15 --> N6;
    N15 --> N7;
    N15 --> N8;
    N15 --> N9;
    N15 --> N10;
    N15 --> N11;
    N15 --> N14;
    N15 -.-> N2;
    N15 -.-> N1;
    N15 -.-> N0;
    N15 -.-> N3;
    N16 --> N13;
    N16 --> N6;
    N16 --> N7;
    N16 --> N8;
    N16 --> N9;
    N16 --> N10;
    N16 --> N11;
    N16 --> N14;
    N16 --> N15;
    N16 -.-> N2;
    N16 -.-> N1;
    N16 -.-> N0;
    N16 -.-> N3;
    N17 --> N13;
    N17 --> N6;
    N17 --> N7;
    N17 --> N8;
    N17 --> N9;
    N17 --> N10;
    N17 --> N11;
    N17 --> N14;
    N17 --> N15;
    N17 --> N16;
    N17 -.-> N2;
    N17 -.-> N1;
    N17 -.-> N0;
    N17 -.-> N3;
    N18 --> N13;
    N18 --> N6;
    N18 --> N7;
    N18 --> N8;
    N18 --> N9;
    N18 --> N10;
    N18 --> N11;
    N18 --> N14;
    N18 --> N15;
    N18 --> N16;
    N18 --> N17;
    N18 -.-> N2;
    N18 -.-> N1;
    N18 -.-> N0;
    N18 -.-> N3;
    N19 --> N13;
    N19 --> N6;
    N19 --> N7;
    N19 --> N8;
    N19 --> N9;
    N19 --> N10;
    N19 --> N11;
    N19 --> N14;
    N19 --> N15;
    N19 --> N16;
    N19 --> N17;
    N19 --> N18;
    N19 -.-> N2;
    N19 -.-> N1;
    N19 -.-> N0;
    N19 -.-> N3;
    N20 --> N13;
    N20 --> N6;
    N20 --> N7;
    N20 --> N8;
    N20 --> N9;
    N20 --> N10;
    N20 --> N11;
    N20 --> N14;
    N20 --> N15;
    N20 --> N16;
    N20 --> N17;
    N20 --> N18;
    N20 --> N19;
    N20 -.-> N2;
    N20 -.-> N1;
    N20 -.-> N0;
    N20 -.-> N3;
    N21 --> N13;
    N21 --> N6;
    N21 --> N7;
    N21 --> N8;
    N21 --> N9;
    N21 --> N10;
    N21 --> N11;
    N21 --> N14;
    N21 --> N15;
    N21 --> N16;
    N21 --> N17;
    N21 --> N18;
    N21 --> N19;
    N21 --> N20;
    N21 -.-> N2;
    N21 -.-> N1;
    N21 -.-> N0;
    N21 -.-> N3;
    N22 --> N13;
    N22 --> N6;
    N22 --> N7;
    N22 --> N8;
    N22 --> N9;
    N22 --> N10;
    N22 --> N11;
    N22 --> N14;
    N22 --> N15;
    N22 --> N16;
    N22 --> N17;
    N22 --> N18;
    N22 --> N19;
    N22 --> N20;
    N22 --> N21;
    N22 -.-> N2;
    N22 -.-> N1;
    N22 -.-> N0;
    N22 -.-> N3;
    N23 --> N13;
    N23 --> N6;
    N23 --> N7;
    N23 --> N8;
    N23 --> N9;
    N23 --> N10;
    N23 --> N11;
    N23 --> N14;
    N23 --> N15;
    N23 --> N16;
    N23 --> N17;
    N23 --> N18;
    N23 --> N19;
    N23 --> N20;
    N23 --> N21;
    N23 --> N22;
    N23 -.-> N2;
    N23 -.-> N1;
    N23 -.-> N0;
    N23 -.-> N3;
    N24 --> N13;
    N24 --> N6;
    N24 --> N7;
    N24 --> N8;
    N24 --> N9;
    N24 --> N10;
    N24 --> N11;
    N24 --> N14;
    N24 --> N15;
    N24 --> N16;
    N24 --> N17;
    N24 --> N18;
    N24 --> N19;
    N24 --> N20;
    N24 --> N21;
    N24 --> N22;
    N24 --> N23;
    N24 -.-> N2;
    N24 -.-> N1;
    N24 -.-> N0;
    N24 -.-> N3;
    N25 --> N13;
    N25 --> N6;
    N25 --> N7;
    N25 --> N8;
    N25 --> N9;
    N25 --> N10;
    N25 --> N11;
    N25 --> N14;
    N25 --> N15;
    N25 --> N16;
    N25 --> N17;
    N25 --> N18;
    N25 --> N19;
    N25 --> N20;
    N25 --> N21;
    N25 --> N22;
    N25 --> N23;
    N25 --> N24;
    N25 -.-> N2;
    N25 -.-> N1;
    N25 -.-> N0;
    N25 -.-> N3;
    N26 --> N13;
    N26 --> N6;
    N26 --> N7;
    N26 --> N8;
    N26 --> N9;
    N26 --> N10;
    N26 --> N11;
    N26 --> N14;
    N26 --> N15;
    N26 --> N16;
    N26 --> N17;
    N26 --> N18;
    N26 --> N19;
    N26 --> N20;
    N26 --> N21;
    N26 --> N22;
    N26 --> N23;
    N26 --> N24;
    N26 --> N25;
    N26 -.-> N2;
    N26 -.-> N1;
    N26 -.-> N0;
    N26 -.-> N3;
    N27 --> N13;
    N27 --> N6;
    N27 --> N7;
    N27 --> N8;
    N27 --> N9;
    N27 --> N10;
    N27 --> N11;
    N27 --> N14;
    N27 --> N15;
    N27 --> N16;
    N27 --> N17;
    N27 --> N18;
    N27 --> N19;
    N27 --> N20;
    N27 --> N21;
    N27 --> N22;
    N27 --> N23;
    N27 --> N24;
    N27 --> N25;
    N27 --> N26;
    N27 -.-> N2;
    N27 -.-> N1;
    N27 -.-> N0;
    N27 -.-> N3;
    N28 --> N13;
    N28 --> N6;
    N28 --> N7;
    N28 --> N8;
    N28 --> N9;
    N28 --> N10;
    N28 --> N11;
    N28 --> N14;
    N28 --> N15;
    N28 --> N16;
    N28 --> N17;
    N28 --> N18;
    N28 --> N19;
    N28 --> N20;
    N28 --> N21;
    N28 --> N22;
    N28 --> N23;
    N28 --> N24;
    N28 --> N25;
    N28 --> N26;
    N28 --> N27;
    N28 -.-> N2;
    N28 -.-> N1;
    N28 -.-> N0;
    N28 -.-> N3;
    N29 --> N13;
    N29 --> N6;
    N29 --> N7;
    N29 --> N8;
    N29 --> N9;
    N29 --> N10;
    N29 --> N11;
    N29 --> N14;
    N29 --> N15;
    N29 --> N16;
    N29 --> N17;
    N29 --> N18;
    N29 --> N19;
    N29 --> N20;
    N29 --> N21;
    N29 --> N22;
    N29 --> N23;
    N29 --> N24;
    N29 --> N25;
    N29 --> N26;
    N29 --> N27;
    N29 --> N28;
    N29 -.-> N2;
    N29 -.-> N1;
    N29 -.-> N0;
    N29 -.-> N3;
    N5 --> N3;
    N12 --> N11;
    N12 --> N10;
    N3 --> N2;
    N3 --> N1;
    N4 --> N0;
    N4 --> N3;
    N30 --> N6;
    N30 --> N7;
    N30 --> N8;
    N30 --> N9;
    N30 --> N10;
    N30 --> N11;
    N30 --> N13;
    N30 --> N14;
    N30 --> N15;
    N30 --> N16;
    N30 --> N17;
    N30 --> N18;
    N30 --> N19;
    N30 --> N20;
    N30 --> N21;
    N30 --> N22;
    N30 --> N23;
    N30 --> N24;
    N30 --> N25;
    N30 --> N26;
    N30 --> N27;
    N30 --> N28;
    N30 --> N29;
```
# Entrypoints

```
{
    ModuleEvaluation: 30,
    Export(
        "IPC",
    ): 12,
    Exports: 31,
    Export(
        "structuredError",
    ): 5,
}
```


# Modules (dev)
## Part 0
```js
import { createConnection } from "node:net";
export { createConnection } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
import { parse as parseStackTrace } from "../compiled/stacktrace-parser";
export { parseStackTrace } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
import { getProperError } from "./error";
export { getProperError } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import { parseStackTrace } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import { getProperError } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
function structuredError(e) {
    e = getProperError(e);
    return {
        name: e.name,
        message: e.message,
        stack: typeof e.stack === "string" ? parseStackTrace(e.stack) : []
    };
}
export { structuredError } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import { structuredError } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import { createConnection } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
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
export { createIpc } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import { structuredError } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
export { structuredError };

```
## Part 6
```js
import "node:net";

```
## Part 7
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "../compiled/stacktrace-parser";

```
## Part 8
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "./error";

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
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
const PORT = process.argv[2];
export { PORT } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 10
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
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
    __turbopack_part__: 2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import { createIpc } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { PORT } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
const IPC = createIpc(parseInt(PORT, 10));
export { IPC } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 11
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
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
    __turbopack_part__: 2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import { IPC } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
process.on("uncaughtException", (err)=>{
    IPC.sendError(err);
});

```
## Part 12
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import { IPC } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
export { IPC };

```
## Part 13
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
    __turbopack_part__: 2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
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
export { improveConsole } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 14
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
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
    __turbopack_part__: 2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import { improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
improveConsole("error", "stderr", true);

```
## Part 15
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
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
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import { improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
improveConsole("warn", "stderr", true);

```
## Part 16
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
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
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 15
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import { improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
improveConsole("count", "stdout", true);

```
## Part 17
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
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
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 15
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import { improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
improveConsole("trace", "stderr", false);

```
## Part 18
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
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
    __turbopack_part__: 2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import { improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
improveConsole("log", "stdout", true);

```
## Part 19
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
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
    __turbopack_part__: 2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import { improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
improveConsole("group", "stdout", true);

```
## Part 20
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
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
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import { improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
improveConsole("groupCollapsed", "stdout", true);

```
## Part 21
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
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
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import { improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
improveConsole("table", "stdout", true);

```
## Part 22
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
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
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 21
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import { improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
improveConsole("debug", "stdout", true);

```
## Part 23
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
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
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 21
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 22
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import { improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
improveConsole("info", "stdout", true);

```
## Part 24
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
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
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 21
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 22
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 23
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import { improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
improveConsole("dir", "stdout", true);

```
## Part 25
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
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
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 21
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 22
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 23
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 24
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import { improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
improveConsole("dirxml", "stdout", true);

```
## Part 26
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
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
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 21
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 22
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 23
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 24
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 25
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import { improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
improveConsole("timeEnd", "stdout", true);

```
## Part 27
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
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
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 21
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 22
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 23
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 24
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 25
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 26
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import { improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
improveConsole("timeLog", "stdout", true);

```
## Part 28
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
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
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 21
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 22
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 23
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 24
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 25
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 26
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 27
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import { improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
improveConsole("timeStamp", "stdout", true);

```
## Part 29
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
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
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 21
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 22
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 23
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 24
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 25
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 26
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 27
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 28
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import { improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
improveConsole("assert", "stderr", true);

```
## Part 30
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
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 21
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 22
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 23
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 24
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 25
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 26
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 27
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 28
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 29
};
"module evaluation";

```
## Part 31
```js
export { structuredError } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export structuredError"
};
export { IPC } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export IPC"
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
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 21
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 22
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 23
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 24
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 25
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 26
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 27
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 28
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 29
};
"module evaluation";

```
# Entrypoints

```
{
    ModuleEvaluation: 30,
    Export(
        "IPC",
    ): 12,
    Exports: 31,
    Export(
        "structuredError",
    ): 4,
}
```


# Modules (prod)
## Part 0
```js
import { createConnection } from "node:net";
export { createConnection } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
import { parse as parseStackTrace } from "../compiled/stacktrace-parser";
export { parseStackTrace } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
import { getProperError } from "./error";
export { getProperError } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import { parseStackTrace } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import { getProperError } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
function structuredError(e) {
    e = getProperError(e);
    return {
        name: e.name,
        message: e.message,
        stack: typeof e.stack === "string" ? parseStackTrace(e.stack) : []
    };
}
export { structuredError } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import { structuredError } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
export { structuredError };

```
## Part 5
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { structuredError } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import { createConnection } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
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
export { createIpc } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 6
```js
import "node:net";

```
## Part 7
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "../compiled/stacktrace-parser";

```
## Part 8
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "./error";

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
const PORT = process.argv[2];
export { PORT } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 10
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
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
import { createIpc } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import { PORT } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
const IPC = createIpc(parseInt(PORT, 10));
export { IPC } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 11
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
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
import { IPC } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
process.on("uncaughtException", (err)=>{
    IPC.sendError(err);
});

```
## Part 12
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import { IPC } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
export { IPC };

```
## Part 13
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
export { improveConsole } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 14
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
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
import { improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
improveConsole("error", "stderr", true);

```
## Part 15
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
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
    __turbopack_part__: 14
};
import { improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
improveConsole("warn", "stderr", true);

```
## Part 16
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
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
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 15
};
import { improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
improveConsole("count", "stdout", true);

```
## Part 17
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
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
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 15
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
import { improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
improveConsole("trace", "stderr", false);

```
## Part 18
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
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
import { improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
improveConsole("log", "stdout", true);

```
## Part 19
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
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
import { improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
improveConsole("group", "stdout", true);

```
## Part 20
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
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
import { improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
improveConsole("groupCollapsed", "stdout", true);

```
## Part 21
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
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
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
import { improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
improveConsole("table", "stdout", true);

```
## Part 22
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
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
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 21
};
import { improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
improveConsole("debug", "stdout", true);

```
## Part 23
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
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
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 21
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 22
};
import { improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
improveConsole("info", "stdout", true);

```
## Part 24
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
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
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 21
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 22
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 23
};
import { improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
improveConsole("dir", "stdout", true);

```
## Part 25
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
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
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 21
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 22
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 23
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 24
};
import { improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
improveConsole("dirxml", "stdout", true);

```
## Part 26
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
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
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 21
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 22
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 23
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 24
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 25
};
import { improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
improveConsole("timeEnd", "stdout", true);

```
## Part 27
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
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
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 21
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 22
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 23
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 24
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 25
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 26
};
import { improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
improveConsole("timeLog", "stdout", true);

```
## Part 28
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 15
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 25
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 26
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 27
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 24
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 21
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 22
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 23
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
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
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
import { improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
improveConsole("timeStamp", "stdout", true);

```
## Part 29
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 28
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 27
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 24
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 25
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 26
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 23
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 21
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 22
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 19
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
    __turbopack_part__: 15
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
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
    __turbopack_part__: 13
};
import { improveConsole } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
improveConsole("assert", "stderr", true);

```
## Part 30
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 27
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 28
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 29
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 26
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 23
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 24
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 25
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 22
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 19
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 21
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 18
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
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
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
"module evaluation";

```
## Part 31
```js
export { structuredError } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export structuredError"
};
export { IPC } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export IPC"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 27
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 28
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 29
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 26
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 23
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 24
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 25
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 22
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 19
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 20
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 21
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 18
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
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
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
"module evaluation";

```
