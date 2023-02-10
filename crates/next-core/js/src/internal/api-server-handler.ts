// IPC need to be the first import to allow it to catch errors happening during
// the other imports
import { IPC } from "@vercel/turbopack-next/ipc/index";

import type { RenderData } from "types/turbopack";
import type { Ipc } from "@vercel/turbopack-next/ipc/index";
import type { ClientRequest, IncomingMessage, Server } from "node:http";
import type { ServerResponse } from "node:http";
import { createServer, makeRequest } from "@vercel/turbopack-next/ipc/server";
import { Buffer } from "node:buffer";

const ipc = IPC as Ipc<IpcIncomingMessage, IpcOutgoingMessage>;

type IpcIncomingMessage =
  | {
      type: "headers";
      data: RenderData;
    }
  | {
      type: "bodyChunk";
      data: Array<number>;
    }
  | { type: "bodyEnd" };

type IpcOutgoingMessage =
  | {
      type: "headers";
      data: ResponseHeaders;
    }
  | {
      type: "body";
      data: Array<number>;
    };

type ResponseHeaders = {
  status: number;
  headers: string[];
};

type Handler = (data: {
  request: IncomingMessage;
  response: ServerResponse<IncomingMessage>;
  query: string;
  params: Record<string, string>;
  path: string;
}) => Promise<void>;

type Operation = {
  clientRequest: ClientRequest;
  clientResponsePromise: Promise<IncomingMessage>;
  apiOperation: Promise<void>;
  server: Server;
};

export default function startHandler(handler: Handler): void {
  (async () => {
    while (true) {
      let operationPromise: Promise<Operation> | null = null;

      const msg = await ipc.recv();

      switch (msg.type) {
        case "headers": {
          operationPromise = createOperation(msg.data);
          break;
        }
        default: {
          console.error("unexpected message type", msg.type);
          process.exit(1);
        }
      }

      let body = Buffer.alloc(0);
      let operation: Operation;
      loop: while (true) {
        const msg = await ipc.recv();

        switch (msg.type) {
          case "bodyChunk": {
            body = Buffer.concat([body, Buffer.from(msg.data)]);
            break;
          }
          case "bodyEnd": {
            operation = await operationPromise;
            break loop;
          }
          default: {
            console.error("unexpected message type", msg.type);
            process.exit(1);
          }
        }
      }

      await Promise.all([
        endOperation(operation, body),
        operation.clientResponsePromise.then((clientResponse) =>
          handleClientResponse(operation.server, clientResponse)
        ),
      ]);
    }
  })().catch((err) => {
    ipc.sendError(err);
  });

  async function createOperation(renderData: RenderData): Promise<Operation> {
    const server = await createServer();

    const {
      clientRequest,
      clientResponsePromise,
      serverRequest,
      serverResponse,
    } = await makeRequest(
      server,
      renderData.method,
      renderData.path,
      renderData.rawQuery,
      renderData.rawHeaders
    );

    return {
      clientRequest,
      server,
      clientResponsePromise,
      apiOperation: handler({
        request: serverRequest,
        response: serverResponse,
        query: renderData.rawQuery,
        params: renderData.params,
        path: renderData.path,
      }),
    };
  }

  function handleClientResponse(
    server: Server,
    clientResponse: IncomingMessage
  ) {
    const responseData: Buffer[] = [];
    const responseHeaders: ResponseHeaders = {
      status: clientResponse.statusCode!,
      headers: clientResponse.rawHeaders,
    };

    ipc.send({
      type: "headers",
      data: responseHeaders,
    });

    clientResponse.on("data", (chunk) => {
      responseData.push(chunk);
    });

    clientResponse.once("end", () => {
      ipc.send({
        type: "body",
        data: Buffer.concat(responseData).toJSON().data,
      });
      server.close();
    });

    clientResponse.once("error", (err) => {
      ipc.sendError(err);
    });
  }

  /**
   * Ends an operation by writing the response body to the client and waiting for the Next.js API resolver to finish.
   */
  async function endOperation(operation: Operation, body: Buffer) {
    operation.clientRequest.end(body);

    try {
      await operation.apiOperation;
    } catch (error) {
      if (error instanceof Error) {
        await ipc.sendError(error);
      } else {
        await ipc.sendError(new Error("an unknown error occurred"));
      }

      return;
    }
  }
}
