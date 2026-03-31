import loaderUtils from 'next/dist/compiled/loader-utils3'
import { getModuleBuildInfo } from './get-module-build-info'

export default function MiddlewareAssetLoader(this: any, source: Buffer) {
  const name = loaderUtils.interpolateName(this, '[name].[hash].[ext]', {
    context: this.rootContext,
    content: source,
  })
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
