import crypto from 'crypto'

export type WasmBinding = {
  filePath: string
  name: string
}

export default function MiddlewareWasmLoader(this: any, source: Buffer) {
  const name = `wasm_${sha1(source)}`
  const filePath = `edge-chunks/${name}.wasm`
  const binding: WasmBinding = { filePath: `server/${filePath}`, name }
  this._module.buildInfo.nextWasmMiddlewareBinding = binding
  this.emitFile(`/${filePath}`, source, null)
  return `module.exports = ${name};`
}

export const raw = true

function sha1(source: string | Buffer) {
  return crypto.createHash('sha1').update(source).digest('hex')
}
