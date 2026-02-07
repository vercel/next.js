import { add } from './add.wasm'

const imageUrl = new URL('./image.png', import.meta.url)

const data = {
  mjsImageUrl: imageUrl.pathname,
  mjsWasmAddResult: add(10, 20),
}

export default data
