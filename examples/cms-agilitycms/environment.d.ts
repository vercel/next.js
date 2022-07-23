declare namespace NodeJS {
  export interface ProcessEnv {
    readonly NODE_ENV: 'development' | 'production' | 'test'
    readonly AGILITY_CMS_GUID: string
    readonly AGILITY_CMS_API_FETCH_KEY: string
  }
}
