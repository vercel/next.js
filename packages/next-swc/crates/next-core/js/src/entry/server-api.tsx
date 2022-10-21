import type { ClientRequest, IncomingMessage, Server } from "node:http";
import http, { ServerResponse } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { Buffer } from "node:buffer";

import "next/dist/server/node-polyfill-fetch.js";

import * as allExports from ".";
import { NextParsedUrlQuery } from "next/dist/server/request-meta";
import { apiResolver } from "next/dist/server/api-utils/node";

const [MARKER, OPERATION_STEP, OPERATION_SUCCESS, OPERATION_ERROR] =
  process.argv.slice(2, 6).map((arg) => Buffer.from(arg, "utf8"));

const NEW_LINE = "\n".charCodeAt(0);
const OPERATION_STEP_MARKER = Buffer.concat([
  OPERATION_STEP,
  Buffer.from(" ", "utf8"),
  MARKER,
]);
const OPERATION_SUCCESS_MARKER = Buffer.concat([
  OPERATION_SUCCESS,
  Buffer.from(" ", "utf8"),
  MARKER,
]);
const OPERATION_ERROR_MARKER = Buffer.concat([
  OPERATION_ERROR,
  Buffer.from(" ", "utf8"),
  MARKER,
]);

process.stdout.write("READY\n");

function bufferEndsWith(buffer: Buffer, suffix: Buffer): boolean {
  if (buffer.length < suffix.length) {
    return false;
  }

  return buffer.subarray(buffer.length - suffix.length).equals(suffix);
}

function readStep(buffer: Buffer): { data: Buffer; remaining: Buffer } | null {
  let startLineIdx = 0;
  let endLineIdx = buffer.indexOf(NEW_LINE);

  while (endLineIdx !== -1) {
    let considering = buffer.subarray(startLineIdx, endLineIdx);
    if (considering.equals(OPERATION_STEP_MARKER)) {
      return {
        data: buffer.subarray(
          0,
          // Remove the newline character right before the marker.
          startLineIdx === 0 ? 0 : startLineIdx - 1
        ),
        remaining: buffer.subarray(endLineIdx + 1),
      };
    }

    // Consider the next line.
    startLineIdx = endLineIdx + 1;
    endLineIdx = buffer.indexOf(NEW_LINE, startLineIdx);
  }

  return null;
}

type State = "headers" | "body" | "done";
let readState: State = "headers";
let buffer: Buffer = Buffer.from([]);
let operationPromise: Promise<Operation> | null = null;

process.stdin.on("data", async (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);

  let step = readStep(buffer);
  while (step != null) {
    switch (readState) {
      case "headers": {
        readState = "body";
        const renderData = JSON.parse(step.data.toString("utf-8"));
        operationPromise = createOperation(renderData);
        break;
      }
      case "body": {
        readState = "headers";
        const body = step.data;
        endOperation(operationPromise!, body);
        break;
      }
    }
    buffer = step.remaining;
    step = readStep(step.remaining);
  }
});

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

function writeEventMarker(eventMarker: Buffer) {
  process.stdout.write("\n");
  process.stdout.write(eventMarker);
  process.stdout.write("\n");
}

function writeStep(data: Buffer | string) {
  process.stdout.write(data);
  writeEventMarker(OPERATION_STEP_MARKER);
}

function writeSuccess(data: Buffer | string) {
  process.stdout.write(data);
  writeEventMarker(OPERATION_SUCCESS_MARKER);
}

function writeError(error: string) {
  process.stdout.write(error);
  writeEventMarker(OPERATION_ERROR_MARKER);
}

type Operation = {
  clientRequest: ClientRequest;
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

  clientResponsePromise.then((clientResponse) =>
    handleClientResponse(server, clientResponse)
  );

  return {
    clientRequest,
    server,
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
  let responseHeaders: ResponseHeaders = {
    status: clientResponse.statusCode!,
    headers: clientResponse.rawHeaders,
  };

  writeStep(JSON.stringify(responseHeaders));

  clientResponse.on("data", (chunk) => {
    responseData.push(chunk);
  });

  clientResponse.once("end", () => {
    writeSuccess(Buffer.concat(responseData));
    server.close();
  });

  clientResponse.once("error", (err) => {
    // TODO(alexkirsz) We need to ensure that we haven't already written an error in `endOperation`.
    writeError(err.stack ?? "an unknown error occurred");
    server.close();
  });
}

/**
 * Ends an operation by writing the response body to the client and waiting for the Next.js API resolver to finish.
 */
async function endOperation(
  operationPromise: Promise<Operation>,
  body: Buffer
) {
  const operation = await operationPromise;

  operation.clientRequest.end(body);

  try {
    await operation.apiOperation;
  } catch (error) {
    if (
      error instanceof Error ||
      (error != null && (error as any).stack != null)
    ) {
      const stack = (error as any).stack as string | null;

      if (stack != null) {
        writeError(stack);
        operation.server.close();
      }
    } else {
      writeError("an unknown error occurred");
      operation.server.close();
    }

    return;
  }
}

/**
 * Creates a server that listens a random port.
 */
function createServer(): Promise<Server> {
  return new Promise((resolve, reject) => {
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
    let clientResponsePromise = new Promise<IncomingMessage>(
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
