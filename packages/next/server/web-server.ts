import BaseServer, {
  Options,
  FindComponentsResult,
  prepareServerlessUrl,
  stringifyQuery,
} from './base-server'

export default class NextWebServer extends BaseServer {
  protected loadEnvConfig() {
    // @TODO
  }
  protected getHasStaticDir() {
    return false
  }
  protected async hasMiddleware() {
    return false
  }
  protected generateImageRoutes() {
    return []
  }
  protected generateStaticRotes() {
    return []
  }
  protected generateFsStaticRoutes() {
    return []
  }
  protected generatePublicRoutes() {
    return []
  }
  protected getMiddleware() {
    return []
  }
  protected generateCatchAllMiddlewareRoute() {
    return undefined
  }
  protected getFontManifest() {
    return undefined
  }
  protected getMiddlewareManifest() {
    return undefined
  }
  protected getPagesManifest() {
    // @TODO
    return undefined
  }
  protected getFilesystemPaths() {
    return new Set<string>()
  }
}
