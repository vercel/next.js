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

(async () => {
  while (true) {
    const msg = await ipc.recv();

    switch (msg.type) {
      case "evaluate": {
        const { execute } = eval("require")(msg.filepath);
        if (typeof execute !== "function") {
          console.error(
            `Expected ${msg.filepath} to export a function named "execute"`
          );
          process.exit(1);
        }
        const value = await execute.apply(null, msg.arguments);
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
