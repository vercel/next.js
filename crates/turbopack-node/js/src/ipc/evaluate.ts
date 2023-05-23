import { IPC, StructuredError } from "./index";
import type { Ipc as GenericIpc } from "./index";

type IpcIncomingMessage = {
  type: "evaluate";
  args: string[];
};

type IpcOutgoingMessage =
  | {
      type: "value";
      data: string;
    }
  | {
      type: "end";
      data: string | undefined;
    }
  | {
      type: "fileDependency";
      path: string;
    }
  | {
      type: "buildDependency";
      path: string;
    }
  | {
      type: "dirDependency";
      path: string;
      glob: string;
    }
  | {
      type: "emittedError";
      severity: "warning" | "error";
      error: StructuredError;
    };

export type Ipc = GenericIpc<IpcIncomingMessage, IpcOutgoingMessage>;
const ipc = IPC as Ipc;

export const run = async (
  getValue: (ipc: Ipc, ...deserializedArgs: any[]) => any
) => {
  while (true) {
    const msg = await ipc.recv();

    switch (msg.type) {
      case "evaluate": {
        try {
          const value = await getValue(ipc, ...msg.args);
          await ipc.send({
            type: "end",
            data:
              value === undefined ? undefined : JSON.stringify(value, null, 2),
          });
        } catch (e) {
          await ipc.sendError(e as Error);
        }
        break;
      }
      default: {
        console.error("unexpected message type", msg.type);
        process.exit(1);
      }
    }
  }
};

export type { IpcIncomingMessage, IpcOutgoingMessage };
