import type { AddModuleExports } from '../../wasm'
// @ts-ignore
import addWasm from '../../add.wasm?module'

const module$ = WebAssembly.instantiate(addWasm)

export default async function handler() {
  const instance = (await module$) as any
  const exports = instance.exports as AddModuleExports
  const { add_one: addOne } = exports
  const number = addOne(10)

  return new Response(`got: ${number}`)
}

export const config = { runtime: 'edge' }
