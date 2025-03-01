declare class Request extends globalThis.Request {
  readonly headers: Headers
  readonly duplex: string
}

declare class Response extends globalThis.Response {
  readonly headers: Headers
  static json(data: any, init?: ResponseInit): Response
}

type RequestInfo = string | Request | globalThis.Request
type RequestInit = globalThis.RequestInit
declare const fetchImplementation: (
  info: RequestInfo,
  init?: RequestInit,
) => Promise<Response>

declare const FileConstructor: typeof File
declare const FormDataConstructor: typeof FormData
declare const WebSocketConstructor: typeof WebSocket
declare const HeadersConstructor: typeof Headers

export { FileConstructor as File, FormDataConstructor as FormData, HeadersConstructor as Headers, Request, type RequestInfo, type RequestInit, Response, WebSocketConstructor as WebSocket, fetchImplementation as fetch };
