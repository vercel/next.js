declare class Headers extends globalThis.Headers {
  getAll?(key: 'set-cookie'): string[]
}

declare class Request extends globalThis.Request {
  readonly headers: Headers
}

declare class Response extends globalThis.Response {
  readonly headers: Headers
  static json(data: any, init?: ResponseInit): Response
}

type RequestInfo = Parameters<typeof fetch>[0]
type RequestInit = Parameters<typeof fetch>[1]
declare const fetchImplementation: (
  info: RequestInfo,
  init?: RequestInit
) => Promise<Response>

declare const FileConstructor: typeof File
declare const FormDataConstructor: typeof FormData

export { FileConstructor as File, FormDataConstructor as FormData, Headers, Request, RequestInfo, RequestInit, Response, fetchImplementation as fetch };
