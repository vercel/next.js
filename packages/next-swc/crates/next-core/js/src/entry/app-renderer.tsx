// Provided by the rust generate code
type FileType =
  | 'layout'
  | 'template'
  | 'error'
  | 'loading'
  | 'not-found'
  | 'head'
declare global {
  // an tree of all layouts and the page
  const LOADER_TREE: LoaderTree
  // array of chunks for the bootstrap script
  const BOOTSTRAP: string[]
  const IPC: Ipc<unknown, unknown>
}

import type { Ipc } from '@vercel/turbopack-node/ipc/index'
import type { IncomingMessage } from 'node:http'
import type { ClientReferenceManifest } from 'next/dist/build/webpack/plugins/flight-manifest-plugin'
import type { RenderData } from 'types/turbopack'
import type { RenderOpts } from 'next/dist/server/app-render/types'

import { renderToHTMLOrFlight } from 'next/dist/server/app-render/app-render'
import { RSC_VARY_HEADER } from 'next/dist/client/components/app-router-headers'
import { headersFromEntries, initProxiedHeaders } from '../internal/headers'
import { parse, ParsedUrlQuery } from 'node:querystring'
import { PassThrough } from 'node:stream'
;('TURBOPACK { transition: next-layout-entry; chunking-type: isolatedParallel }')
// @ts-ignore
import layoutEntry from './app/layout-entry'
import { createServerResponse } from '../internal/http'

globalThis.__next_require__ = (data) => {
  const [, , ssr_id] = JSON.parse(data)
  return __turbopack_require__(ssr_id)
}
globalThis.__next_chunk_load__ = () => Promise.resolve()

process.env.__NEXT_NEW_LINK_BEHAVIOR = 'true'

const ipc = IPC as Ipc<IpcIncomingMessage, IpcOutgoingMessage>

type IpcIncomingMessage = {
  type: 'headers'
  data: RenderData
}

type IpcOutgoingMessage =
  | {
      type: 'headers'
      data: {
        status: number
        headers: [string, string][]
      }
    }
  | {
      type: 'bodyChunk'
      data: number[]
    }
  | {
      type: 'bodyEnd'
    }

const MIME_TEXT_HTML_UTF8 = 'text/html; charset=utf-8'

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

    const result = await runOperation(renderData)

    if (result == null) {
      throw new Error('no html returned')
    }

    ipc.send({
      type: 'headers',
      data: {
        status: result.statusCode,
        headers: result.headers,
      },
    })

    for await (const chunk of result.body) {
      ipc.send({
        type: 'bodyChunk',
        data: (chunk as Buffer).toJSON().data,
      })
    }

    ipc.send({ type: 'bodyEnd' })
  }
})().catch((err) => {
  ipc.sendError(err)
})

// TODO expose these types in next.js
type ComponentModule = () => any
type ModuleReference = [componentModule: ComponentModule, filePath: string]
export type ComponentsType = {
  [componentKey in FileType]?: ModuleReference
} & {
  page?: ModuleReference
}
type LoaderTree = [
  segment: string,
  parallelRoutes: { [parallelRouterKey: string]: LoaderTree },
  components: ComponentsType
]

async function runOperation(renderData: RenderData) {
  const proxyMethodsForModule = (
    id: string
  ): ProxyHandler<ClientReferenceManifest['ssrModuleMapping']> => {
    return {
      get(_target, prop: string) {
        return {
          id,
          chunks: JSON.parse(id)[1],
          name: prop,
        }
      },
    }
  }

  const proxyMethodsNested = (
    type: 'ssrModuleMapping' | 'clientModules' | 'entryCSSFiles'
  ): ProxyHandler<
    | ClientReferenceManifest['ssrModuleMapping']
    | ClientReferenceManifest['clientModules']
    | ClientReferenceManifest['entryCSSFiles']
  > => {
    return {
      get(_target, key: string) {
        if (type === 'ssrModuleMapping') {
          return new Proxy({}, proxyMethodsForModule(key as string))
        }
        if (type === 'clientModules') {
          // The key is a `${file}#${name}`, but `file` can contain `#` itself.
          // There are 2 possibilities:
          //   "file#"    => id = "file", name = ""
          //   "file#foo" => id = "file", name = "foo"
          const pos = key.lastIndexOf('#')
          let id = key
          let name = ''
          if (pos !== -1) {
            id = key.slice(0, pos)
            name = key.slice(pos + 1)
          } else {
            throw new Error('keys need to be formatted as {file}#{name}')
          }

          return {
            id,
            name,
            chunks: JSON.parse(id)[1],
          }
        }
        if (type === 'entryCSSFiles') {
          const cssChunks = JSON.parse(key)
          // TODO(WEB-856) subscribe to changes
          return {
            modules: [],
            files: cssChunks.filter(filterAvailable).map(toPath),
          }
        }
      },
    }
  }

  const proxyMethods = (): ProxyHandler<ClientReferenceManifest> => {
    const clientModulesProxy = new Proxy(
      {},
      proxyMethodsNested('clientModules')
    )
    const ssrModuleMappingProxy = new Proxy(
      {},
      proxyMethodsNested('ssrModuleMapping')
    )
    const entryCSSFilesProxy = new Proxy(
      {},
      proxyMethodsNested('entryCSSFiles')
    )
    return {
      get(_target: any, prop: string) {
        if (prop === 'ssrModuleMapping') {
          return ssrModuleMappingProxy
        }
        if (prop === 'clientModules') {
          return clientModulesProxy
        }
        if (prop === 'entryCSSFiles') {
          return entryCSSFilesProxy
        }
      },
    }
  }
  const availableModules = new Set()
  const toPath = (chunk: ChunkData) =>
    typeof chunk === 'string' ? chunk : chunk.path
  /// determines if a chunk is needed based on the current available modules
  const filterAvailable = (chunk: ChunkData) => {
    if (typeof chunk === 'string') {
      return true
    } else {
      let includedList = chunk.included || []
      if (includedList.length === 0) {
        return true
      }
      let needed = false
      for (const item of includedList) {
        if (!availableModules.has(item)) {
          availableModules.add(item)
          needed = true
        }
      }
      return needed
    }
  }
  const manifest: ClientReferenceManifest = new Proxy({} as any, proxyMethods())

  const req: IncomingMessage = {
    url: renderData.originalUrl,
    method: renderData.method,
    headers: initProxiedHeaders(
      headersFromEntries(renderData.rawHeaders),
      renderData.data?.serverInfo
    ),
  } as any

  const res = createServerResponse(req, renderData.path)

  const query = parse(renderData.rawQuery)
  const renderOpt: Omit<
    RenderOpts,
    'App' | 'Document' | 'Component' | 'pathname'
  > & {
    params: ParsedUrlQuery
  } = {
    // TODO: give an actual buildId when next build is supported
    buildId: 'development',
    params: renderData.params,
    supportsDynamicHTML: true,
    dev: true,
    buildManifest: {
      polyfillFiles: [],
      rootMainFiles: BOOTSTRAP.filter((path) => path.endsWith('.js')),
      devFiles: [],
      ampDevFiles: [],
      lowPriorityFiles: [],
      pages: {
        '/_app': [],
      },
      ampFirstPages: [],
    },
    ComponentMod: {
      ...layoutEntry,
      default: undefined,
      tree: LOADER_TREE,
      pages: ['page.js'],
    },
    clientReferenceManifest: manifest,
    runtime: 'nodejs',
    serverComponents: true,
    assetPrefix: '',
    pageConfig: {},
    reactLoadableManifest: {},
    nextConfigOutput: renderData.data?.nextConfigOutput,
  }
  const result = await renderToHTMLOrFlight(
    req,
    res,
    renderData.path,
    query,
    renderOpt as any as RenderOpts
  )

  if (!result || result.isNull())
    throw new Error('rendering was not successful')

  const body = new PassThrough()
  if (result.isDynamic()) {
    result.pipe(body)
  } else {
    body.write(result.toUnchunkedString())
  }
  return {
    statusCode: res.statusCode,
    headers: [
      ['Content-Type', result.contentType() ?? MIME_TEXT_HTML_UTF8],
      ['Vary', RSC_VARY_HEADER],
    ] as [string, string][],
    body,
  }
}

// This utility is based on https://github.com/zertosh/htmlescape
// License: https://github.com/zertosh/htmlescape/blob/0527ca7156a524d256101bb310a9f970f63078ad/LICENSE

const ESCAPE_LOOKUP = {
  '&': '\\u0026',
  '>': '\\u003e',
  '<': '\\u003c',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
}

const ESCAPE_REGEX = /[&><\u2028\u2029]/g

export function htmlEscapeJsonString(str: string) {
  return str.replace(
    ESCAPE_REGEX,
    (match) => ESCAPE_LOOKUP[match as keyof typeof ESCAPE_LOOKUP]
  )
}
