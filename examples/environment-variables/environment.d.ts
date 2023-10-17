declare namespace NodeJS {
  export interface ProcessEnv {
    readonly ENV_VARIABLE: string
    readonly NEXT_PUBLIC_ENV_VARIABLE: string

    readonly DEVELOPMENT_ENV_VARIABLE: string
    readonly NEXT_PUBLIC_DEVELOPMENT_ENV_VARIABLE: string

    readonly ENV_LOCAL_VARIABLE: string
    readonly NEXT_PUBLIC_ENV_LOCAL_VARIABLE: string

    readonly PRODUCTION_ENV_VARIABLE: string
    readonly NEXT_PUBLIC_PRODUCTION_ENV_VARIABLE: string
  }
}
