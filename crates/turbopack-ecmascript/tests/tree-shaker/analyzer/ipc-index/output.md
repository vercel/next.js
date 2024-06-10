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
- Reads (eventual): `IPC`
- Write (eventual): `IPC`

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
    Item11 --> Item1;
    Item11 --> Item2;
    Item11 --> Item3;
    Item11 --> Item9;
    Item11 --> Item10;
    Item11 -.-> Item6;
    Item11 -.-> Item5;
    Item11 -.-> Item4;
    Item11 -.-> Item7;
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
    Item11 --> Item1;
    Item11 --> Item2;
    Item11 --> Item3;
    Item11 --> Item9;
    Item11 --> Item10;
    Item11 -.-> Item6;
    Item11 -.-> Item5;
    Item11 -.-> Item4;
    Item11 -.-> Item7;
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
    Item11 --> Item1;
    Item11 --> Item2;
    Item11 --> Item3;
    Item11 --> Item9;
    Item11 --> Item10;
    Item11 -.-> Item6;
    Item11 -.-> Item5;
    Item11 -.-> Item4;
    Item11 -.-> Item7;
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
    Item30 --> Item7;
    Item31 --> Item10;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(ModuleEvaluation), ItemId(0, ImportBinding(0)), ItemId(1, ImportBinding(0)), ItemId(2, ImportBinding(0)), ItemId(7, Normal), ItemId(8, VarDeclarator(0)), ItemId(9, Normal), ItemId(10, Normal), ItemId(11, Normal), ItemId(12, Normal), ItemId(13, Normal), ItemId(14, Normal), ItemId(15, Normal), ItemId(16, Normal), ItemId(17, Normal), ItemId(18, Normal), ItemId(19, Normal), ItemId(20, Normal), ItemId(21, Normal), ItemId(22, Normal), ItemId(23, Normal), ItemId(24, Normal)]"];
    N1["Items: [ItemId(Export((&quot;structuredError&quot;, #2), &quot;structuredError&quot;))]"];
    N2["Items: [ItemId(Export((&quot;IPC&quot;, #2), &quot;IPC&quot;))]"];
    N3["Items: [ItemId(0, ImportOfModule)]"];
    N4["Items: [ItemId(1, ImportOfModule)]"];
    N5["Items: [ItemId(2, ImportOfModule)]"];
    N6["Items: [ItemId(1, ImportBinding(0)), ItemId(2, ImportBinding(0)), ItemId(3, Normal)]"];
    N7["Items: [ItemId(0, ImportBinding(0)), ItemId(4, Normal)]"];
    N8["Items: [ItemId(0, ImportBinding(0)), ItemId(1, ImportBinding(0)), ItemId(2, ImportBinding(0)), ItemId(5, VarDeclarator(0))]"];
    N9["Items: [ItemId(0, ImportBinding(0)), ItemId(1, ImportBinding(0)), ItemId(2, ImportBinding(0)), ItemId(6, VarDeclarator(0))]"];
    N0 --> N3;
    N0 --> N4;
    N0 --> N5;
    N0 --> N8;
    N0 --> N9;
    N0 --> N6;
    N1 --> N6;
    N2 --> N9;
    N4 --> N3;
    N5 --> N3;
    N5 --> N4;
    N6 --> N9;
    N7 --> N9;
    N7 --> N6;
    N8 --> N3;
    N8 --> N4;
    N8 --> N5;
    N8 --> N9;
    N8 --> N6;
    N9 --> N7;
    N9 --> N8;
    N9 --> N3;
    N9 --> N4;
    N9 --> N5;
    N9 --> N6;
```
# Entrypoints

```
{
    ModuleEvaluation: 0,
    Export(
        "structuredError",
    ): 1,
    Export(
        "IPC",
    ): 2,
}
```


# Modules (dev)
## Part 0
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import { IPC } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
"module evaluation";
import { createConnection } from "node:net";
import { parse as parseStackTrace } from "../compiled/stacktrace-parser";
import { getProperError } from "./error";
process.on("uncaughtException", (err)=>{
    IPC.sendError(err);
});
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
improveConsole("error", "stderr", true);
improveConsole("warn", "stderr", true);
improveConsole("count", "stdout", true);
improveConsole("trace", "stderr", false);
improveConsole("log", "stdout", true);
improveConsole("group", "stdout", true);
improveConsole("groupCollapsed", "stdout", true);
improveConsole("table", "stdout", true);
improveConsole("debug", "stdout", true);
improveConsole("info", "stdout", true);
improveConsole("dir", "stdout", true);
improveConsole("dirxml", "stdout", true);
improveConsole("timeEnd", "stdout", true);
improveConsole("timeLog", "stdout", true);
improveConsole("timeStamp", "stdout", true);
improveConsole("assert", "stderr", true);
export { improveConsole } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
import { structuredError } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
export { structuredError };

```
## Part 2
```js
import { IPC } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
export { IPC };

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
import "../compiled/stacktrace-parser";

```
## Part 5
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "./error";

```
## Part 6
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import { parse as parseStackTrace } from "../compiled/stacktrace-parser";
import { getProperError } from "./error";
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
## Part 7
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import { structuredError } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import { createConnection } from "node:net";
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
## Part 8
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import { createConnection } from "node:net";
import { parse as parseStackTrace } from "../compiled/stacktrace-parser";
import { getProperError } from "./error";
const PORT = process.argv[2];
export { PORT } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 9
```js
import { createIpc } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import { PORT } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import { createConnection } from "node:net";
import { parse as parseStackTrace } from "../compiled/stacktrace-parser";
import { getProperError } from "./error";
const IPC = createIpc(parseInt(PORT, 10));
export { IPC } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import { IPC } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import { createConnection } from "node:net";
import { parse as parseStackTrace } from "../compiled/stacktrace-parser";
import { getProperError } from "./error";
"module evaluation";
process.on("uncaughtException", (err)=>{
    IPC.sendError(err);
});
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
improveConsole("error", "stderr", true);
improveConsole("warn", "stderr", true);
improveConsole("count", "stdout", true);
improveConsole("trace", "stderr", false);
improveConsole("log", "stdout", true);
improveConsole("group", "stdout", true);
improveConsole("groupCollapsed", "stdout", true);
improveConsole("table", "stdout", true);
improveConsole("debug", "stdout", true);
improveConsole("info", "stdout", true);
improveConsole("dir", "stdout", true);
improveConsole("dirxml", "stdout", true);
improveConsole("timeEnd", "stdout", true);
improveConsole("timeLog", "stdout", true);
improveConsole("timeStamp", "stdout", true);
improveConsole("assert", "stderr", true);
export { improveConsole } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
# Entrypoints

```
{
    ModuleEvaluation: 0,
    Export(
        "structuredError",
    ): 1,
    Export(
        "IPC",
    ): 2,
}
```


# Modules (prod)
## Part 0
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import { IPC } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
"module evaluation";
process.on("uncaughtException", (err)=>{
    IPC.sendError(err);
});
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
improveConsole("error", "stderr", true);
improveConsole("warn", "stderr", true);
improveConsole("count", "stdout", true);
improveConsole("trace", "stderr", false);
improveConsole("log", "stdout", true);
improveConsole("group", "stdout", true);
improveConsole("groupCollapsed", "stdout", true);
improveConsole("table", "stdout", true);
improveConsole("debug", "stdout", true);
improveConsole("info", "stdout", true);
improveConsole("dir", "stdout", true);
improveConsole("dirxml", "stdout", true);
improveConsole("timeEnd", "stdout", true);
improveConsole("timeLog", "stdout", true);
improveConsole("timeStamp", "stdout", true);
improveConsole("assert", "stderr", true);
export { improveConsole } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
import { structuredError } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
export { structuredError };

```
## Part 2
```js
import { IPC } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
export { IPC };

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
import "../compiled/stacktrace-parser";

```
## Part 5
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "./error";

```
## Part 6
```js
import { parse as parseStackTrace } from "../compiled/stacktrace-parser";
import { getProperError } from "./error";
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
## Part 7
```js
import { structuredError } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import { createConnection } from "node:net";
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
## Part 8
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
const PORT = process.argv[2];
export { PORT } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 9
```js
import { createIpc } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import { PORT } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
const IPC = createIpc(parseInt(PORT, 10));
export { IPC } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import { IPC } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
"module evaluation";
process.on("uncaughtException", (err)=>{
    IPC.sendError(err);
});
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
improveConsole("error", "stderr", true);
improveConsole("warn", "stderr", true);
improveConsole("count", "stdout", true);
improveConsole("trace", "stderr", false);
improveConsole("log", "stdout", true);
improveConsole("group", "stdout", true);
improveConsole("groupCollapsed", "stdout", true);
improveConsole("table", "stdout", true);
improveConsole("debug", "stdout", true);
improveConsole("info", "stdout", true);
improveConsole("dir", "stdout", true);
improveConsole("dirxml", "stdout", true);
improveConsole("timeEnd", "stdout", true);
improveConsole("timeLog", "stdout", true);
improveConsole("timeStamp", "stdout", true);
improveConsole("assert", "stderr", true);
export { improveConsole } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
