import { getRSCModuleInformation } from '../../analysis/get-page-static-info'
import { getModuleBuildInfo } from './get-module-build-info'

export default async function transformSource(
  this: any,
  source: string,
  sourceMap: any
) {
  // Avoid buffer to be consumed
  if (typeof source !== 'string') {
    throw new Error('Expected source to have been transformed to a string.')
  }

  const callback = this.async()

  // Assign the RSC meta information to buildInfo.
  const buildInfo = getModuleBuildInfo(this._module)
  buildInfo.rsc = getRSCModuleInformation(source, false)

  if (buildInfo.rsc.isClientRef) {
    // In case the client entry is a CJS module, we need to parse all the exports
    // to make sure that the flight manifest plugin can correctly generate the
    // manifest.
    // TODO: Currently SWC wraps CJS exports with `_export(exports, { ... })`,
    // which is tricky to statically analyze. But since the shape is known, we
    // use a regex to extract the exports as a workaround. See:
    // https://github.com/swc-project/swc/blob/5629e6b5291b416c8316587b67b5e83d011a8c22/crates/swc_ecma_transforms_module/src/util.rs#L295
    const matchExportObject = source.match(/\n_export\(exports, {([.\s\S]+)}/m)
    if (matchExportObject) {
      const matches: string[] = []
      const matchExports = matchExportObject[1].matchAll(/([^\s]+):/g)
      for (const match of matchExports) {
        matches.push(match[1])
      }
      buildInfo.rsc.clientRefs = matches
    }
  }

  // This is a server action entry module in the client layer. We need to attach
  // noop exports of `callServer` wrappers for each action.
  if (buildInfo.rsc?.actions) {
    source = `
import { callServer } from 'next/dist/esm/client/app-call-server'

function __build_action__(action, args) {
  return callServer(action.$$id, args)
}

${source}
`
  }

  return callback(null, source, sourceMap)
}
