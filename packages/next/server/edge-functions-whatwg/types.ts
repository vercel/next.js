import type { I18NConfig } from '../config-shared'

export type Klass<T> = new (...args: any[]) => T

export interface NodeHeaders {
  [header: string]: string | string[] | undefined
}

export interface EdgeFunctionRequest {
  geo?: {
    city?: string
    country?: string
    region?: string
  }
  headers: NodeHeaders
  ip?: string
  method: string
  nextConfig?: {
    basePath?: string
    i18n?: I18NConfig | null
    trailingSlash?: boolean
  }
  page?: {
    name?: string
    params?: { [key: string]: string }
  }
  url: string
}

export interface EdgeFunctionResult {
  response: Response
  waitUntil: Promise<any>
}
