import Server, { ServerConstructor } from '../next-server'
import { NextConfig } from '../config'
import { PagesManifest } from '../../build/webpack/plugins/pages-manifest-plugin'
import { Route } from '../router'

type WebRuntimeConfig = {
  buildId: string
  pagesManifest: PagesManifest
}

export default class WebServer extends Server {
  protected runtimeConfig: WebRuntimeConfig

  constructor(
    options: ServerConstructor & {
      conf: NextConfig
      runtimeConfig: WebRuntimeConfig
    }
  ) {
    super(options)
    this.runtimeConfig = options.runtimeConfig
  }

  protected generatePublicRoutes(): Route[] {
    return []
  }
  protected getHasStaticDir(): boolean {
    return false
  }
  protected readBuildId(): string {
    return this.runtimeConfig.buildId
  }
}
