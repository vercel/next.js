import { IncomingMessage, ServerResponse, IncomingHttpHeaders } from 'http';
import { Headers, ReadableStream as ReadableStream$1, Request, FetchEvent, Response } from '@edge-runtime/primitives';
import { OutgoingHttpHeaders, ServerResponse as ServerResponse$1, IncomingMessage as IncomingMessage$1 } from 'node:http';
import { Readable } from 'node:stream';
import * as _edge_runtime_primitives_types_events from '@edge-runtime/primitives/types/events';

interface BuildDependencies {
    Headers: typeof Headers;
    ReadableStream: typeof ReadableStream$1;
    Request: typeof Request;
    Uint8Array: typeof Uint8Array;
    FetchEvent: typeof FetchEvent;
}
interface RequestOptions {
    defaultOrigin: string;
}
type NodeHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void> | void;
type WebHandler = (req: Request, event: FetchEvent) => Promise<Response> | Response | null | undefined;

declare function buildToNodeHandler(dependencies: BuildDependencies, options: RequestOptions): (webHandler: WebHandler) => NodeHandler;

declare function toOutgoingHeaders(headers?: Headers & {
    raw?: () => Record<string, string>;
}): OutgoingHttpHeaders;
declare function mergeIntoServerResponse(headers: OutgoingHttpHeaders, serverResponse: ServerResponse$1): void;

interface FromWebOptions {
    objectMode?: boolean;
    highWaterMark?: number;
    encoding?: BufferEncoding;
    signal?: AbortSignal;
}
/**
 * Code adapted from Node's stream.Readable.fromWeb(), because it has to run on Node@14
 * @see https://github.com/nodejs/node/blob/bd462ad81bc30e547e52e699ee3b6fa3d7c882c9/lib/internal/webstreams/adapters.js#L458
 */
declare function toToReadable(webStream: ReadableStream, options?: FromWebOptions): Readable;

declare function buildToFetchEvent(dependencies: BuildDependencies): (request: Request) => _edge_runtime_primitives_types_events.FetchEvent;

interface Dependencies$1 {
    Headers: typeof Headers;
}
declare function buildToHeaders({ Headers }: Dependencies$1): (nodeHeaders: IncomingHttpHeaders) => Headers;

declare function buildToRequest(dependencies: BuildDependencies): (request: IncomingMessage$1, options: RequestOptions) => Request;

interface Dependencies {
    ReadableStream: typeof ReadableStream;
    Uint8Array: typeof Uint8Array;
}
declare function buildToReadableStream(dependencies: Dependencies): (stream: Readable) => ReadableStream<any>;

export { BuildDependencies, NodeHandler, RequestOptions, WebHandler, buildToFetchEvent, buildToHeaders, buildToNodeHandler, buildToReadableStream, buildToRequest, mergeIntoServerResponse, toOutgoingHeaders, toToReadable };
