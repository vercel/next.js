import { IPC } from "./index";
import type { Ipc as GenericIpc } from "./index";

type IpcIncomingMessage =
  | {
      type: "evaluate";
      args: string[];
    }
  | {
      type: "result";
      id: number;
      error: string | null;
      data: any | null;
    };

type IpcOutgoingMessage =
  | {
      type: "end";
      data: string | undefined;
      duration: number;
    }
  | {
      type: "info";
      data: any;
    }
  | {
      type: "request";
      id: number;
      data: any;
    };

export type Ipc<IM, RM> = {
  sendInfo(message: IM): Promise<void>;
  sendRequest(message: RM): Promise<unknown>;
  sendError(error: Error): Promise<never>;
};
const ipc = IPC as GenericIpc<IpcIncomingMessage, IpcOutgoingMessage>;

const queue: string[][] = [];

export const run = async (
  moduleFactory: () => Promise<{
    init?: () => Promise<void>;
    default: (ipc: Ipc<any, any>, ...deserializedArgs: any[]) => any;
  }>
) => {
  let nextId = 1;
  const requests = new Map();
  const internalIpc = {
    sendInfo: (message: any) =>
      ipc.send({
        type: "info",
        data: message,
      }),
    sendRequest: (message: any) => {
      const id = nextId++;
      let resolve, reject;
      const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });
      requests.set(id, { resolve, reject });
      return ipc
        .send({ type: "request", id, data: message })
        .then(() => promise);
    },
    sendError: (error: Error) => {
      return ipc.sendError(error);
    },
  };

  // Initialize module and send ready message
  let getValue: (ipc: Ipc<any, any>, ...deserializedArgs: any[]) => any;
  try {
    const module = await moduleFactory();
    if (typeof module.init === "function") {
      await module.init();
    }
    getValue = module.default;
    await ipc.sendReady();
  } catch (err) {
    await ipc.sendReady();
    await ipc.sendError(err as Error);
  }

  // Queue handling
  let isRunning = false;
  const run = async () => {
    while (queue.length > 0) {
      const args = queue.shift()!;
      try {
        const value = await getValue(internalIpc, ...args);
        await ipc.send({
          type: "end",
          data:
            value === undefined ? undefined : JSON.stringify(value, null, 2),
          duration: 0,
        });
      } catch (e) {
        await ipc.sendError(e as Error);
      }
    }
    isRunning = false;
  };

  // Communication handling
  while (true) {
    const msg = await ipc.recv();

    switch (msg.type) {
      case "evaluate": {
        queue.push(msg.args);
        if (!isRunning) {
          isRunning = true;
          run();
        }
        break;
      }
      case "result": {
        const request = requests.get(msg.id);
        if (request) {
          requests.delete(msg.id);
          if (msg.error) {
            request.reject(new Error(msg.error));
          } else {
            request.resolve(msg.data);
          }
        }
        break;
      }
      default: {
        console.error("unexpected message type", (msg as any).type);
        process.exit(1);
      }
    }
  }
};

export type { IpcIncomingMessage, IpcOutgoingMessage };
