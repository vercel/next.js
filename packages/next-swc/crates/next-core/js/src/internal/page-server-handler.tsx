// IPC need to be the first import to allow it to catch errors happening during
// the other imports
import { IPC } from '@vercel/turbopack-node/ipc/index'

import 'next/dist/server/node-polyfill-fetch.js'
import './shims'

import type { IncomingMessage, ServerResponse } from 'node:http'

import { renderToHTML, RenderOpts } from 'next/dist/server/render'
import { getRedirectStatus } from 'next/dist/lib/redirect-status'
import { PERMANENT_REDIRECT_STATUS } from 'next/dist/shared/lib/constants'
import { buildStaticPaths } from 'next/dist/build/utils'
import type { BuildManifest } from 'next/dist/server/get-page-files'
import type { ReactLoadableManifest } from 'next/dist/server/load-components'

import { ServerResponseShim } from './http'
import { headersFromEntries } from './headers'
import type { Ipc } from '@vercel/turbopack-node/ipc/index'
import type { RenderData } from 'types/turbopack'
import type { ChunkGroup } from 'types/next'
import type { NextComponentType } from 'next/types'
import { parse } from 'node:querystring'

const ipc = IPC as Ipc<IpcIncomingMessage, IpcOutgoingMessage>

type IpcIncomingMessage = {
  type: 'headers'
  data: RenderData
}

type IpcOutgoingMessage =
  | {
      type: 'response'
      statusCode: number
      headers: Array<[string, string]>
      body: string
    }
  | { type: 'rewrite'; path: string }

const MIME_APPLICATION_JAVASCRIPT = 'application/javascript'
const MIME_TEXT_HTML_UTF8 = 'text/html; charset=utf-8'

type ModuleImport = Promise<{
  Component: NextComponentType
  namespace: Record<string, any>
}>

export default function startHandler({
  isDataReq,
  App,
  Document,
  mod,
  chunkGroup,
}: {
  isDataReq: boolean
  App?: any
  Document?: any
  mod: () => ModuleImport
  chunkGroup?: ChunkGroup
}) {
  ;(async () => {
    while (true) {
      const msg = await ipc.recv()

      let renderData: RenderData
      switch (msg.type) {
        case 'headers': {
          renderData = msg.data
          break
        }
        default: {
          console.error('unexpected message type', msg.type)
          process.exit(1)
        }
      }

      const { Component, namespace } = await mod()

      const res = await runOperation(renderData, Component, namespace)

      ipc.send(res)
    }
  })().catch((err) => {
    ipc.sendError(err)
  })

  async function runOperation(
    renderData: RenderData,
    Component: NextComponentType,
    namespace: Record<string, any>
  ): Promise<IpcOutgoingMessage> {
    if ('getStaticPaths' in namespace) {
      const {
        paths: prerenderRoutes,
        fallback: prerenderFallback,
        encodedPaths: _encodedPrerenderRoutes,
      } = await buildStaticPaths({
        page: renderData.path,
        getStaticPaths: namespace.getStaticPaths,
        // TODO(alexkirsz) Provide the correct next.config.js path.
        configFileName: 'next.config.js',
      })

      // We provide a dummy base URL to the URL constructor so that it doesn't
      // throw when we pass a relative URL.
      let resolvedPath = new URL(renderData.url, 'next://').pathname
      if (isDataReq) {
        // we still want to match data requests so we remove the prefix and extension
        // to get back the path the page would have
        resolvedPath = resolvedPath.replace(
          /^\/_next\/data\/development(.+).json$/,
          '$1'
        )
      }
      if (
        prerenderFallback === false &&
        // TODO(alexkirsz) Strip basePath.
        !prerenderRoutes.includes(resolvedPath)
      ) {
        return createNotFoundResponse(isDataReq)
      }
    }

    // TODO(alexkirsz) This is missing *a lot* of data, but it's enough to get a
    // basic render working.

    const buildManifest: BuildManifest = {
      pages: {
        // TODO(alexkirsz) We should separate _app and page chunks. Right now, we
        // computing the chunk items of `next-hydrate.js`, so they contain both
        // _app and page chunks.
        '/_app': [],
        [renderData.path]: chunkGroup || [],
      },

      devFiles: [],
      ampDevFiles: [],
      polyfillFiles: [],
      lowPriorityFiles: ['static/development/_buildManifest.js'],
      rootMainFiles: [],
      ampFirstPages: [],
    }

    // When rendering a data request, the default component export is eliminated
    // by the Next.js strip export transform. The following checks for this case
    // and replaces the default export with a dummy component instead.
    const comp =
      typeof Component === 'undefined' ||
      (typeof Component === 'object' && Object.keys(Component).length === 0)
        ? () => null
        : Component

    const renderOpts: RenderOpts = {
      strictNextHead: false,
      /* LoadComponentsReturnType */
      Component: comp,
      App,
      Document,
      pageConfig: {},
      buildManifest,
      reactLoadableManifest: createReactLoadableManifestProxy(),
      ComponentMod: {
        default: comp,
        ...namespace,
      },
      pathname: renderData.path,
      buildId: 'development',

      /* RenderOptsPartial */
      isDataReq,
      runtimeConfig: {},
      assetPrefix: '',
      canonicalBase: '',
      previewProps: {
        previewModeId: '',
        previewModeEncryptionKey: '',
        previewModeSigningKey: '',
      },
      params: renderData.params,
      basePath: '',
      // TODO(WEB-583) this isn't correct, instead it should set `dev: true`
      nextExport: true,
      resolvedUrl: renderData.url,
      optimizeFonts: false,
      optimizeCss: false,
      nextScriptWorkers: false,
      supportsDynamicHTML: true,
      images: {
        deviceSizes: [],
        imageSizes: [],
        loader: 'default',
        path: '',
        loaderFile: '',
        domains: [],
        disableStaticImages: false,
        minimumCacheTTL: 0,
        formats: [],
        dangerouslyAllowSVG: false,
        contentSecurityPolicy: '',
        contentDispositionType: 'inline',
        remotePatterns: [],
        unoptimized: true,
      },
    }

    if ('getStaticPaths' in namespace) {
      renderOpts.getStaticPaths = namespace.getStaticPaths
    }
    if ('getStaticProps' in namespace) {
      renderOpts.getStaticProps = namespace.getStaticProps
    }
    if ('getServerSideProps' in namespace) {
      renderOpts.getServerSideProps = namespace.getServerSideProps
    }

    const req: IncomingMessage = {
      url: renderData.url,
      method: 'GET',
      headers: headersFromEntries(renderData.rawHeaders),
    } as any
    const res: ServerResponse = new ServerResponseShim(req) as any

    // Both _error and 404 should receive a 404 status code.
    const statusCode =
      renderData.path === '/404'
        ? 404
        : renderData.path === '/_error'
        ? 404
        : 200

    // Setting the status code on the response object is necessary for
    // `Error.getInitialProps` to detect the status code.
    res.statusCode = statusCode

    const parsedQuery = parse(renderData.rawQuery)
    const query = { ...parsedQuery, ...renderData.params }

    const renderResult = await renderToHTML(
      /* req: IncomingMessage */
      req,
      /* res: ServerResponse */
      res,
      /* pathname: string */
      renderData.path,
      /* query: ParsedUrlQuery */
      query,
      /* renderOpts: RenderOpts */
      renderOpts
    )

    // Set when `getStaticProps` returns `notFound: true`.
    const isNotFound = renderResult.metadata().isNotFound

    if (isNotFound) {
      return createNotFoundResponse(isDataReq)
    }

    // Set when `getStaticProps` returns `redirect: { destination, permanent, statusCode }`.
    const isRedirect = renderResult.metadata().isRedirect

    if (isRedirect && !isDataReq) {
      const pageProps = renderResult.metadata().pageData.pageProps
      const redirect = {
        destination: pageProps.__N_REDIRECT,
        statusCode: pageProps.__N_REDIRECT_STATUS,
        basePath: pageProps.__N_REDIRECT_BASE_PATH,
      }
      const statusCode = getRedirectStatus(redirect)

      // TODO(alexkirsz) Handle basePath.
      // if (
      //   basePath &&
      //   redirect.basePath !== false &&
      //   redirect.destination.startsWith("/")
      // ) {
      //   redirect.destination = `${basePath}${redirect.destination}`;
      // }

      const headers: Array<[string, string]> = [
        ['Location', redirect.destination],
      ]
      if (statusCode === PERMANENT_REDIRECT_STATUS) {
        headers.push(['Refresh', `0;url=${redirect.destination}`])
      }

      return {
        type: 'response',
        statusCode,
        headers,
        body: redirect.destination,
      }
    }

    if (isDataReq) {
      // TODO(from next.js): change this to a different passing mechanism
      const pageData = renderResult.metadata().pageData
      return {
        type: 'response',
        statusCode,
        headers: [['Content-Type', MIME_APPLICATION_JAVASCRIPT]],
        // Page data is only returned if the page had getXxyProps.
        body: JSON.stringify(pageData === undefined ? {} : pageData),
      }
    }

    if (!renderResult || renderResult.isNull()) {
      throw new Error('no render result returned')
    }

    const body = renderResult.toUnchunkedString()

    // TODO: handle revalidate
    // const sprRevalidate = renderResult.metadata().revalidate;

    return {
      type: 'response',
      statusCode,
      headers: [
        ['Content-Type', renderResult.contentType() ?? MIME_TEXT_HTML_UTF8],
      ],
      body,
    }
  }
}

function createNotFoundResponse(isDataReq: boolean): IpcOutgoingMessage {
  if (isDataReq) {
    return {
      type: 'response',
      // Returning a 404 status code is required for the client-side router
      // to redirect to the error page.
      statusCode: 404,
      body: '{"notFound":true}',
      headers: [['Content-Type', MIME_APPLICATION_JAVASCRIPT]],
    }
  }

  return {
    type: 'rewrite',
    // /_next/404 is a Turbopack-internal route that will always redirect to
    // the 404 page.
    path: '/_next/404',
  }
}

type ManifestItem = {
  id: string
  chunks: string[]
}

/**
 * During compilation, Next.js builds a manifest of dynamic imports with the
 * `ReactLoadablePlugin` for webpack.
 *
 * At the same time, the next/dynamic transform converts each `dynamic()` call
 * so it contains a key to the corresponding entry within that manifest.
 *
 * During server-side rendering, each `dynamic()` call will be recorded and its
 * corresponding entry in the manifest will be looked up.
 * * The entry's chunks will be asynchronously loaded on the client using a
 *   <script defer> tag.
 * * The entry's module id will be appended to a list of dynamic module ids.
 *
 * On the client-side, during hydration, the dynamic module ids are used to
 * initialize the corresponding <Loadable> components.
 *
 * In development, Turbopack works differently: instead of building a static
 * manifest, each `dynamic()` call will embed its own manifest entry within a
 * serialized string key. Hence the need for a proxy that can dynamically
 * deserialize the manifest entries from that string key.
 */
function createReactLoadableManifestProxy(): ReactLoadableManifest {
  return new Proxy(
    {},
    {
      get: (_target, prop: string, _receiver) => {
        const { id, chunks } = JSON.parse(prop) as ManifestItem

        return {
          id,
          files: chunks.map((chunk) => {
            // Turbopack prefixes chunks with "_next/", but Next.js expects
            // them to be relative to the build directory.
            if (chunk.startsWith('_next/')) {
              return chunk.slice('_next/'.length)
            }
            return chunk
          }),
        }
      },
    }
  )
}
