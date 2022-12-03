//@ts-ignore
import add_module from '../../add.wasm?module'

const instance$ = WebAssembly.instantiateStreaming(add_module)

export const config = { runtime: 'experimental-edge' }

export default async function handler() {
  const { exports } = (await instance$) as any
  const number = exports.add_one(10)

  return new Response(`got: ${number}`)
}
