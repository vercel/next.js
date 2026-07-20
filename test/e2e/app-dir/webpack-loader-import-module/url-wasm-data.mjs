import { add } from './add.wasm'

const imageUrl = new URL('./image.png', import.meta.url)

const dynamicModule = await import('./module.js')

const data = {
  mjsImageUrl: imageUrl.pathname,
  mjsWasmAddResult: add(10, 20),
  mjsDynamicValue: dynamicModule.dynamicValue,
}

export default data
