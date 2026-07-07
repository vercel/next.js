import { a as WebSocket } from "./web.mjs";

//#region src/error.d.ts
declare class WSError extends Error {
  constructor(...args: any[]);
}
//#endregion
//#region src/utils.d.ts
declare const kNodeInspect: unique symbol;
//#endregion
//#region src/peer.d.ts
interface PeerContext extends Record<string, unknown> {}
interface AdapterInternal {
  ws: unknown;
  request: Request;
  namespace: string;
  peers?: Set<Peer>;
  context?: PeerContext;
}
declare abstract class Peer<Internal extends AdapterInternal = AdapterInternal> {
  #private;
  protected _internal: Internal;
  protected _topics: Set<string>;
  protected _id?: string;
  constructor(internal: Internal);
  get context(): PeerContext;
  get namespace(): string;
  /**
   * Unique random [uuid v4](https://developer.mozilla.org/en-US/docs/Glossary/UUID) identifier for the peer.
   */
  get id(): string;
  /** IP address of the peer */
  get remoteAddress(): string | undefined;
  /** upgrade request */
  get request(): Request;
  /**
   * Get the [WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket) instance.
   *
   * **Note:** crossws adds polyfill for the following properties if native values are not available:
   * - `protocol`: Extracted from the `sec-websocket-protocol` header.
   * - `extensions`: Extracted from the `sec-websocket-extensions` header.
   * - `url`: Extracted from the request URL (http -> ws).
   * */
  get websocket(): Partial<WebSocket>;
  /** All connected peers to the server */
  get peers(): Set<Peer>;
  /** All topics, this peer has been subscribed to. */
  get topics(): Set<string>;
  abstract close(code?: number, reason?: string): void;
  /** Abruptly close the connection */
  terminate(): void;
  /** Subscribe to a topic */
  subscribe(topic: string): void;
  /** Unsubscribe from a topic */
  unsubscribe(topic: string): void;
  /** Send a message to the peer. */
  abstract send(data: unknown, options?: {
    compress?: boolean;
  }): number | void | undefined;
  /** Send message to subscribes of topic */
  abstract publish(topic: string, data: unknown, options?: {
    compress?: boolean;
  }): void;
  toString(): string;
  [Symbol.toPrimitive](): string;
  [Symbol.toStringTag](): "WebSocket";
  [kNodeInspect](): unknown;
}
//#endregion
//#region src/message.d.ts
declare class Message implements Partial<MessageEvent> {
  #private;
  /** Access to the original [message event](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/message_event) if available. */
  readonly event?: MessageEvent;
  /** Access to the Peer that emitted the message. */
  readonly peer?: Peer;
  /** Raw message data (can be of any type). */
  readonly rawData: unknown;
  constructor(rawData: unknown, peer: Peer, event?: MessageEvent);
  /**
   * Unique random [uuid v4](https://developer.mozilla.org/en-US/docs/Glossary/UUID) identifier for the message.
   */
  get id(): string;
  /**
   * Get data as [Uint8Array](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array) value.
   *
   * If raw data is in any other format or string, it will be automatically converted and encoded.
   */
  uint8Array(): Uint8Array;
  /**
   * Get data as [ArrayBuffer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer) or [SharedArrayBuffer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer) value.
   *
   * If raw data is in any other format or string, it will be automatically converted and encoded.
   */
  arrayBuffer(): ArrayBuffer | SharedArrayBuffer;
  /**
   * Get data as [Blob](https://developer.mozilla.org/en-US/docs/Web/API/Blob) value.
   *
   * If raw data is in any other format or string, it will be automatically converted and encoded. */
  blob(): Blob;
  /**
   * Get stringified text version of the message.
   *
   * If raw data is in any other format, it will be automatically converted and decoded.
   */
  text(): string;
  /**
   * Get parsed version of the message text with [`JSON.parse()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse).
   */
  json<T = unknown>(): T;
  /**
   * Message data (value varies based on `peer.websocket.binaryType`).
   */
  get data(): unknown;
  toString(): string;
  [Symbol.toPrimitive](): string;
  [kNodeInspect](): unknown;
}
//#endregion
//#region src/hooks.d.ts
declare function defineHooks<T extends Partial<Hooks> = Partial<Hooks>>(hooks: T): T;
type ResolveHooks = (request: Request & {
  readonly context?: PeerContext;
}) => Partial<Hooks> | Promise<Partial<Hooks>>;
type MaybePromise<T> = T | Promise<T>;
interface Hooks {
  /**
   * Upgrading a request to a WebSocket connection.
   *
   * - You can throw a Response to abort the upgrade.
   * - You can return { headers } to modify the response.
   * - You can return { namespace } to change the pub/sub namespace.
   * - You can return { context } to provide a custom peer context.
   *
   * @param request
   * @throws {Response}
   */
  upgrade: (request: Request & {
    readonly context?: Record<string, unknown>;
  }) => MaybePromise<{
    headers?: HeadersInit;
    namespace?: string;
    context?: PeerContext;
  } | Response | void>;
  /** A message is received */
  message: (peer: Peer, message: Message) => MaybePromise<void>;
  /** A socket is opened */
  open: (peer: Peer) => MaybePromise<void>;
  /** A socket is closed */
  close: (peer: Peer, details: {
    code?: number;
    reason?: string;
  }) => MaybePromise<void>;
  /** An error occurs */
  error: (peer: Peer, error: WSError) => MaybePromise<void>;
}
//#endregion
//#region src/adapter.d.ts
interface AdapterInstance {
  readonly peers: Map<string, Set<Peer>>;
  readonly publish: (topic: string, data: unknown, options?: {
    compress?: boolean;
    namespace?: string;
  }) => void;
}
interface AdapterOptions {
  resolve?: ResolveHooks;
  getNamespace?: (request: Request) => string;
  hooks?: Partial<Hooks>;
}
type Adapter<AdapterT extends AdapterInstance = AdapterInstance, Options extends AdapterOptions = AdapterOptions> = (options?: Options) => AdapterT;
declare function defineWebSocketAdapter<AdapterT extends AdapterInstance = AdapterInstance, Options extends AdapterOptions = AdapterOptions>(factory: Adapter<AdapterT, Options>): Adapter<AdapterT, Options>;
//#endregion
export { Hooks as a, Message as c, PeerContext as d, WSError as f, defineWebSocketAdapter as i, AdapterInternal as l, AdapterInstance as n, ResolveHooks as o, AdapterOptions as r, defineHooks as s, Adapter as t, Peer as u };