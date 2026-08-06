import { Resvg, initWasm } from '@resvg/resvg-wasm'

type Props = {
  svg: string
  width: number
}

self.onmessage = async (event: MessageEvent<Props>) => {
  const { svg, width } = event.data

  try {
    await initWasm(fetch('/wasms/resvg.wasm'))

    const renderer = new Resvg(svg, {
      fitTo: {
        mode: 'width',
        value: Math.round(width),
      },
    })
    const pngBuffer = renderer.render().asPng()
    const blob = new Blob([new Uint8Array(pngBuffer)], {
      type: 'image/png',
    })

    self.postMessage({ success: true, blob })
  } catch (error) {
    self.postMessage({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
