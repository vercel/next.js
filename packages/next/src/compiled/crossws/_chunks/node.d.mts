import { n as AdapterInstance, r as AdapterOptions, t as Adapter } from "./adapter.mjs";
import { EventEmitter } from "events";
import { Agent, ClientRequest, ClientRequestArgs, IncomingMessage, OutgoingHttpHeaders, Server } from "node:http";
import { Duplex, DuplexOptions } from "node:stream";
import { Server as Server$1 } from "node:https";
import { SecureContextOptions } from "node:tls";
import { URL } from "node:url";
import { ZlibOptions } from "node:zlib";

//#region types/ws.d.ts
type BufferLike = string | Buffer | DataView | number | ArrayBufferView | Uint8Array | ArrayBuffer | SharedArrayBuffer | readonly any[] | readonly number[] | {
  valueOf(): ArrayBuffer;
} | {
  valueOf(): SharedArrayBuffer;
} | {
  valueOf(): Uint8Array;
} | {
  valueOf(): readonly number[];
} | {
  valueOf(): string;
} | {
  [Symbol.toPrimitive](hint: string): string;
};
declare class WebSocket extends EventEmitter {
  static readonly createWebSocketStream: typeof createWebSocketStream;
  static readonly WebSocketServer: WebSocketServer;
  static readonly Server: typeof Server$2;
  static readonly WebSocket: typeof WebSocket;
  /** The connection is not yet open. */
  static readonly CONNECTING: 0;
  /** The connection is open and ready to communicate. */
  static readonly OPEN: 1;
  /** The connection is in the process of closing. */
  static readonly CLOSING: 2;
  /** The connection is closed. */
  static readonly CLOSED: 3;
  binaryType: "nodebuffer" | "arraybuffer" | "fragments";
  readonly bufferedAmount: number;
  readonly extensions: string;
  /** Indicates whether the websocket is paused */
  readonly isPaused: boolean;
  readonly protocol: string;
  /** The current state of the connection */
  readonly readyState: typeof WebSocket.CONNECTING | typeof WebSocket.OPEN | typeof WebSocket.CLOSING | typeof WebSocket.CLOSED;
  readonly url: string;
  /** The connection is not yet open. */
  readonly CONNECTING: 0;
  /** The connection is open and ready to communicate. */
  readonly OPEN: 1;
  /** The connection is in the process of closing. */
  readonly CLOSING: 2;
  /** The connection is closed. */
  readonly CLOSED: 3;
  onopen: ((event: Event) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  constructor(address: null);
  constructor(address: string | URL, options?: ClientOptions | ClientRequestArgs);
  constructor(address: string | URL, protocols?: string | string[], options?: ClientOptions | ClientRequestArgs);
  close(code?: number, data?: string | Buffer): void;
  ping(data?: any, mask?: boolean, cb?: (err: Error) => void): void;
  pong(data?: any, mask?: boolean, cb?: (err: Error) => void): void;
  send(data: BufferLike, cb?: (err?: Error) => void): void;
  send(data: BufferLike, options: {
    mask?: boolean | undefined;
    binary?: boolean | undefined;
    compress?: boolean | undefined;
    fin?: boolean | undefined;
  }, cb?: (err?: Error) => void): void;
  terminate(): void;
  /**
   * Pause the websocket causing it to stop emitting events. Some events can still be
   * emitted after this is called, until all buffered data is consumed. This method
   * is a noop if the ready state is `CONNECTING` or `CLOSED`.
   */
  pause(): void;
  /**
   * Make a paused socket resume emitting events. This method is a noop if the ready
   * state is `CONNECTING` or `CLOSED`.
   */
  resume(): void;
  addEventListener(method: "message", cb: (event: MessageEvent) => void, options?: EventListenerOptions): void;
  addEventListener(method: "close", cb: (event: CloseEvent) => void, options?: EventListenerOptions): void;
  addEventListener(method: "error", cb: (event: ErrorEvent) => void, options?: EventListenerOptions): void;
  addEventListener(method: "open", cb: (event: Event) => void, options?: EventListenerOptions): void;
  removeEventListener(method: "message", cb: (event: MessageEvent) => void): void;
  removeEventListener(method: "close", cb: (event: CloseEvent) => void): void;
  removeEventListener(method: "error", cb: (event: ErrorEvent) => void): void;
  removeEventListener(method: "open", cb: (event: Event) => void): void;
  on(event: "close", listener: (this: WebSocket, code: number, reason: Buffer) => void): this;
  on(event: "error", listener: (this: WebSocket, err: Error) => void): this;
  on(event: "upgrade", listener: (this: WebSocket, request: IncomingMessage) => void): this;
  on(event: "message", listener: (this: WebSocket, data: RawData, isBinary: boolean) => void): this;
  on(event: "open", listener: (this: WebSocket) => void): this;
  on(event: "ping" | "pong", listener: (this: WebSocket, data: Buffer) => void): this;
  on(event: "unexpected-response", listener: (this: WebSocket, request: ClientRequest, response: IncomingMessage) => void): this;
  on(event: string | symbol, listener: (this: WebSocket, ...args: any[]) => void): this;
  once(event: "close", listener: (this: WebSocket, code: number, reason: Buffer) => void): this;
  once(event: "error", listener: (this: WebSocket, err: Error) => void): this;
  once(event: "upgrade", listener: (this: WebSocket, request: IncomingMessage) => void): this;
  once(event: "message", listener: (this: WebSocket, data: RawData, isBinary: boolean) => void): this;
  once(event: "open", listener: (this: WebSocket) => void): this;
  once(event: "ping" | "pong", listener: (this: WebSocket, data: Buffer) => void): this;
  once(event: "unexpected-response", listener: (this: WebSocket, request: ClientRequest, response: IncomingMessage) => void): this;
  once(event: string | symbol, listener: (this: WebSocket, ...args: any[]) => void): this;
  off(event: "close", listener: (this: WebSocket, code: number, reason: Buffer) => void): this;
  off(event: "error", listener: (this: WebSocket, err: Error) => void): this;
  off(event: "upgrade", listener: (this: WebSocket, request: IncomingMessage) => void): this;
  off(event: "message", listener: (this: WebSocket, data: RawData, isBinary: boolean) => void): this;
  off(event: "open", listener: (this: WebSocket) => void): this;
  off(event: "ping" | "pong", listener: (this: WebSocket, data: Buffer) => void): this;
  off(event: "unexpected-response", listener: (this: WebSocket, request: ClientRequest, response: IncomingMessage) => void): this;
  off(event: string | symbol, listener: (this: WebSocket, ...args: any[]) => void): this;
  addListener(event: "close", listener: (code: number, reason: Buffer) => void): this;
  addListener(event: "error", listener: (err: Error) => void): this;
  addListener(event: "upgrade", listener: (request: IncomingMessage) => void): this;
  addListener(event: "message", listener: (data: RawData, isBinary: boolean) => void): this;
  addListener(event: "open", listener: () => void): this;
  addListener(event: "ping" | "pong", listener: (data: Buffer) => void): this;
  addListener(event: "unexpected-response", listener: (request: ClientRequest, response: IncomingMessage) => void): this;
  addListener(event: string | symbol, listener: (...args: any[]) => void): this;
  removeListener(event: "close", listener: (code: number, reason: Buffer) => void): this;
  removeListener(event: "error", listener: (err: Error) => void): this;
  removeListener(event: "upgrade", listener: (request: IncomingMessage) => void): this;
  removeListener(event: "message", listener: (data: RawData, isBinary: boolean) => void): this;
  removeListener(event: "open", listener: () => void): this;
  removeListener(event: "ping" | "pong", listener: (data: Buffer) => void): this;
  removeListener(event: "unexpected-response", listener: (request: ClientRequest, response: IncomingMessage) => void): this;
  removeListener(event: string | symbol, listener: (...args: any[]) => void): this;
}
/**
 * Data represents the raw message payload received over the
 */
type RawData = Buffer | ArrayBuffer | Buffer[];
/**
 * Data represents the message payload received over the
 */
type Data = string | Buffer | ArrayBuffer | Buffer[];
/**
 * CertMeta represents the accepted types for certificate & key data.
 */
type CertMeta = string | string[] | Buffer | Buffer[];
/**
 * VerifyClientCallbackSync is a synchronous callback used to inspect the
 * incoming message. The return value (boolean) of the function determines
 * whether or not to accept the handshake.
 */
type VerifyClientCallbackSync<Request extends IncomingMessage = IncomingMessage> = (info: {
  origin: string;
  secure: boolean;
  req: Request;
}) => boolean;
/**
 * VerifyClientCallbackAsync is an asynchronous callback used to inspect the
 * incoming message. The return value (boolean) of the function determines
 * whether or not to accept the handshake.
 */
type VerifyClientCallbackAsync<Request extends IncomingMessage = IncomingMessage> = (info: {
  origin: string;
  secure: boolean;
  req: Request;
}, callback: (res: boolean, code?: number, message?: string, headers?: OutgoingHttpHeaders) => void) => void;
interface ClientOptions extends SecureContextOptions {
  protocol?: string | undefined;
  followRedirects?: boolean | undefined;
  generateMask?(mask: Buffer): void;
  handshakeTimeout?: number | undefined;
  maxRedirects?: number | undefined;
  perMessageDeflate?: boolean | PerMessageDeflateOptions | undefined;
  localAddress?: string | undefined;
  protocolVersion?: number | undefined;
  headers?: {
    [key: string]: string;
  } | undefined;
  origin?: string | undefined;
  agent?: Agent | undefined;
  host?: string | undefined;
  family?: number | undefined;
  checkServerIdentity?(servername: string, cert: CertMeta): boolean;
  rejectUnauthorized?: boolean | undefined;
  maxPayload?: number | undefined;
  skipUTF8Validation?: boolean | undefined;
}
interface PerMessageDeflateOptions {
  serverNoContextTakeover?: boolean | undefined;
  clientNoContextTakeover?: boolean | undefined;
  serverMaxWindowBits?: number | undefined;
  clientMaxWindowBits?: number | undefined;
  zlibDeflateOptions?: {
    flush?: number | undefined;
    finishFlush?: number | undefined;
    chunkSize?: number | undefined;
    windowBits?: number | undefined;
    level?: number | undefined;
    memLevel?: number | undefined;
    strategy?: number | undefined;
    dictionary?: Buffer | Buffer[] | DataView | undefined;
    info?: boolean | undefined;
  } | undefined;
  zlibInflateOptions?: ZlibOptions | undefined;
  threshold?: number | undefined;
  concurrencyLimit?: number | undefined;
}
interface Event {
  type: string;
  target: WebSocket;
}
interface ErrorEvent {
  error: any;
  message: string;
  type: string;
  target: WebSocket;
}
interface CloseEvent {
  wasClean: boolean;
  code: number;
  reason: string;
  type: string;
  target: WebSocket;
}
interface MessageEvent {
  data: Data;
  type: string;
  target: WebSocket;
}
interface EventListenerOptions {
  once?: boolean | undefined;
}
interface ServerOptions<U extends typeof WebSocket = typeof WebSocket, V extends typeof IncomingMessage = typeof IncomingMessage> {
  host?: string | undefined;
  port?: number | undefined;
  backlog?: number | undefined;
  server?: Server<V> | Server$1<V> | undefined;
  verifyClient?: VerifyClientCallbackAsync<InstanceType<V>> | VerifyClientCallbackSync<InstanceType<V>> | undefined;
  handleProtocols?: (protocols: Set<string>, request: InstanceType<V>) => string | false;
  path?: string | undefined;
  noServer?: boolean | undefined;
  clientTracking?: boolean | undefined;
  perMessageDeflate?: boolean | PerMessageDeflateOptions | undefined;
  maxPayload?: number | undefined;
  skipUTF8Validation?: boolean | undefined;
  WebSocket?: U | undefined;
}
interface AddressInfo {
  address: string;
  family: string;
  port: number;
}
declare class Server$2<T extends typeof WebSocket = typeof WebSocket, U extends typeof IncomingMessage = typeof IncomingMessage> extends EventEmitter {
  options: ServerOptions<T, U>;
  path: string;
  clients: Set<InstanceType<T>>;
  constructor(options?: ServerOptions<T, U>, callback?: () => void);
  address(): AddressInfo | string;
  close(cb?: (err?: Error) => void): void;
  handleUpgrade(request: InstanceType<U>, socket: Duplex, upgradeHead: Buffer, callback: (client: InstanceType<T>, request: InstanceType<U>) => void): void;
  shouldHandle(request: InstanceType<U>): boolean | Promise<boolean>;
  on(event: "connection", cb: (this: Server$2<T>, socket: InstanceType<T>, request: InstanceType<U>) => void): this;
  on(event: "error", cb: (this: Server$2<T>, error: Error) => void): this;
  on(event: "headers", cb: (this: Server$2<T>, headers: string[], request: InstanceType<U>) => void): this;
  on(event: "close" | "listening", cb: (this: Server$2<T>) => void): this;
  on(event: string | symbol, listener: (this: Server$2<T>, ...args: any[]) => void): this;
  once(event: "connection", cb: (this: Server$2<T>, socket: InstanceType<T>, request: InstanceType<U>) => void): this;
  once(event: "error", cb: (this: Server$2<T>, error: Error) => void): this;
  once(event: "headers", cb: (this: Server$2<T>, headers: string[], request: InstanceType<U>) => void): this;
  once(event: "close" | "listening", cb: (this: Server$2<T>) => void): this;
  once(event: string | symbol, listener: (this: Server$2<T>, ...args: any[]) => void): this;
  off(event: "connection", cb: (this: Server$2<T>, socket: InstanceType<T>, request: InstanceType<U>) => void): this;
  off(event: "error", cb: (this: Server$2<T>, error: Error) => void): this;
  off(event: "headers", cb: (this: Server$2<T>, headers: string[], request: InstanceType<U>) => void): this;
  off(event: "close" | "listening", cb: (this: Server$2<T>) => void): this;
  off(event: string | symbol, listener: (this: Server$2<T>, ...args: any[]) => void): this;
  addListener(event: "connection", cb: (client: InstanceType<T>, request: InstanceType<U>) => void): this;
  addListener(event: "error", cb: (err: Error) => void): this;
  addListener(event: "headers", cb: (headers: string[], request: InstanceType<U>) => void): this;
  addListener(event: "close" | "listening", cb: () => void): this;
  addListener(event: string | symbol, listener: (...args: any[]) => void): this;
  removeListener(event: "connection", cb: (client: InstanceType<T>, request: InstanceType<U>) => void): this;
  removeListener(event: "error", cb: (err: Error) => void): this;
  removeListener(event: "headers", cb: (headers: string[], request: InstanceType<U>) => void): this;
  removeListener(event: "close" | "listening", cb: () => void): this;
  removeListener(event: string | symbol, listener: (...args: any[]) => void): this;
}
type WebSocketServer = Server$2;
declare function createWebSocketStream(websocket: WebSocket, options?: DuplexOptions): Duplex;
//#endregion
//#region src/adapters/node.d.ts
interface NodeAdapter extends AdapterInstance {
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer, webRequest?: Request): Promise<void>;
  closeAll: (code?: number, data?: string | Buffer, force?: boolean) => void;
}
interface NodeOptions extends AdapterOptions {
  wss?: WebSocketServer;
  serverOptions?: ServerOptions;
}
declare const nodeAdapter: Adapter<NodeAdapter, NodeOptions>;
//#endregion
export { NodeOptions as n, nodeAdapter as r, NodeAdapter as t };