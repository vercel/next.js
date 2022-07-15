import type { FlightData } from '../../server/app-render'
import { createFromReadableStream as originalCreateFromReadableStream } from 'next/dist/compiled/react-server-dom-webpack'

let __next_css_callback__: Record<string, (() => void)[]> = {}
let __next_css_preload_promises__: Promise<void>[] = []

declare global {
  const __webpack_require__: any
}

if (typeof window !== 'undefined') {
  // Ignore the module ID transform in client.
  // eslint-disable-next-line no-undef
  // @ts-expect-error TODO: fix type
  self.__next_require__ = __webpack_require__

  // eslint-disable-next-line no-undef
  const getChunkScriptFilename = __webpack_require__.u
  const chunkFilenameMap: any = {}

  // eslint-disable-next-line no-undef
  __webpack_require__.u = (chunkId: any) => {
    return chunkFilenameMap[chunkId] || getChunkScriptFilename(chunkId)
  }

  // eslint-disable-next-line no-undef
  ;(self as any).__next_chunk_load__ = (chunk: string) => {
    if (!chunk) return Promise.resolve()

    const isCSSResource = chunk.startsWith('__CSS__:')
    if (isCSSResource) {
      chunk = chunk.slice('__CSS__:'.length)
    }

    if (chunk.endsWith('.css')) {
      const chunkFilePath = `/_next/${chunk}`

      let resolve: () => void
      const preloadCSSResourcePromise = new Promise<void>(
        (res) => (resolve = res)
      )

      const link = document.createElement('link')
      link.rel = 'preload'
      link.as = 'style'
      link.href = chunkFilePath
      link.onload = () => resolve()
      document.head.appendChild(link)
      return preloadCSSResourcePromise
    }

    const [chunkId, chunkFileName] = chunk.split(':')
    chunkFilenameMap[chunkId] = `static/chunks/${chunkFileName}.js`

    // @ts-ignore
    // eslint-disable-next-line no-undef
    let thenable = __webpack_chunk_load__(chunkId)
    const callbacks = __next_css_callback__[chunk]
    if (callbacks) {
      thenable = thenable.then(() => {
        callbacks.forEach((callback: () => void) => callback())
      })
    }

    if (isCSSResource) {
      thenable = thenable.then(() => {
        __next_css_preload_promises__.splice(
          __next_css_preload_promises__.indexOf(thenable),
          1
        )
      })
      __next_css_preload_promises__.push(thenable)
    }

    return thenable
  }
}

export function createFromReadableStream(
  readable: ReadableStream,
  onInitialFlightCSSLoaded?: () => void
): {
  readRoot: () => FlightData
} {
  const CSSResources: { id?: string; chunks: string[] }[] = []

  __next_css_callback__ = {}
  __next_css_preload_promises__ = []

  let resolveCSSFlush: () => void
  const CSSFlushedPromise = new Promise<void>((resolve) => {
    resolveCSSFlush = resolve
  })
  const CSSLoadedPromises: Promise<void>[] = []

  if (onInitialFlightCSSLoaded) {
    CSSFlushedPromise.then(() => Promise.all(CSSLoadedPromises)).then(() => {
      onInitialFlightCSSLoaded()
    })
  }

  function registerCSSCallback(id: number | null, chunkId: string) {
    const callbacks = (__next_css_callback__[chunkId] ||= [])

    let resolveChunkLoad: () => void
    const chunkLoadPromise = new Promise<void>((resolve) => {
      resolveChunkLoad = resolve
    })
    CSSLoadedPromises.push(chunkLoadPromise)

    callbacks.push(() => {
      if (id) {
        __webpack_require__(id)
      } else {
        const href = '/_next/' + chunkId
        const existingTag = document.querySelector(`link[href="${href}"]`)
        if (!existingTag) {
          const link = document.createElement('link')
          link.rel = 'stylesheet'
          link.href = href
          document.head.appendChild(link)
        }
      }
      resolveChunkLoad()
    })
  }

  function registerCSSResource(cssChunkInfoJSON: string): string {
    const data = JSON.parse(cssChunkInfoJSON)
    CSSResources.push(data)

    if (onInitialFlightCSSLoaded) {
      data.chunks.forEach((chunkId: string) => {
        registerCSSCallback(data.id, chunkId)
      })
    }

    // TODO-APP: Generate deterministic virtual modal IDs based on chunk path.
    const ID = (~~(99999999 * Math.random())).toString(16)
    return (
      `M${ID}:` +
      JSON.stringify({
        ...data,
        chunks: data.chunks.map((chunkId: string) => '__CSS__:' + chunkId),
      }) +
      '\n'
    )
  }

  function registerModuleResource(moduleChunkInfoJSON: string) {
    if (onInitialFlightCSSLoaded) {
      const data = JSON.parse(moduleChunkInfoJSON)
      data.chunks.forEach((chunkId: string) => {
        if (chunkId.endsWith('.css')) {
          registerCSSCallback(data.id, chunkId)
        }
      })
    }
  }

  let buffer = ''
  let cssFlushed = false
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  const cssTransform = new TransformStream({
    transform(chunk, controller) {
      const process = (line: string) => {
        if (line) {
          if (line.startsWith('CSS:')) {
            controller.enqueue(
              encoder.encode(registerCSSResource(line.slice(4).trim()))
            )
          } else {
            if (line.startsWith('M')) {
              registerModuleResource(line.slice(line.indexOf(':') + 1).trim())
            }
            controller.enqueue(encoder.encode(line))

            // We have to delay CSS flush after all modules are defined because
            // there could be CSS in lazy client modules' chunks.
            if (line.startsWith('J')) {
              if (onInitialFlightCSSLoaded && !cssFlushed) {
                cssFlushed = true
                resolveCSSFlush()
              }
            }
          }
        }
      }

      const data = decoder.decode(chunk)
      buffer += data

      for (let index; (index = buffer.indexOf('\n')) !== -1; ) {
        const line = buffer.slice(0, index + 1)
        buffer = buffer.slice(index + 1)
        process(line)
      }
    },
  })

  const response = originalCreateFromReadableStream(
    readable.pipeThrough(cssTransform)
  )

  const originalReadRoot = response.readRoot
  response.readRoot = () => {
    const root = originalReadRoot.call(response)
    root._css = CSSResources
    if (__next_css_preload_promises__.length) {
      throw __next_css_preload_promises__[0]
    }
    return root
  }
  return response
}

export function createFromFetch(response: Promise<Response>) {
  const { readable, writable } = new TransformStream()
  response.then((res) => {
    if (!res.body) throw new Error('Missing response body.')
    res.body?.pipeTo(writable)
  })
  return createFromReadableStream(readable)
}
