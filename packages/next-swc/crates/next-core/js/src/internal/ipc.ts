import net from "node:net";

import { structuredError } from "@vercel/turbopack-next/internal/error";

type State =
  | {
      type: "waiting";
    }
  | {
      type: "packet";
      length: number;
    };

export type Ipc<TIncoming, TOutgoing> = {
  recv(): Promise<TIncoming>;
  send(message: TOutgoing): Promise<void>;
  sendError(error: Error): Promise<never>;
};

function createIpc<TIncoming, TOutgoing>(
  port: number
): Ipc<TIncoming, TOutgoing> {
  const socket = net.createConnection(port, "127.0.0.1");
  const packetQueue: Buffer[] = [];
  const recvPromiseResolveQueue: Array<(message: TIncoming) => void> = [];

  function pushPacket(packet: Buffer) {
    const recvPromiseResolve = recvPromiseResolveQueue.shift();
    if (recvPromiseResolve != null) {
      recvPromiseResolve(JSON.parse(packet.toString("utf8")) as TIncoming);
    } else {
      packetQueue.push(packet);
    }
  }

  let state: State = { type: "waiting" };
  let buffer: Buffer = Buffer.alloc(0);
  socket.once("connect", () => {
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);

      loop: while (true) {
        switch (state.type) {
          case "waiting": {
            if (buffer.length >= 4) {
              const length = buffer.readUInt32BE(0);
              buffer = buffer.subarray(4);
              state = { type: "packet", length };
            } else {
              break loop;
            }
            break;
          }
          case "packet": {
            if (buffer.length >= state.length) {
              const packet = buffer.subarray(0, state.length);
              buffer = buffer.subarray(state.length);
              state = { type: "waiting" };
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

  function send(message: any): Promise<void> {
    const packet = Buffer.from(JSON.stringify(message), "utf8");
    const length = Buffer.alloc(4);
    length.writeUInt32BE(packet.length);
    socket.write(length);

    return new Promise((resolve, reject) => {
      socket.write(packet, (err) => {
        if (err != null) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  return {
    async recv() {
      const packet = packetQueue.shift();
      if (packet != null) {
        return JSON.parse(packet.toString("utf8")) as TIncoming;
      }

      const result = await new Promise<TIncoming>((resolve) => {
        recvPromiseResolveQueue.push((result) => {
          resolve(result);
        });
      });

      return result;
    },

    send(message: TOutgoing) {
      return send(message);
    },

    async sendError(error: Error): Promise<never> {
      await send({
        type: "error",
        ...structuredError(error),
      });
      process.exit(1);
    },
  };
}

const PORT = process.argv[2];

const IPC = createIpc<unknown, unknown>(parseInt(PORT, 10));

process.on("uncaughtException", (err) => {
  IPC.sendError(err);
});

export default IPC;
