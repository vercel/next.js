import { getModuleBuildInfo } from './get-module-build-info'
import crypto from 'crypto'

function sha1(source: string | Buffer) {
  return crypto.createHash('sha1').update(source).digest('hex')
}

export default function MiddlewareWasmLoader(this: any, source: Buffer) {
  const name = `wasm_${sha1(source)}`
  const filePath = `edge-chunks/${name}.wasm`
  const buildInfo = getModuleBuildInfo(this._module)
  buildInfo.nextWasmMiddlewareBinding = { filePath: `server/${filePath}`, name }
  this.emitFile(`/${filePath}`, source, null)
  return `module.exports = ${name};`
}

export const raw = true
