import type { Route, Params } from '../router'
import type { NextParsedUrlQuery } from '../request-meta'

import { PagesManifest } from '../../build/webpack/plugins/pages-manifest-plugin'

import BaseServer, { FindComponentsResult } from '../base-server'

export default class NextWebServer extends BaseServer {
  protected getHasStaticDir(): boolean {
    return false
  }
  protected getPagesManifest(): PagesManifest | undefined {
    return undefined
  }
  protected getBuildId(): string {
    return ''
  }
  protected generateImageRoutes(): Route[] {
    return []
  }
  protected generatePublicRoutes(): Route[] {
    return []
  }
  protected getFilesystemPaths(): Set<string> {
    return new Set()
  }
  protected async findPageComponents(
    pathname: string,
    query: NextParsedUrlQuery = {},
    params: Params | null = null
  ): Promise<FindComponentsResult | null> {
    // TODO
    return null
  }
  protected getMiddlewareInfo(params: {
    dev?: boolean
    distDir: string
    page: string
    serverless: boolean
  }): { name: string; paths: string[] } {
    throw new Error('Not implemented')
  }
  protected async getPagePath(
    pathname: string,
    locales?: string[]
  ): Promise<string> {
    // return getPagePath(
    //   pathname,
    //   this.distDir,
    //   this._isLikeServerless,
    //   this.renderOpts.dev,
    //   locales
    // )
    throw new Error(`Cannot find module for page: ${pathname}`)
  }
  protected getFontManifest() {
    return undefined
  }
}
