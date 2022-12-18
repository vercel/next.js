import { IPC, Ipc } from "./index";

type IpcIncomingMessage = {
  type: "evaluate";
  filepath: string;
  arguments: string[];
};

type IpcOutgoingMessage = {
  type: "jsonValue";
  data: string;
};

const ipc = IPC as Ipc<IpcIncomingMessage, IpcOutgoingMessage>;

export const run = (getValue: () => any) => {
  (async () => {
    while (true) {
      const msg = await ipc.recv();

      switch (msg.type) {
        case "evaluate": {
          const value = await getValue();
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
  })().catch((err) => {
    ipc.sendError(err);
  });
};
