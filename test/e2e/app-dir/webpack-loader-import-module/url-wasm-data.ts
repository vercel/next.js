import { add } from './add.wasm'

const imageUrl = new URL('./image.png', import.meta.url)

const data = {
  imageUrl: imageUrl.pathname,
  wasmAddResult: add(1, 2),
}

export default data
