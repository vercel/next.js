import type { Rewrite } from '../../lib/load-custom-routes'
import type { PagesManifest } from '../webpack/plugins/pages-manifest-plugin'

import fs from 'fs'
import path from 'path'
import { getPageFromPath } from '../entries'
import { Sema } from 'next/dist/compiled/async-sema'
import { resolveFrom } from '../../lib/resolve-from'
import { recursiveCopy } from '../../lib/recursive-copy'
import { getSortedRoutes } from '../../shared/lib/router/utils'
import {
  hasShuttle,
  type DetectedEntriesResult,
} from './detect-changed-entries'
import {
  APP_BUILD_MANIFEST,
  APP_PATH_ROUTES_MANIFEST,
  APP_PATHS_MANIFEST,
  AUTOMATIC_FONT_OPTIMIZATION_MANIFEST,
  BUILD_MANIFEST,
  CLIENT_REFERENCE_MANIFEST,
  FUNCTIONS_CONFIG_MANIFEST,
  MIDDLEWARE_BUILD_MANIFEST,
  MIDDLEWARE_MANIFEST,
  MIDDLEWARE_REACT_LOADABLE_MANIFEST,
  NEXT_FONT_MANIFEST,
  PAGES_MANIFEST,
  REACT_LOADABLE_MANIFEST,
  SERVER_REFERENCE_MANIFEST,
  ROUTES_MANIFEST,
} from '../../shared/lib/constants'

export async function stitchBuilds(
  {
    distDir,
    shuttleDir,
    buildId,
    rewrites,
  }: {
    buildId: string
    distDir: string
    shuttleDir: string
    rewrites: {
      beforeFiles: Rewrite[]
      afterFiles: Rewrite[]
      fallback: Rewrite[]
    }
  },
  entries: {
    changed: DetectedEntriesResult
    unchanged: DetectedEntriesResult
    pageExtensions: string[]
  }
): Promise<{
  pagesManifest?: PagesManifest
}> {
  if (!(await hasShuttle(shuttleDir))) {
    // no shuttle directory nothing to stitch
    return {}
  }

  // we need to copy the chunks from the shuttle folder
  // to the distDir (we copy all server split chunks currently)
  await recursiveCopy(
    path.join(shuttleDir, 'server'),
    path.join(distDir, 'server'),
    {
      filter(item) {
        // we copy page chunks separately to not copy stale entries
        return !item.match(/^[/\\](pages|app)[/\\]/)
      },
      overwrite: true,
    }
  )
  // copy static chunks (this includes stale chunks but won't be loaded)
  // unless referenced
  await recursiveCopy(
    path.join(shuttleDir, 'static'),
    path.join(distDir, 'static'),
    { overwrite: true }
  )

  async function copyPageChunk(entry: string, type: 'app' | 'pages') {
    // copy entry chunk and flight manifest stuff
    // TODO: copy .map files?
    const entryFile = path.join('server', type, `${entry}.js`)

    await fs.promises.mkdir(path.join(distDir, path.dirname(entryFile)), {
      recursive: true,
    })
    await fs.promises.copyFile(
      path.join(shuttleDir, entryFile + '.nft.json'),
      path.join(distDir, entryFile + '.nft.json')
    )

    if (type === 'app' && !entry.endsWith('/route')) {
      const clientRefManifestFile = path.join(
        'server',
        type,
        `${entry}_${CLIENT_REFERENCE_MANIFEST}.js`
      )
      await fs.promises.copyFile(
        path.join(shuttleDir, clientRefManifestFile),
        path.join(distDir, clientRefManifestFile)
      )
    }
    await fs.promises.copyFile(
      path.join(shuttleDir, entryFile),
      path.join(distDir, entryFile)
    )
  }
  const copySema = new Sema(8)

  // restore unchanged entries avoiding copying stale
  // entries from the shuttle/previous build
  for (const { type, curEntries } of [
    { type: 'app', curEntries: entries.unchanged.app },
    { type: 'pages', curEntries: entries.unchanged.pages },
  ] as Array<{ type: 'app' | 'pages'; curEntries: string[] }>) {
    await Promise.all(
      curEntries.map(async (entry) => {
        try {
          await copySema.acquire()
          let normalizedEntry = getPageFromPath(entry, entries.pageExtensions)
          if (normalizedEntry === '/') {
            normalizedEntry = '/index'
          }
          await copyPageChunk(
            normalizedEntry,
            type
          )
        } finally {
          copySema.release()
        }
      })
    )
  }

  // now we need to stitch the manifests together
  const nextPath = path.dirname(resolveFrom(distDir, 'next/package.json'))
  const { generateClientManifest } = require(
    path.join(
      nextPath,
      'dist',
      'build',
      'webpack',
      'plugins/build-manifest-plugin.js'
    )
  )

  // for build-manifest we use latest runtime files
  // and only merge previous page chunk entries
  // middleware-build-manifest.js (needs to be regenerated)
  const [restoreBuildManifest, currentBuildManifest] = await Promise.all(
    [
      path.join(shuttleDir, 'manifests', BUILD_MANIFEST),
      path.join(distDir, BUILD_MANIFEST),
    ].map(async (file) => JSON.parse(await fs.promises.readFile(file, 'utf8')))
  )
  const mergedBuildManifest = {
    // we want to re-use original runtime
    // chunks so we favor restored version 
    // over new
    ...restoreBuildManifest,
    pages: {
      ...restoreBuildManifest.pages,
      ...currentBuildManifest.pages,
    },
  }
  
  // get original runtime chunks for pages if present
  // so that we can restore that under new entries
  const nonApiUnchangedPages = entries.unchanged.pages.filter(item => !item.startsWith('/api'))
  
  if (nonApiUnchangedPages.length > 0) {
    const restoreEntryKey = getPageFromPath(nonApiUnchangedPages[0], entries.pageExtensions)
    const runtimeRegex = /chunks\/(main-|framework-|webpack-).*?\.js$/
    const originalRuntimeChunks = restoreBuildManifest.pages[
      restoreEntryKey
    ].filter((item: string) => item.match(runtimeRegex))
  
    for (const key of ['/_app', '/_error', ...entries.changed.pages.map(entry => getPageFromPath(entry, entries.pageExtensions))]) {
      mergedBuildManifest.pages[key] = [
        ...originalRuntimeChunks,
        ...mergedBuildManifest.pages[key].filter((item: string) => 
        !item.match(runtimeRegex))
      ]
    }
  }

  /* 
    TODO: for rootMainFiles we need to add a map that allows
    referencing previous runtimes e.g. 
    [
      {
        entries: string[]
        runtimeFiles: string[]
      } 
    ]
    then we update the lookup to iterate over the array
    to find the runtime files for the specific entry

    for pages we need to ensure the react chunk and such
    is broken out into it's own split chunk correctly so 
    we don't reference new runtime chunks in a previous build
  */

  await fs.promises.writeFile(
    path.join(distDir, BUILD_MANIFEST),
    JSON.stringify(mergedBuildManifest, null, 2)
  )
  await fs.promises.writeFile(
    path.join(distDir, 'server', `${MIDDLEWARE_BUILD_MANIFEST}.js`),
    `self.__BUILD_MANIFEST=${JSON.stringify(mergedBuildManifest)}`
  )
  await fs.promises.writeFile(
    path.join(distDir, 'static', buildId, `_buildManifest.js`),
    `self.__BUILD_MANIFEST = ${generateClientManifest(
      mergedBuildManifest,
      rewrites
    )};self.__BUILD_MANIFEST_CB && self.__BUILD_MANIFEST_CB()`
  )

  // for react-loadable-manifest we just merge directly
  // prioritizing current manifest over previous,
  // middleware-react-loadable-manifest (needs to be regenerated)
  const [restoreLoadableManifest, currentLoadableManifest] = await Promise.all(
    [
      path.join(shuttleDir, 'manifests', REACT_LOADABLE_MANIFEST),
      path.join(distDir, REACT_LOADABLE_MANIFEST),
    ].map(async (file) => JSON.parse(await fs.promises.readFile(file, 'utf8')))
  )
  const mergedLoadableManifest = {
    ...restoreLoadableManifest,
    ...currentLoadableManifest,
  }

  await fs.promises.writeFile(
    path.join(distDir, REACT_LOADABLE_MANIFEST),
    JSON.stringify(mergedLoadableManifest, null, 2)
  )
  await fs.promises.writeFile(
    path.join(distDir, 'server', `${MIDDLEWARE_REACT_LOADABLE_MANIFEST}.js`),
    `self.__REACT_LOADABLE_MANIFEST=${JSON.stringify(
      JSON.stringify(mergedLoadableManifest)
    )}`
  )

  // for server/middleware-manifest we just merge the functions
  // and middleware fields
  const [restoreMiddlewareManifest, currentMiddlewareManifest] =
    await Promise.all(
      [
        path.join(shuttleDir, 'server', MIDDLEWARE_MANIFEST),
        path.join(distDir, 'server', MIDDLEWARE_MANIFEST),
      ].map(async (file) =>
        JSON.parse(await fs.promises.readFile(file, 'utf8'))
      )
    )
  const mergedMiddlewareManifest = {
    ...currentMiddlewareManifest,
    functions: {
      ...restoreMiddlewareManifest.functions,
      ...currentMiddlewareManifest.functions,
    },
  }

  await fs.promises.writeFile(
    path.join(distDir, 'server', MIDDLEWARE_MANIFEST),
    JSON.stringify(mergedMiddlewareManifest, null, 2)
  )

  // for server/next-font-manifest we just merge nested
  // page/app fields and regenerate server/next-font-manifest.js
  const [restoreNextFontManifest, currentNextFontManifest] = await Promise.all(
    [
      path.join(shuttleDir, 'server', `${NEXT_FONT_MANIFEST}.json`),
      path.join(distDir, 'server', `${NEXT_FONT_MANIFEST}.json`),
    ].map(async (file) => JSON.parse(await fs.promises.readFile(file, 'utf8')))
  )
  const mergedNextFontManifest = {
    ...currentNextFontManifest,
    pages: {
      ...restoreNextFontManifest.pages,
      ...currentNextFontManifest.pages,
    },
    app: {
      ...restoreNextFontManifest.app,
      ...currentNextFontManifest.app,
    },
  }

  await fs.promises.writeFile(
    path.join(distDir, 'server', `${NEXT_FONT_MANIFEST}.json`),
    JSON.stringify(mergedNextFontManifest, null, 2)
  )
  await fs.promises.writeFile(
    path.join(distDir, 'server', `${NEXT_FONT_MANIFEST}.js`),
    `self.__NEXT_FONT_MANIFEST=${JSON.stringify(
      JSON.stringify(mergedNextFontManifest)
    )}`
  )

  // for server/font-manifest.json we just merge the arrays
  for (const file of [
    AUTOMATIC_FONT_OPTIMIZATION_MANIFEST,
    path.join('chunks', AUTOMATIC_FONT_OPTIMIZATION_MANIFEST),
  ]) {
    const [restoreFontManifest, currentFontManifest] = await Promise.all(
      [
        path.join(shuttleDir, 'server', file),
        path.join(distDir, 'server', file),
      ].map(async (f) => JSON.parse(await fs.promises.readFile(f, 'utf8')))
    )
    const mergedFontManifest = [...restoreFontManifest, ...currentFontManifest]

    await fs.promises.writeFile(
      path.join(distDir, 'server', file),
      JSON.stringify(mergedFontManifest, null, 2)
    )
  }

  // for server/functions-config-manifest.json we just merge
  // the functions field
  const [restoreFunctionsConfigManifest, currentFunctionsConfigManifest] =
    await Promise.all(
      [
        path.join(shuttleDir, 'server', FUNCTIONS_CONFIG_MANIFEST),
        path.join(distDir, 'server', FUNCTIONS_CONFIG_MANIFEST),
      ].map(async (file) =>
        JSON.parse(await fs.promises.readFile(file, 'utf8'))
      )
    )
  const mergedFunctionsConfigManifest = {
    ...currentFunctionsConfigManifest,
    functions: {
      ...restoreFunctionsConfigManifest.functions,
      ...currentFunctionsConfigManifest.functions,
    },
  }
  await fs.promises.writeFile(
    path.join(distDir, 'server', FUNCTIONS_CONFIG_MANIFEST),
    JSON.stringify(mergedFunctionsConfigManifest, null, 2)
  )

  // for server/pages-manifest.json and server/app-paths-manifest.json
  // we just merge
  for (const file of [APP_BUILD_MANIFEST, APP_PATH_ROUTES_MANIFEST]) {
    const [restorePagesManifest, currentPagesManifest] = await Promise.all(
      [path.join(shuttleDir, 'manifests', file), path.join(distDir, file)].map(
        async (f) => JSON.parse(await fs.promises.readFile(f, 'utf8'))
      )
    )
    const mergedPagesManifest = {
      ...restorePagesManifest,
      ...currentPagesManifest,

      ...(file === APP_BUILD_MANIFEST
        ? {
            pages: {
              ...restorePagesManifest.pages,
              ...currentPagesManifest.pages,
            },
          }
        : {}),
    }
    await fs.promises.writeFile(
      path.join(distDir, file),
      JSON.stringify(mergedPagesManifest, null, 2)
    )
  }
  let mergedPagesManifest: PagesManifest | undefined

  for (const file of [PAGES_MANIFEST, APP_PATHS_MANIFEST]) {
    const [restoreAppManifest, currentAppManifest] = await Promise.all(
      [
        path.join(shuttleDir, 'server', file),
        path.join(distDir, 'server', file),
      ].map(async (f) => JSON.parse(await fs.promises.readFile(f, 'utf8')))
    )
    const mergedAppManifest = {
      ...restoreAppManifest,
      ...currentAppManifest,
    }
    await fs.promises.writeFile(
      path.join(distDir, 'server', file),
      JSON.stringify(mergedAppManifest, null, 2)
    )
    if (file === PAGES_MANIFEST) {
      mergedPagesManifest = mergedAppManifest
    }
  }

  // merge dynamic/static routes in routes-manifest
  const [restoreRoutesManifest, currentRoutesManifest] = await Promise.all(
    [
      path.join(shuttleDir, 'manifests', ROUTES_MANIFEST),
      path.join(distDir, ROUTES_MANIFEST),
    ].map(async (f) => JSON.parse(await fs.promises.readFile(f, 'utf8')))
  )
  const dynamicRouteMap: Record<string, any> = {}
  const combinedDynamicRoutes: Record<string, any>[] = [
    ...currentRoutesManifest.dynamicRoutes,
    ...restoreRoutesManifest.dynamicRoutes,
  ]
  for (const route of combinedDynamicRoutes) {
    dynamicRouteMap[route.page] = route
  }

  const mergedRoutesManifest = {
    ...currentRoutesManifest,
    dynamicRoutes: getSortedRoutes(
      combinedDynamicRoutes.map((item) => item.page)
    ).map((page) => dynamicRouteMap[page]),
    staticRoutes: [
      ...currentRoutesManifest.staticRoutes,
      ...restoreRoutesManifest.staticRoutes,
    ],
  }
  await fs.promises.writeFile(
    path.join(distDir, ROUTES_MANIFEST),
    JSON.stringify(mergedRoutesManifest, null, 2)
  )

  // for server/server-reference-manifest.json we merge
  // and regenerate server/server-reference-manifest.js
  const [restoreServerRefManifest, currentServerRefManifest] =
    await Promise.all(
      [
        path.join(shuttleDir, 'server', `${SERVER_REFERENCE_MANIFEST}.json`),
        path.join(distDir, 'server', `${SERVER_REFERENCE_MANIFEST}.json`),
      ].map(async (file) =>
        JSON.parse(await fs.promises.readFile(file, 'utf8'))
      )
    )
  const mergedServerRefManifest = {
    ...currentServerRefManifest,
    node: {
      ...restoreServerRefManifest.node,
      ...currentServerRefManifest.node,
    },
    edge: {
      ...restoreServerRefManifest.edge,
      ...currentServerRefManifest.edge,
    },
  }
  await fs.promises.writeFile(
    path.join(distDir, 'server', `${SERVER_REFERENCE_MANIFEST}.json`),
    JSON.stringify(mergedServerRefManifest, null, 2)
  )
  await fs.promises.writeFile(
    path.join(distDir, 'server', `${SERVER_REFERENCE_MANIFEST}.js`),
    `self.__RSC_SERVER_MANIFEST=${JSON.stringify(
      JSON.stringify(mergedServerRefManifest)
    )}`
  )

  // TODO: inline env variables post build by find/replace
  // in all the chunks for NEXT_PUBLIC_?

  return {
    pagesManifest: mergedPagesManifest,
  }
}
