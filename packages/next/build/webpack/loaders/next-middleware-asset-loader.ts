import { getModuleBuildInfo } from './get-module-build-info'
import crypto from 'crypto'

export default function MiddlewareAssetLoader(this: any, source: Buffer) {
  const name = sha1(source)
  const filePath = `edge-chunks/asset_${name}`
  const buildInfo = getModuleBuildInfo(this._module)
  buildInfo.nextAssetMiddlewareBinding = {
    filePath: `server/${filePath}`,
    name,
  }
  this.emitFile(filePath, source)
  return `module.exports = ${JSON.stringify(`blob:${name}`)}`
}

export const raw = true

function sha1(source: string | Buffer) {
  return crypto.createHash('sha1').update(source).digest('hex')
}
