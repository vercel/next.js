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
        const value = await Promise.resolve()
          .then(() => getValue(...msg.args))
          .catch((err: Error) => {
            // sendError will exit the process
            return ipc.sendError(err);
          });
        await ipc.send({
          type: "jsonValue",
          data: JSON.stringify(value),
        });
        break;
      }
      default: {
        console.error("unexpected message type", msg.type);
        process.exit(1);
      }
    }
  }
};
