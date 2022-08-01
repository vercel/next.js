export class Headers extends globalThis.Headers {
  getAll(key: 'set-cookie'): string[]
}

export class Request extends globalThis.Request {
  readonly headers: Headers
}

export class Response extends globalThis.Response {
  readonly headers: Headers
}

declare const fetchImplementation: typeof fetch
declare const FileConstructor: typeof File
declare const FormDataConstructor: typeof FormData

export { fetchImplementation as fetch }
export { FileConstructor as File }
export { FormDataConstructor as FormData }
