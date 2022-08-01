declare class Headers extends globalThis.Headers {
  getAll(key: 'set-cookie'): string[]
}

declare class Request extends globalThis.Request {
  readonly headers: Headers
}

declare class Response extends globalThis.Response {
  readonly headers: Headers
}

declare const fetchImplementation: typeof fetch
declare const FileConstructor: typeof File
declare const FormDataConstructor: typeof FormData

export { FileConstructor as File, FormDataConstructor as FormData, Headers, Request, Response, fetchImplementation as fetch };
