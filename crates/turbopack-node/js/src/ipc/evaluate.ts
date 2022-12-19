import { IPC, Ipc } from "./index";

type IpcIncomingMessage = {
  type: "evaluate";
  args: string[];
};

type IpcOutgoingMessage = {
  type: "jsonValue";
  data: string;
};

const ipc = IPC as Ipc<IpcIncomingMessage, IpcOutgoingMessage>;

export const run = async (getValue: (...deserializedArgs: any[]) => any) => {
  while (true) {
    const msg = await ipc.recv();

    switch (msg.type) {
      case "evaluate": {
        try {
          const value = await getValue(...msg.args);
          await ipc.send({
            type: "jsonValue",
            data: JSON.stringify(value),
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
