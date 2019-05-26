import {
  BUILD_MANIFEST,
  CLIENT_STATIC_FILES_PATH,
  REACT_LOADABLE_MANIFEST,
  SERVER_DIRECTORY,
} from '../lib/constants'
import { join } from 'path'

import { requirePage } from './require'

export function interopDefault(mod: any) {
  return mod.default || mod
}

export type LoadComponentsReturnType = {
  Component: any
  buildManifest?: any
  reactLoadableManifest?: any
  Document?: any
  DocumentMiddleware?: any
  App?: any,
}

export async function loadComponents(
  distDir: string,
  buildId: string,
  pathname: string,
  serverless: boolean,
): Promise<LoadComponentsReturnType> {
  if (serverless) {
    const Component = await requirePage(pathname, distDir, serverless)
    return { Component }
  }
  const documentPath = join(
    distDir,
    SERVER_DIRECTORY,
    CLIENT_STATIC_FILES_PATH,
    buildId,
    'pages',
    '_document',
  )
  const appPath = join(
    distDir,
    SERVER_DIRECTORY,
    CLIENT_STATIC_FILES_PATH,
    buildId,
    'pages',
    '_app',
  )

  const DocumentMod = require(documentPath)
  const { middleware: DocumentMiddleware } = DocumentMod

  const [
    buildManifest,
    reactLoadableManifest,
    Component,
    Document,
    App,
  ] = await Promise.all([
    require(join(distDir, BUILD_MANIFEST)),
    require(join(distDir, REACT_LOADABLE_MANIFEST)),
    interopDefault(requirePage(pathname, distDir, serverless)),
    interopDefault(DocumentMod),
    interopDefault(require(appPath)),
  ])

  return {
    buildManifest,
    reactLoadableManifest,
    Component,
    Document,
    DocumentMiddleware,
    App,
  }
}
