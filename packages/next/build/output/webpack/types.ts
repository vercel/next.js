export type WebpackOutputProps = { client: any; server: any }

export type WebpackOutputStatus =
  | { loading: true }
  | {
      loading: false
      errors: string[] | null
      warnings: string[] | null
    }

export type WebpackOutputState = {
  client: WebpackOutputStatus
  server: WebpackOutputStatus
}

export const DEFAULT_WEBPACK_OUTPUT_STATE: WebpackOutputState = {
  client: { loading: true },
  server: { loading: true },
}
