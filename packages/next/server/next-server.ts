import type { Route, Params } from './router'
import type { NextParsedUrlQuery } from './request-meta'
import type { MiddlewareManifest } from '../build/webpack/plugins/middleware-plugin'
import type { FontManifest } from './font-utils'

import fs from 'fs'
import { join, relative } from 'path'

import { PagesManifest } from '../build/webpack/plugins/pages-manifest-plugin'
import { recursiveReadDirSync } from './lib/recursive-readdir-sync'
import { route } from './router'
import { loadComponents } from './load-components'
import isError from '../lib/is-error'
import { normalizePagePath, denormalizePagePath } from './normalize-page-path'
import { pageNotFoundError, getPagePath, requireFontManifest } from './require'
import {
  MIDDLEWARE_MANIFEST,
  BUILD_ID_FILE,
  PAGES_MANIFEST,
  SERVER_DIRECTORY,
  SERVERLESS_DIRECTORY,
} from '../shared/lib/constants'

import BaseServer, { FindComponentsResult } from './base-server'
export * from './base-server'

export default class NextNodeServer extends BaseServer {
  protected getHasStaticDir(): boolean {
    return fs.existsSync(join(this.dir, 'static'))
  }

  protected getPagesManifest(): PagesManifest | undefined {
    const pagesManifestPath = join(this.serverBuildDir, PAGES_MANIFEST)
    return require(pagesManifestPath)
  }

  protected getBuildId(): string {
    const buildIdFile = join(this.distDir, BUILD_ID_FILE)
    try {
      return fs.readFileSync(buildIdFile, 'utf8').trim()
    } catch (err) {
      if (!fs.existsSync(buildIdFile)) {
        throw new Error(
          `Could not find a production build in the '${this.distDir}' directory. Try building your app with 'next build' before starting the production server. https://nextjs.org/docs/messages/production-start-no-build-id`
        )
      }

      throw err
    }
  }

  protected generatePublicRoutes(): Route[] {
    if (!fs.existsSync(this.publicDir)) return []

    const publicFiles = new Set(
      recursiveReadDirSync(this.publicDir).map((p) =>
        encodeURI(p.replace(/\\/g, '/'))
      )
    )

    return [
      {
        match: route('/:path*'),
        name: 'public folder catchall',
        fn: async (req, res, params, parsedUrl) => {
          const pathParts: string[] = params.path || []
          const { basePath } = this.nextConfig

          // if basePath is defined require it be present
          if (basePath) {
            const basePathParts = basePath.split('/')
            // remove first empty value
            basePathParts.shift()

            if (
              !basePathParts.every((part: string, idx: number) => {
                return part === pathParts[idx]
              })
            ) {
              return { finished: false }
            }

            pathParts.splice(0, basePathParts.length)
          }

          let path = `/${pathParts.join('/')}`

          if (!publicFiles.has(path)) {
            // In `next-dev-server.ts`, we ensure encoded paths match
            // decoded paths on the filesystem. So we need do the
            // opposite here: make sure decoded paths match encoded.
            path = encodeURI(path)
          }

          if (publicFiles.has(path)) {
            await this.serveStatic(
              req,
              res,
              join(this.publicDir, ...pathParts),
              parsedUrl
            )
            return {
              finished: true,
            }
          }
          return {
            finished: false,
          }
        },
      } as Route,
    ]
  }

  private _validFilesystemPathSet: Set<string> | null = null
  protected getFilesystemPaths(): Set<string> {
    if (this._validFilesystemPathSet) {
      return this._validFilesystemPathSet
    }

    const pathUserFilesStatic = join(this.dir, 'static')
    let userFilesStatic: string[] = []
    if (this.hasStaticDir && fs.existsSync(pathUserFilesStatic)) {
      userFilesStatic = recursiveReadDirSync(pathUserFilesStatic).map((f) =>
        join('.', 'static', f)
      )
    }

    let userFilesPublic: string[] = []
    if (this.publicDir && fs.existsSync(this.publicDir)) {
      userFilesPublic = recursiveReadDirSync(this.publicDir).map((f) =>
        join('.', 'public', f)
      )
    }

    let nextFilesStatic: string[] = []

    nextFilesStatic =
      !this.minimalMode && fs.existsSync(join(this.distDir, 'static'))
        ? recursiveReadDirSync(join(this.distDir, 'static')).map((f) =>
            join('.', relative(this.dir, this.distDir), 'static', f)
          )
        : []

    return (this._validFilesystemPathSet = new Set<string>([
      ...nextFilesStatic,
      ...userFilesPublic,
      ...userFilesStatic,
    ]))
  }

  protected async findPageComponents(
    pathname: string,
    query: NextParsedUrlQuery = {},
    params: Params | null = null
  ): Promise<FindComponentsResult | null> {
    let paths = [
      // try serving a static AMP version first
      query.amp ? normalizePagePath(pathname) + '.amp' : null,
      pathname,
    ].filter(Boolean)

    if (query.__nextLocale) {
      paths = [
        ...paths.map(
          (path) => `/${query.__nextLocale}${path === '/' ? '' : path}`
        ),
        ...paths,
      ]
    }

    for (const pagePath of paths) {
      try {
        const components = await loadComponents(
          this.distDir,
          pagePath!,
          !this.renderOpts.dev && this._isLikeServerless
        )

        if (
          query.__nextLocale &&
          typeof components.Component === 'string' &&
          !pagePath?.startsWith(`/${query.__nextLocale}`)
        ) {
          // if loading an static HTML file the locale is required
          // to be present since all HTML files are output under their locale
          continue
        }

        return {
          components,
          query: {
            ...(components.getStaticProps
              ? ({
                  amp: query.amp,
                  _nextDataReq: query._nextDataReq,
                  __nextLocale: query.__nextLocale,
                  __nextDefaultLocale: query.__nextDefaultLocale,
                } as NextParsedUrlQuery)
              : query),
            ...(params || {}),
          },
        }
      } catch (err) {
        if (isError(err) && err.code !== 'ENOENT') throw err
      }
    }
    return null
  }

  protected async getPagePath(
    pathname: string,
    locales?: string[]
  ): Promise<string> {
    return getPagePath(
      pathname,
      this.distDir,
      this._isLikeServerless,
      this.renderOpts.dev,
      locales
    )
  }

  protected getFontManifest(): FontManifest {
    return requireFontManifest(this.distDir, this._isLikeServerless)
  }

  protected getMiddlewareInfo(params: {
    dev?: boolean
    distDir: string
    page: string
    serverless: boolean
  }): { name: string; paths: string[] } {
    const serverBuildPath = join(
      params.distDir,
      params.serverless && !params.dev ? SERVERLESS_DIRECTORY : SERVER_DIRECTORY
    )

    const middlewareManifest: MiddlewareManifest = require(join(
      serverBuildPath,
      MIDDLEWARE_MANIFEST
    ))

    let page: string

    try {
      page = denormalizePagePath(normalizePagePath(params.page))
    } catch (err) {
      throw pageNotFoundError(params.page)
    }

    let pageInfo = middlewareManifest.middleware[page]
    if (!pageInfo) {
      throw pageNotFoundError(page)
    }

    return {
      name: pageInfo.name,
      paths: pageInfo.files.map((file) => join(params.distDir, file)),
    }
  }
}
