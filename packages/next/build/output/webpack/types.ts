export type WebpackOutputProps = { appUrl: string; client: any; server: any }

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

export enum WebpackOutputPhase {
  COMPILING = 1,
  COMPILED_WITH_ERRORS = 2,
  COMPILED_WITH_WARNINGS = 3,
  COMPILED = 4,
}

export const DEFAULT_WEBPACK_OUTPUT_STATE: WebpackOutputState = {
  client: { loading: true },
  server: { loading: true },
}
