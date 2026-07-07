import { add } from './add.wasm'

const imageUrl = new URL('./image.png', import.meta.url)

const dynamicModule = await import('./module.js')

const data = {
  imageUrl: imageUrl.pathname,
  wasmAddResult: add(1, 2),
  dynamicValue: dynamicModule.dynamicValue,
}

export default data
