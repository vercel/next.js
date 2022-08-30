import { TypeFramework } from 'supertokens-node/lib/build/framework/types'

export interface AuthConfig {
  framework: TypeFramework
  supertokens: {
    connectionURI: string
  }
  appInfo: {
    appName: string
    websiteDomain: string
    apiDomain: string
    apiBasePath: string
  }
  recipeList: any
  isInServerlessEnv: boolean
}
