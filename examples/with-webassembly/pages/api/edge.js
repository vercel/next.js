import add_module from '../../add.wasm?module'

const instance$ = WebAssembly.instantiate(add_module)

export default async function edgeExample() {
  const { exports } = await instance$
  const number = exports.add_one(10)
  return new Response(`got: ${number}`)
}

export const config = { runtime: 'experimental-edge' }
