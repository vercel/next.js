import {join} from 'path'
import {PAGES_MANIFEST, SERVER_DIRECTORY} from 'next-server/constants'
import { normalizePagePath } from './normalize-page-path'

export type PagePathOptions = {
  amphtml?: boolean,
}

export function pageNotFoundError(page: string): Error {
  const err: any = new Error(`Cannot find module for page: ${page}`)
  err.code = 'ENOENT'
  return err
}

export const tryAmp = (manifest: any, page: string) => {
  const hasAmp = manifest[page + '.amp']
  if (hasAmp) {
    page += '.amp'
  } else if (manifest[page + '/index.amp']) {
    page += '/index.amp'
  }
  return page
}

export function getPagePath(page: string, distDir: string, opts: PagePathOptions = {}): string {
  const serverBuildPath = join(distDir, SERVER_DIRECTORY)
  const pagesManifest = require(join(serverBuildPath, PAGES_MANIFEST))

  try {
    page = normalizePagePath(page)

    if (opts.amphtml || !pagesManifest[page]) {
      page = tryAmp(pagesManifest, page)
      // Force .amp to show 404 if set
      const isAmp = page.endsWith('.amp')
      if (opts.amphtml && !isAmp) {
        page += '.amp'
      }
      opts.amphtml = opts.amphtml || isAmp
    }
  } catch (err) {
    // tslint:disable-next-line
    console.error(err)
    throw pageNotFoundError(page)
  }

  if (!pagesManifest[page]) {
    throw pageNotFoundError(page)
  }

  return join(serverBuildPath, pagesManifest[page])
}

export function requirePage(page: string, distDir: string, opts: PagePathOptions = {}): any {
  const pagePath = getPagePath(page, distDir, opts)
  const isAmp = pagePath.indexOf('.amp.') > -1
  let hasAmp = false

  if (!isAmp) {
    try {
      const ampPage = getPagePath(page, distDir, { amphtml: true })
      hasAmp = Boolean(ampPage && ampPage.indexOf('.amp') > -1)
    } catch (_) {}
  }
  opts.amphtml = opts.amphtml || isAmp

  return {
    hasAmp,
    mod: require(pagePath),
  }
}
