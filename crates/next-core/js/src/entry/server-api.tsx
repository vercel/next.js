import IPC, { Ipc } from "@vercel/turbopack-next/internal/ipc";

import type { ClientRequest, IncomingMessage, Server } from "node:http";
import http, { ServerResponse } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { Buffer } from "node:buffer";

import "next/dist/server/node-polyfill-fetch.js";

import * as allExports from ".";
import { NextParsedUrlQuery } from "next/dist/server/request-meta";
import { apiResolver } from "next/dist/server/api-utils/node";

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

type RenderData = {
  method: string;
  params: Record<string, string>;
  path: string;
  query: NextParsedUrlQuery;
};

type ResponseHeaders = {
  status: number;
  headers: string[];
};

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

type Operation = {
  clientRequest: ClientRequest;
  clientResponsePromise: Promise<IncomingMessage>;
  apiOperation: Promise<void>;
  server: Server;
};

async function createOperation(renderData: RenderData): Promise<Operation> {
  const server = await createServer();

  const {
    clientRequest,
    clientResponsePromise,
    serverRequest,
    serverResponse,
  } = await makeRequest(server, renderData.method, renderData.path);

  const query = { ...renderData.query, ...renderData.params };

  return {
    clientRequest,
    server,
    clientResponsePromise,
    apiOperation: apiResolver(
      serverRequest,
      serverResponse,
      query,
      allExports,
      {
        previewModeId: "",
        previewModeEncryptionKey: "",
        previewModeSigningKey: "",
      },
      false,
      true,
      renderData.path
    ),
  };
}

function handleClientResponse(server: Server, clientResponse: IncomingMessage) {
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

/**
 * Creates a server that listens a random port.
 */
function createServer(): Promise<Server> {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.listen(0, () => {
      resolve(server);
    });
  });
}

/**
 * Creates a request to a server, and returns the (req, res) pairs from both
 * the client's and server's perspective.
 */
function makeRequest(
  server: Server,
  method: string,
  path: string
): Promise<{
  clientRequest: ClientRequest;
  clientResponsePromise: Promise<IncomingMessage>;
  serverRequest: IncomingMessage;
  serverResponse: ServerResponse<IncomingMessage>;
}> {
  return new Promise((resolve, reject) => {
    let clientRequest: ClientRequest | null = null;
    let clientResponseResolve: (value: IncomingMessage) => void;
    let clientResponseReject: (error: Error) => void;
    const clientResponsePromise = new Promise<IncomingMessage>(
      (resolve, reject) => {
        clientResponseResolve = resolve;
        clientResponseReject = reject;
      }
    );
    let serverRequest: IncomingMessage | null = null;
    let serverResponse: ServerResponse<IncomingMessage> | null = null;

    const maybeResolve = () => {
      if (
        clientRequest != null &&
        serverRequest != null &&
        serverResponse != null
      ) {
        cleanup();
        resolve({
          clientRequest,
          clientResponsePromise,
          serverRequest,
          serverResponse,
        });
      }
    };

    const cleanup = () => {
      server.removeListener("error", errorListener);
      server.removeListener("request", requestListener);
    };

    const errorListener = (err: Error) => {
      cleanup();
      reject(err);
    };

    const requestListener = (
      req: IncomingMessage,
      res: ServerResponse<IncomingMessage>
    ) => {
      serverRequest = req;
      serverResponse = res;
      maybeResolve();
    };

    const cleanupClientResponse = () => {
      if (clientRequest != null) {
        clientRequest.removeListener("response", responseListener);
        clientRequest.removeListener("error", clientResponseErrorListener);
      }
    };

    const clientResponseErrorListener = (err: Error) => {
      cleanupClientResponse();
      clientResponseReject(err);
    };

    const responseListener = (res: IncomingMessage) => {
      cleanupClientResponse();
      clientResponseResolve(res);
    };

    server.once("request", requestListener);
    server.once("error", errorListener);

    const address = server.address() as AddressInfo;

    clientRequest = http.request({
      method,
      path,
      host: "localhost",
      port: address.port,
    });
    // Otherwise Node.js waits for the first chunk of data to be written before sending the request.
    clientRequest.flushHeaders();

    clientRequest.once("response", responseListener);
    clientRequest.once("error", clientResponseErrorListener);
  });
}
